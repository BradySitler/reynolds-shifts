import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { listTimeOff } from "@/lib/queries";
import { formatDateRange, today } from "@/lib/dates";
import { Empty, Flash, Section, StatusBadge } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { cancelTimeOff, requestTimeOff } from "../actions";

export default async function TimeOffPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const mine = await listTimeOff(eq(schema.timeOffRequests.userId, user.id), [desc(schema.timeOffRequests.startDate)], 30);
  const t = today();

  return (
    <>
      <h1 className="h1">Time off</h1>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      <form action={requestTimeOff} className="card space-y-4">
        <h2 className="h2">Request days off</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startDate" className="label">First day off</label>
            <input id="startDate" name="startDate" type="date" min={t} required className="input" />
          </div>
          <div>
            <label htmlFor="endDate" className="label">Last day off</label>
            <input id="endDate" name="endDate" type="date" min={t} className="input" />
          </div>
        </div>
        <p className="muted -mt-2">Just one day? Leave the last day blank.</p>
        <div>
          <label htmlFor="reason" className="label">Reason (optional)</label>
          <textarea id="reason" name="reason" rows={2} maxLength={500} className="input" placeholder="e.g. Family wedding" />
        </div>
        <button className="btn w-full sm:w-auto">Send request</button>
        {!user.departmentId && (
          <p className="text-sm text-amber-700">You aren&apos;t in a department yet, so this will go to the head pro.</p>
        )}
      </form>

      <Section title="My requests">
        {mine.length === 0 ? (
          <Empty>You haven&apos;t requested any time off.</Empty>
        ) : (
          <ul className="space-y-3">
            {mine.map((r) => (
              <li key={r.id} className="card flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{formatDateRange(r.startDate, r.endDate)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.reason && <p className="muted">{r.reason}</p>}
                  {r.decisionNote && <p className="text-sm text-stone-600">Pro&apos;s note: {r.decisionNote}</p>}
                </div>
                {r.status === "pending" && (
                  <form action={cancelTimeOff}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-sm font-medium text-red-700 underline">Cancel</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
