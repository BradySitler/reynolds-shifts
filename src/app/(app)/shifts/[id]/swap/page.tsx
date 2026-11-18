import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { upcomingShifts } from "@/lib/queries";
import { formatDate, formatShiftTime, today } from "@/lib/dates";
import { Flash } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { requestSwap } from "../../../actions";

const { users, departments, courses, shifts } = schema;

export default async function SwapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const shift = await db.query.shifts.findFirst({ where: eq(shifts.id, Number(id) || 0) });
  if (!shift || shift.userId !== user.id || shift.date < today()) notFound();

  const people = await db
    .select({ id: users.id, name: users.name, departmentId: users.departmentId, department: departments.name, course: courses.name, courseId: users.courseId })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .leftJoin(courses, eq(courses.id, users.courseId))
    .where(and(eq(users.active, true), ne(users.id, user.id)))
    .orderBy(asc(courses.name), asc(departments.name), asc(users.name));

  // Same department first, then everyone else grouped by course and department.
  const groups = new Map<string, typeof people>();
  const sameDept = people.filter((p) => p.departmentId === shift.departmentId);
  if (sameDept.length) groups.set("Same department", sameDept);
  for (const p of people) {
    if (p.departmentId === shift.departmentId) continue;
    const key = [p.course, p.department].filter(Boolean).join(" · ") || "Other";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const coworkerId = Number(str(sp.coworker)) || 0;
  const coworker = people.find((p) => p.id === coworkerId);
  const theirShifts = coworker ? await upcomingShifts(coworker.id, 21) : [];
  const dept = await db.query.departments.findFirst({ where: eq(departments.id, shift.departmentId) });

  return (
    <>
      <div>
        <Link href="/" className="text-sm font-medium text-brand">← Back</Link>
        <h1 className="h1 mt-1">Swap a shift</h1>
      </div>
      <Flash error={str(sp.error)} />

      <div className="card">
        <p className="muted">Your shift</p>
        <p className="text-lg font-semibold">{formatDate(shift.date)}</p>
        <p>{formatShiftTime(shift.startTime, shift.endTime)} · {dept?.name}</p>
      </div>

      <form method="get" className="card space-y-3">
        <label htmlFor="coworker" className="label">1. Who do you want to ask?</label>
        <select id="coworker" name="coworker" defaultValue={coworker?.id ?? ""} className="input" required>
          <option value="" disabled>Choose a coworker</option>
          {[...groups].map(([label, list]) => (
            <optgroup key={label} label={label}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn-secondary w-full sm:w-auto">{coworker ? "Change coworker" : "Next"}</button>
      </form>

      {coworker && (
        <form action={requestSwap} className="card space-y-4">
          <input type="hidden" name="shiftId" value={shift.id} />
          <input type="hidden" name="coworkerId" value={coworker.id} />
          <fieldset className="space-y-2">
            <legend className="label">2. Do you want one of {coworker.name.split(" ")[0]}&apos;s shifts in return?</legend>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 p-3">
              <input type="radio" name="coworkerShiftId" value="" defaultChecked className="h-5 w-5 accent-brand" />
              <span>No, just ask them to cover my shift</span>
            </label>
            {theirShifts.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 p-3">
                <input type="radio" name="coworkerShiftId" value={s.id} className="h-5 w-5 accent-brand" />
                <span>
                  Trade for <strong>{formatDate(s.date)}</strong> · {formatShiftTime(s.startTime, s.endTime)}
                  <span className="muted"> · {s.department}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="message" className="label">Message (optional)</label>
            <textarea id="message" name="message" rows={2} maxLength={500} className="input" placeholder="e.g. I have a doctor's appointment that morning" />
          </div>
          <button className="btn w-full">Send swap request to {coworker.name.split(" ")[0]}</button>
          <p className="muted">
            {coworker.name.split(" ")[0]} accepts first, then your assistant pro approves it. Keep working your shift until it&apos;s approved.
          </p>
        </form>
      )}
    </>
  );
}
