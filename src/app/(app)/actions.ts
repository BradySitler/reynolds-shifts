"use server";

import { and, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { canApprove, approverEmails } from "@/lib/permissions";
import { appUrl, sendEmail } from "@/lib/email";
import { done, fail } from "@/lib/flash";
import { formatDate, formatDateRange, formatShiftTime, isIsoDate, today } from "@/lib/dates";

const { users, shifts, departments, timeOffRequests, swapRequests } = schema;

const OPEN_SWAP = ["awaiting_coworker", "awaiting_approval"] as const;

function int(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function text(v: FormDataEntryValue | null, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}
const first = (name: string) => name.split(" ")[0];

/* ------------------------------ Time off ------------------------------ */

export async function requestTimeOff(formData: FormData) {
  const user = await requireUser();
  const startDate = text(formData.get("startDate"));
  const endDate = text(formData.get("endDate")) || startDate;
  const reason = text(formData.get("reason"));
  const back = "/time-off";

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail(back, "Pick the dates you need off.");
  if (endDate < startDate) fail(back, "The last day off can't be before the first day.");
  if (startDate < today()) fail(back, "You can't request time off for a day that has already passed.");

  const [req] = await db
    .insert(timeOffRequests)
    .values({ userId: user.id, departmentId: user.departmentId, startDate, endDate, reason: reason || null })
    .returning();

  const scheduled = await db
    .select({ date: shifts.date, startTime: shifts.startTime, endTime: shifts.endTime })
    .from(shifts)
    .where(and(eq(shifts.userId, user.id), gte(shifts.date, startDate), lte(shifts.date, endDate)));

  await sendEmail({
    to: await approverEmails(user.departmentId),
    subject: `Time-off request: ${user.name}, ${formatDateRange(startDate, endDate)}`,
    text:
      `${user.name} asked for time off ${formatDateRange(startDate, endDate)}.\n` +
      (reason ? `Reason: ${reason}\n` : "") +
      (scheduled.length
        ? `\nThey're scheduled during that time:\n${scheduled.map((s) => `  • ${formatDate(s.date)} ${formatShiftTime(s.startTime, s.endTime)}`).join("\n")}\n`
        : "\nThey have no shifts scheduled during that time.\n") +
      `\nApprove or deny: ${appUrl("/approvals")}\n\n(Request #${req.id})`,
  });

  revalidatePath("/", "layout");
  done(back, "Request sent. You'll get an email when it's approved or denied.");
}

export async function cancelTimeOff(formData: FormData) {
  const user = await requireUser();
  await db
    .update(timeOffRequests)
    .set({ status: "cancelled" })
    .where(and(eq(timeOffRequests.id, int(formData.get("id"))), eq(timeOffRequests.userId, user.id), eq(timeOffRequests.status, "pending")));
  revalidatePath("/", "layout");
  done("/time-off", "Request cancelled.");
}

export async function decideTimeOff(formData: FormData) {
  const user = await requireUser();
  const id = int(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const note = text(formData.get("note"));
  const back = "/approvals";

  const req = await db.query.timeOffRequests.findFirst({ where: eq(timeOffRequests.id, id) });
  if (!req || req.status !== "pending") fail(back, "That request was already handled.");
  const dept = req.departmentId ? await db.query.departments.findFirst({ where: eq(departments.id, req.departmentId) }) : null;
  if (!canApprove(user, dept)) fail(back, "You can't approve requests for that department.");

  await db
    .update(timeOffRequests)
    .set({ status: approve ? "approved" : "denied", decidedById: user.id, decidedAt: new Date(), decisionNote: note || null })
    .where(and(eq(timeOffRequests.id, id), eq(timeOffRequests.status, "pending")));

  const employee = await db.query.users.findFirst({ where: eq(users.id, req.userId) });
  if (employee) {
    await sendEmail({
      to: employee.email,
      subject: `Time off ${approve ? "approved" : "denied"}: ${formatDateRange(req.startDate, req.endDate)}`,
      text:
        `Hi ${first(employee.name)},\n\n${user.name} ${approve ? "approved" : "denied"} your time off for ${formatDateRange(req.startDate, req.endDate)}.\n` +
        (note ? `\nNote: ${note}\n` : "") +
        `\n${appUrl("/time-off")}`,
    });
  }
  revalidatePath("/", "layout");
  done(back, `Time off ${approve ? "approved" : "denied"}. ${employee ? first(employee.name) : "They"} will get an email.`);
}

/* ----------------------------- Shift swaps ---------------------------- */

export async function requestSwap(formData: FormData) {
  const user = await requireUser();
  const shiftId = int(formData.get("shiftId"));
  const coworkerId = int(formData.get("coworkerId"));
  const coworkerShiftId = int(formData.get("coworkerShiftId")) || null;
  const message = text(formData.get("message"));
  const back = `/shifts/${shiftId}/swap?coworker=${coworkerId}`;

  const shift = await db.query.shifts.findFirst({ where: eq(shifts.id, shiftId) });
  if (!shift || shift.userId !== user.id) fail("/", "You can only swap your own shifts.");
  if (shift.date < today()) fail("/", "That shift has already passed.");
  if (coworkerId === user.id) fail(back, "Pick a coworker other than yourself.");

  const coworker = await db.query.users.findFirst({ where: eq(users.id, coworkerId) });
  if (!coworker?.active) fail(back, "Pick a coworker to swap with.");

  let trade: typeof shift | undefined;
  if (coworkerShiftId) {
    trade = await db.query.shifts.findFirst({ where: eq(shifts.id, coworkerShiftId) });
    if (!trade || trade.userId !== coworker.id || trade.date < today()) fail(back, "That shift of theirs isn't available to trade.");
  }

  const open = await db.query.swapRequests.findFirst({
    where: and(eq(swapRequests.shiftId, shiftId), inArray(swapRequests.status, [...OPEN_SWAP])),
  });
  if (open) fail("/", "You already have an open swap request for that shift. Cancel it first to ask someone else.");

  await db.insert(swapRequests).values({ shiftId, requesterId: user.id, coworkerId, coworkerShiftId, message: message || null });

  await sendEmail({
    to: coworker.email,
    subject: `${user.name} asked you to ${trade ? "trade" : "cover"} a shift`,
    text:
      `Hi ${first(coworker.name)},\n\n${user.name} asked if you can work their shift on ${formatDate(shift.date)}, ${formatShiftTime(shift.startTime, shift.endTime)}.\n` +
      (trade ? `In return they'd work your shift on ${formatDate(trade.date)}, ${formatShiftTime(trade.startTime, trade.endTime)}.\n` : "") +
      (message ? `\nMessage: ${message}\n` : "") +
      `\nAccept or decline: ${appUrl("/")}\n\nIf you accept, it still needs your assistant pro's approval.`,
  });

  revalidatePath("/", "layout");
  done("/", `Swap request sent to ${coworker.name}.`);
}

export async function respondSwap(formData: FormData) {
  const user = await requireUser();
  const id = int(formData.get("id"));
  const accept = formData.get("response") === "accept";

  const [swap] = await db
    .update(swapRequests)
    .set({ status: accept ? "awaiting_approval" : "declined" })
    .where(and(eq(swapRequests.id, id), eq(swapRequests.coworkerId, user.id), eq(swapRequests.status, "awaiting_coworker")))
    .returning();
  if (!swap) fail("/", "That swap request is no longer open.");

  const shift = await db.query.shifts.findFirst({ where: eq(shifts.id, swap.shiftId) });
  const requester = await db.query.users.findFirst({ where: eq(users.id, swap.requesterId) });
  const when = shift ? `${formatDate(shift.date)}, ${formatShiftTime(shift.startTime, shift.endTime)}` : "your shift";

  if (requester) {
    await sendEmail({
      to: requester.email,
      subject: `${user.name} ${accept ? "accepted" : "declined"} your swap request`,
      text: accept
        ? `Hi ${first(requester.name)},\n\n${user.name} accepted your swap for ${when}. It's now waiting on your assistant pro's approval. Keep working the shift until it's approved.\n\n${appUrl("/")}`
        : `Hi ${first(requester.name)},\n\n${user.name} can't take your shift on ${when}. You're still scheduled. You can ask someone else from the app.\n\n${appUrl("/")}`,
    });
  }
  if (accept && shift) {
    await sendEmail({
      to: await approverEmails(shift.departmentId),
      subject: `Shift swap to approve: ${requester?.name} → ${user.name}, ${formatDate(shift.date)}`,
      text: `${requester?.name} and ${user.name} agreed to swap the shift on ${when}.\n\nApprove or deny: ${appUrl("/approvals")}`,
    });
  }
  revalidatePath("/", "layout");
  done("/", accept ? "Accepted. Your assistant pro will approve or deny it." : "Declined. We let them know.");
}

export async function cancelSwap(formData: FormData) {
  const user = await requireUser();
  await db
    .update(swapRequests)
    .set({ status: "cancelled" })
    .where(and(eq(swapRequests.id, int(formData.get("id"))), eq(swapRequests.requesterId, user.id), inArray(swapRequests.status, [...OPEN_SWAP])));
  revalidatePath("/", "layout");
  done("/", "Swap request cancelled.");
}

export async function decideSwap(formData: FormData) {
  const user = await requireUser();
  const id = int(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const note = text(formData.get("note"));
  const back = "/approvals";

  const swap = await db.query.swapRequests.findFirst({ where: eq(swapRequests.id, id) });
  if (!swap || swap.status !== "awaiting_approval") fail(back, "That swap was already handled.");
  const shift = await db.query.shifts.findFirst({ where: eq(shifts.id, swap.shiftId) });
  const dept = shift ? await db.query.departments.findFirst({ where: eq(departments.id, shift.departmentId) }) : null;
  if (!shift || !canApprove(user, dept)) fail(back, "You can't approve swaps for that department.");

  let problem = "";
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(swapRequests)
      .set({ status: approve ? "approved" : "denied", decidedById: user.id, decidedAt: new Date(), decisionNote: note || null })
      .where(and(eq(swapRequests.id, id), eq(swapRequests.status, "awaiting_approval")))
      .returning();
    if (!claimed) {
      problem = "That swap was already handled.";
      return;
    }
    if (!approve) return;

    const [moved] = await tx
      .update(shifts)
      .set({ userId: swap.coworkerId })
      .where(and(eq(shifts.id, swap.shiftId), eq(shifts.userId, swap.requesterId)))
      .returning();
    if (!moved) {
      problem = "The schedule changed since this was requested, so the swap can't be applied.";
      tx.rollback();
    }
    if (swap.coworkerShiftId) {
      const [back] = await tx
        .update(shifts)
        .set({ userId: swap.requesterId })
        .where(and(eq(shifts.id, swap.coworkerShiftId), eq(shifts.userId, swap.coworkerId)))
        .returning();
      if (!back) {
        problem = "The schedule changed since this was requested, so the swap can't be applied.";
        tx.rollback();
      }
    }
    // Any other open requests for these shifts no longer make sense.
    const touched = [swap.shiftId, swap.coworkerShiftId].filter((x): x is number => !!x);
    await tx
      .update(swapRequests)
      .set({ status: "cancelled" })
      .where(
        and(
          ne(swapRequests.id, id),
          inArray(swapRequests.status, [...OPEN_SWAP]),
          or(inArray(swapRequests.shiftId, touched), inArray(swapRequests.coworkerShiftId, touched)),
        ),
      );
  }).catch((err) => {
    if (!problem) throw err;
  });
  if (problem) fail(back, problem);

  const people = await db.select().from(users).where(inArray(users.id, [swap.requesterId, swap.coworkerId]));
  const requester = people.find((p) => p.id === swap.requesterId);
  const coworker = people.find((p) => p.id === swap.coworkerId);
  const when = `${formatDate(shift.date)}, ${formatShiftTime(shift.startTime, shift.endTime)}`;
  const verdict = approve
    ? `${user.name} approved the swap. ${coworker?.name} now works ${when}.`
    : `${user.name} denied the swap for ${when}. ${requester?.name} is still scheduled.`;
  await sendEmail({
    to: people.map((p) => p.email),
    subject: `Shift swap ${approve ? "approved" : "denied"}: ${formatDate(shift.date)}`,
    text: `${verdict}\n` + (note ? `\nNote: ${note}\n` : "") + `\n${appUrl("/")}`,
  });

  revalidatePath("/", "layout");
  done(back, approve ? "Swap approved and the schedule is updated." : "Swap denied.");
}
