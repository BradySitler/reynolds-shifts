import Link from "next/link";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { schema } from "@/db";
import { requireUser, isManager } from "@/lib/auth";
import { pendingApprovalCount, listSwaps, upcomingShifts } from "@/lib/queries";
import { formatDate, formatShiftTime, today, addDays } from "@/lib/dates";
import { Empty, Flash, Section } from "@/components/ui";
import { SwapSummary } from "@/components/swap-card";
import { str, type SearchParams } from "@/lib/flash";
import { cancelSwap, respondSwap } from "./actions";

const { swapRequests, shifts } = schema;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [myShifts, swaps, approvals] = await Promise.all([
    upcomingShifts(user.id),
    listSwaps(
        and(
          or(eq(swapRequests.requesterId, user.id), eq(swapRequests.coworkerId, user.id)),
          or(inArray(swapRequests.status, ["awaiting_coworker", "awaiting_approval"]), gte(shifts.date, addDays(today(), -7))),
        ),
      [desc(swapRequests.createdAt)],
      20,
    ),
    pendingApprovalCount(user),
  ]);

  const askingMe = swaps.filter((s) => s.coworkerId === user.id && s.status === "awaiting_coworker");
  const others = swaps.filter((s) => !askingMe.includes(s));
  const openShiftIds = new Set(
    swaps.filter((s) => s.requesterId === user.id && ["awaiting_coworker", "awaiting_approval"].includes(s.status)).map((s) => s.shiftId),
  );

  return (
    <>
      <div>
        <h1 className="h1">Hi, {user.name.split(" ")[0]}</h1>
        <p className="muted">Here&apos;s what&apos;s coming up.</p>
      </div>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      {isManager(user.role) && approvals > 0 && (
        <Link href="/approvals" className="card flex items-center justify-between border-amber-300 bg-amber-50">
          <span className="font-semibold">
            {approvals} request{approvals === 1 ? "" : "s"} waiting for your approval
          </span>
          <span className="text-brand">Review →</span>
        </Link>
      )}

      {askingMe.length > 0 && (
        <Section title="Coworkers asking you to swap">
          {askingMe.map((s) => (
            <div key={s.id} className="card space-y-3 border-sky-300">
              <SwapSummary s={s} viewerId={user.id} />
              <div className="flex gap-2">
                <form action={respondSwap} className="flex-1">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="response" value="accept" />
                  <button className="btn w-full">Accept</button>
                </form>
                <form action={respondSwap} className="flex-1">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="response" value="decline" />
                  <button className="btn-secondary w-full">Decline</button>
                </form>
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title="My upcoming shifts" action={<Link href="/schedule" className="text-sm font-medium text-brand">Full schedule →</Link>}>
        {myShifts.length === 0 ? (
          <Empty>No upcoming shifts posted yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {myShifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{formatDate(s.date)}</p>
                  <p className="text-sm">{formatShiftTime(s.startTime, s.endTime, s.label)}</p>
                  <p className="muted">
                    {s.department} · {s.course}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                {openShiftIds.has(s.id) ? (
                  <span className="text-xs font-medium text-stone-500">Swap requested</span>
                ) : (
                  <Link href={`/shifts/${s.id}/swap`} className="btn-secondary shrink-0">
                    Swap
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="My swap requests">
        {others.length === 0 ? (
          <Empty>No swap requests yet. Tap “Swap” on a shift to ask a coworker.</Empty>
        ) : (
          <div className="space-y-3">
            {others.map((s) => (
              <div key={s.id} className="card space-y-3">
                <SwapSummary s={s} viewerId={user.id} />
                {s.requesterId === user.id && (s.status === "awaiting_coworker" || s.status === "awaiting_approval") && (
                  <form action={cancelSwap}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-sm font-medium text-red-700 underline">Cancel request</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
