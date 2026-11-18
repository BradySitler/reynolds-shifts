import { and, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireManager } from "@/lib/auth";
import { pendingApprovals, recentDecisions, type TimeOffRow } from "@/lib/queries";
import { formatDate, formatDateRange, formatShiftTime } from "@/lib/dates";
import { Empty, Flash, Section, StatusBadge } from "@/components/ui";
import { SwapSummary } from "@/components/swap-card";
import { str, type SearchParams } from "@/lib/flash";
import { decideSwap, decideTimeOff } from "../actions";

function Decide({ id, action }: { id: number; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" maxLength={300} className="input" placeholder="Note to employee (optional)" aria-label="Note to employee" />
      <div className="flex gap-2">
        <button name="decision" value="approve" className="btn flex-1">Approve</button>
        <button name="decision" value="deny" className="btn-danger flex-1">Deny</button>
      </div>
    </form>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireManager();
  const [{ timeOff, swaps }, recent] = await Promise.all([pendingApprovals(user), recentDecisions(user)]);

  // Shifts each time-off requester is scheduled for during the dates they asked off.
  const conflicts = new Map<number, { date: string; startTime: string | null; endTime: string | null; label: string | null }[]>();
  if (timeOff.length) {
    const s = schema.shifts;
    const rows = await db
      .select({ userId: s.userId, date: s.date, startTime: s.startTime, endTime: s.endTime, label: s.label })
      .from(s)
      .where(
        and(
          inArray(s.userId, timeOff.map((r) => r.userId)),
          gte(s.date, timeOff.reduce((m, r) => (r.startDate < m ? r.startDate : m), timeOff[0].startDate)),
          lte(s.date, timeOff.reduce((m, r) => (r.endDate > m ? r.endDate : m), timeOff[0].endDate)),
        ),
      );
    for (const r of timeOff) {
      conflicts.set(r.id, rows.filter((x) => x.userId === r.userId && x.date >= r.startDate && x.date <= r.endDate));
    }
  }

  const recentAll = [
    ...recent.timeOff.map((r) => ({ kind: "Time off" as const, key: `t${r.id}`, who: r.userName, when: formatDateRange(r.startDate, r.endDate), status: r.status })),
    ...recent.swaps.map((s) => ({ kind: "Swap" as const, key: `s${s.id}`, who: `${s.requesterName} → ${s.coworkerName}`, when: formatDate(s.shiftDate), status: s.status })),
  ];

  return (
    <>
      <h1 className="h1">Approvals</h1>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      <Section title={`Time off (${timeOff.length})`}>
        {timeOff.length === 0 ? (
          <Empty>No time-off requests waiting.</Empty>
        ) : (
          timeOff.map((r: TimeOffRow) => {
            const c = conflicts.get(r.id) ?? [];
            return (
              <div key={r.id} className="card space-y-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.userName}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm"><span className="font-medium">{formatDateRange(r.startDate, r.endDate)}</span>{r.department && <span className="muted"> · {r.department}, {r.course}</span>}</p>
                  {r.reason && <p className="text-sm italic text-stone-600">&ldquo;{r.reason}&rdquo;</p>}
                  {c.length > 0 ? (
                    <p className="text-sm text-amber-800">
                      ⚠️ Scheduled: {c.map((x) => `${formatDate(x.date)} ${formatShiftTime(x.startTime, x.endTime, x.label)}`).join("; ")}
                    </p>
                  ) : (
                    <p className="muted">Not scheduled on those days.</p>
                  )}
                </div>
                <Decide id={r.id} action={decideTimeOff} />
              </div>
            );
          })
        )}
      </Section>

      <Section title={`Shift swaps (${swaps.length})`}>
        {swaps.length === 0 ? (
          <Empty>No shift swaps waiting.</Empty>
        ) : (
          swaps.map((s) => (
            <div key={s.id} className="card space-y-3">
              <SwapSummary s={s} />
              <p className="muted">{s.coworkerName} already agreed. Approving updates the schedule.</p>
              <Decide id={s.id} action={decideSwap} />
            </div>
          ))
        )}
      </Section>

      {recentAll.length > 0 && (
        <Section title="Recently decided">
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white text-sm">
            {recentAll.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2 p-3">
                <span><span className="muted">{r.kind}:</span> {r.who} · {r.when}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
