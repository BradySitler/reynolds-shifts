"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { Role, User } from "@/db/schema";
import { normalizeEmail, requireAdmin } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { done, fail } from "@/lib/flash";
import { parseDate, parseTime, pick, readSheet } from "@/lib/spreadsheet";
import { appUrl, sendEmail } from "@/lib/email";
import { formatDate, formatShiftTime } from "@/lib/dates";

const { courses, departments, users, shifts } = schema;
const ROLES: Role[] = ["employee", "assistant_pro", "head_pro", "admin"];

const int = (v: FormDataEntryValue | null) => Number(v) || 0;
const text = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

function assertCourse(user: User, courseId: number, back: string) {
  if (!canManageCourse(user, courseId)) fail(back, "You can only manage your own course.");
}

/* ----------------------- Courses and departments ---------------------- */

export async function addCourse(formData: FormData) {
  const user = await requireAdmin();
  if (user.role !== "admin") fail("/admin", "Only admins can add courses.");
  const name = text(formData.get("name"));
  if (!name) fail("/admin", "Enter a course name.");
  const [c] = await db.insert(courses).values({ name }).onConflictDoNothing().returning();
  if (!c) fail("/admin", `${name} already exists.`);
  // Start every course with the two departments everyone has.
  await db.insert(departments).values([{ courseId: c.id, name: "Cart Attendants" }, { courseId: c.id, name: "Starters" }]);
  revalidatePath("/", "layout");
  done("/admin", `Added ${name}.`);
}

export async function addDepartment(formData: FormData) {
  const user = await requireAdmin();
  const courseId = int(formData.get("courseId"));
  const name = text(formData.get("name"));
  assertCourse(user, courseId, "/admin");
  if (!name) fail("/admin", "Enter a department name.");
  const [d] = await db.insert(departments).values({ courseId, name }).onConflictDoNothing().returning();
  if (!d) fail("/admin", `That course already has ${name}.`);
  revalidatePath("/", "layout");
  done("/admin", `Added ${name}.`);
}

export async function setApprover(formData: FormData) {
  const user = await requireAdmin();
  const dept = await db.query.departments.findFirst({ where: eq(departments.id, int(formData.get("departmentId"))) });
  if (!dept) fail("/admin", "Department not found.");
  assertCourse(user, dept.courseId, "/admin");
  const approverId = int(formData.get("approverId")) || null;
  if (approverId) {
    const a = await db.query.users.findFirst({ where: eq(users.id, approverId) });
    if (!a || a.role === "employee") fail("/admin", "The approver has to be an assistant pro, head pro or admin.");
  }
  await db.update(departments).set({ approverId }).where(eq(departments.id, dept.id));
  revalidatePath("/", "layout");
  done("/admin", `Saved who approves ${dept.name}.`);
}

/* ------------------------------ Employees ----------------------------- */

export async function saveEmployee(formData: FormData) {
  const user = await requireAdmin();
  const id = int(formData.get("id"));
  const back = id ? `/admin/employees?edit=${id}` : "/admin/employees";
  const name = text(formData.get("name"));
  const email = normalizeEmail(text(formData.get("email")));
  const phone = text(formData.get("phone"), 40) || null;
  const role = text(formData.get("role")) as Role;
  const departmentId = int(formData.get("departmentId")) || null;
  const active = id ? formData.get("active") === "on" : true;

  if (!name) fail(back, "Enter a name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(back, "Enter a valid email address.");
  if (!ROLES.includes(role)) fail(back, "Pick a role.");
  if (role === "admin" && user.role !== "admin") fail(back, "Only admins can make someone an admin.");

  let courseId = int(formData.get("courseId")) || null;
  if (departmentId) {
    const d = await db.query.departments.findFirst({ where: eq(departments.id, departmentId) });
    if (!d) fail(back, "Department not found.");
    courseId = d.courseId;
  }
  if (user.role !== "admin") {
    if (!courseId) courseId = user.courseId;
    assertCourse(user, courseId!, back);
  }

  const values = { name, email, phone, role, courseId, departmentId, active };
  if (id) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) fail("/admin/employees", "Employee not found.");
    if (user.role !== "admin" && (existing.role === "admin" || !canManageCourse(user, existing.courseId))) {
      fail(back, "You can't edit that person.");
    }
    if (existing.id === user.id && (!active || role !== user.role)) fail(back, "You can't change your own role or deactivate yourself.");
    try {
      await db.update(users).set(values).where(eq(users.id, id));
    } catch {
      fail(back, "Someone else already uses that email.");
    }
    if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  } else {
    const [created] = await db.insert(users).values(values).onConflictDoNothing().returning();
    if (!created) fail(back, "Someone already uses that email.");
  }
  revalidatePath("/", "layout");
  done("/admin/employees", `Saved ${name}.`);
}

/* ---------------------------- Spreadsheets ---------------------------- */

async function departmentsFor(courseId: number) {
  const list = await db.select().from(departments).where(eq(departments.courseId, courseId));
  const byName = new Map(list.map((d) => [d.name.toLowerCase(), d]));
  // Let "Cart Attendant", "cart", "Starter" etc. match.
  return (raw: string) => {
    const k = raw.trim().toLowerCase();
    if (!k) return undefined;
    return byName.get(k) ?? list.find((d) => d.name.toLowerCase().startsWith(k) || k.startsWith(d.name.toLowerCase().replace(/s$/, "")));
  };
}

function parseRole(raw: string): Role | undefined {
  const k = raw.trim().toLowerCase();
  if (!k) return "employee";
  if (k.includes("assistant")) return "assistant_pro";
  if (k.includes("head")) return "head_pro";
  if (k === "admin") return "admin";
  if (["employee", "staff", "cart attendant", "starter"].includes(k)) return "employee";
  return undefined;
}

export async function uploadRoster(formData: FormData) {
  const user = await requireAdmin();
  const back = "/admin/upload";
  const courseId = int(formData.get("courseId"));
  assertCourse(user, courseId, back);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail(back, "Choose a spreadsheet to upload.");

  let rows: Record<string, string>[];
  try {
    rows = await readSheet(file);
  } catch (e) {
    fail(back, (e as Error).message);
  }
  const findDept = await departmentsFor(courseId);
  const errors: string[] = [];
  const toSave: (typeof users.$inferInsert)[] = [];
  for (const r of rows) {
    const name = pick(r, "name", "employee", "full name");
    const email = normalizeEmail(pick(r, "email", "email address", "e-mail"));
    const deptRaw = pick(r, "department", "position", "job", "dept");
    const dept = findDept(deptRaw);
    const role = parseRole(pick(r, "role", "title"));
    if (!name && !email) continue;
    if (!name || !email.includes("@")) errors.push(`Row ${r.__row}: needs a name and an email.`);
    else if (deptRaw && !dept) errors.push(`Row ${r.__row}: no department called “${deptRaw}”.`);
    else if (!role || (role === "admin" && user.role !== "admin")) errors.push(`Row ${r.__row}: unknown role “${pick(r, "role", "title")}”.`);
    else toSave.push({ name, email, phone: pick(r, "phone", "cell", "mobile", "phone number") || null, role, courseId, departmentId: dept?.id ?? null, active: true });
  }
  if (errors.length) fail(back, `Nothing was saved. Fix these and upload again: ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ""}`);
  if (!toSave.length) fail(back, "No employees found. The first row should have headers like Name, Email, Phone, Department, Role.");

  // Don't let a head pro's upload overwrite someone at another course or an admin.
  const existing = await db.select().from(users).where(inArray(users.email, toSave.map((u) => u.email)));
  const blocked = existing.filter((e) => user.role !== "admin" && (e.role === "admin" || (e.courseId && e.courseId !== courseId)));
  if (blocked.length) fail(back, `Nothing was saved. These people belong to another course: ${blocked.map((b) => b.email).join(", ")}`);

  for (const u of toSave) {
    await db
      .insert(users)
      .values(u)
      .onConflictDoUpdate({ target: users.email, set: { name: u.name, phone: u.phone, role: u.role, courseId: u.courseId, departmentId: u.departmentId, active: true } });
  }
  revalidatePath("/", "layout");
  done(back, `Saved ${toSave.length} employees.`);
}

export async function uploadSchedule(formData: FormData) {
  const user = await requireAdmin();
  const back = "/admin/upload";
  const courseId = int(formData.get("courseId"));
  assertCourse(user, courseId, back);
  const replace = formData.get("replace") === "on";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail(back, "Choose a spreadsheet to upload.");

  let rows: Record<string, string>[];
  try {
    rows = await readSheet(file);
  } catch (e) {
    fail(back, (e as Error).message);
  }

  const findDept = await departmentsFor(courseId);
  const people = await db.select().from(users).where(eq(users.active, true));
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const byName = new Map<string, User[]>();
  for (const p of people) byName.set(p.name.toLowerCase(), [...(byName.get(p.name.toLowerCase()) ?? []), p]);

  const errors: string[] = [];
  const toInsert: (typeof shifts.$inferInsert)[] = [];
  for (const r of rows) {
    const who = pick(r, "employee", "name", "email");
    const dateRaw = pick(r, "date", "day");
    if (!who && !dateRaw) continue;
    const date = parseDate(dateRaw);
    const startTime = parseTime(pick(r, "start", "start time", "in", "time in"));
    const endRaw = pick(r, "end", "end time", "out", "time out");
    const endTime = endRaw ? parseTime(endRaw) : null;

    let person = byEmail.get(normalizeEmail(who));
    if (!person) {
      const matches = (byName.get(who.trim().toLowerCase()) ?? []).filter((p) => p.courseId === courseId);
      if (matches.length > 1) {
        errors.push(`Row ${r.__row}: two people are named “${who}”. Use their email instead.`);
        continue;
      }
      person = matches[0];
    }
    const deptRaw = pick(r, "department", "position", "job", "dept");
    const dept = deptRaw ? findDept(deptRaw) : undefined;
    const departmentId = dept?.id ?? (person?.courseId === courseId ? person.departmentId : null);

    if (!person) errors.push(`Row ${r.__row}: no employee “${who}” at this course.`);
    else if (!date) errors.push(`Row ${r.__row}: can't read the date “${dateRaw}”.`);
    else if (!startTime) errors.push(`Row ${r.__row}: can't read the start time.`);
    else if (endRaw && !endTime) errors.push(`Row ${r.__row}: can't read the end time “${endRaw}”.`);
    else if (deptRaw && !dept) errors.push(`Row ${r.__row}: no department called “${deptRaw}”.`);
    else if (!departmentId) errors.push(`Row ${r.__row}: ${person.name} has no department here. Add a Department column.`);
    else toInsert.push({ userId: person.id, departmentId, date, startTime, endTime, note: pick(r, "note", "notes") || null });
  }
  if (errors.length) fail(back, `Nothing was saved. Fix these and upload again: ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ""}`);
  if (!toInsert.length) fail(back, "No shifts found. The first row should have headers like Date, Employee, Start, End.");

  const dates = toInsert.map((s) => s.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const deptIds = [...new Set(toInsert.map((s) => s.departmentId))];
  let replaced = 0;
  await db.transaction(async (tx) => {
    if (replace) {
      const del = await tx
        .delete(shifts)
        .where(and(inArray(shifts.departmentId, deptIds), gte(shifts.date, from), lte(shifts.date, to)))
        .returning({ id: shifts.id });
      replaced = del.length;
    }
    await tx.insert(shifts).values(toInsert);
  });
  if (formData.get("notify") === "on") {
    const ids = [...new Set(toInsert.map((s) => s.userId))];
    for (const id of ids) {
      const p = people.find((x) => x.id === id)!;
      const mine = toInsert.filter((s) => s.userId === id).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
      await sendEmail({
        to: p.email,
        subject: `Your shifts: ${formatDate(from)} – ${formatDate(to)}`,
        text:
          `Hi ${p.name.split(" ")[0]},\n\nThe schedule is posted. You're working:\n\n` +
          mine.map((s) => `  • ${formatDate(s.date)}  ${formatShiftTime(s.startTime, s.endTime ?? null)}`).join("\n") +
          `\n\nNeed a day off or a swap? ${appUrl("/")}`,
      });
    }
  }
  revalidatePath("/", "layout");
  done(back, `Posted ${toInsert.length} shifts for ${from} to ${to}.${replace && replaced ? ` Replaced ${replaced} old shifts.` : ""}`);
}
