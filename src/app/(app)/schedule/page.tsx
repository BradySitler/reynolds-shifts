import Link from "next/link";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, isManager } from "@/lib/auth";
import { allCourses, allDepartments } from "@/lib/queries";
import { addDays, formatDate, formatShiftTime, isIsoDate, today, weekStart } from "@/lib/dates";
import { Empty } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";

const { users, shifts, departments, timeOffRequests } = schema;

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [courseList, deptList] = await Promise.all([allCourses(), allDepartments()]);

  const courseId = Number(str(sp.course)) || user.courseId || courseList[0]?.id || 0;
  const deptParam = str(sp.dept);
  const deptId = deptParam === undefined ? (user.departmentId ?? 0) : Number(deptParam) || 0;
  const weekParam = str(sp.week);
  const start = weekStart(weekParam && isIsoDate(weekParam) ? weekParam : today());
  const end = addDays(start, 6);

  const where: SQL[] = [gte(shifts.date, start), lte(shifts.date, end), eq(departments.courseId, courseId)];
  if (deptId) where.push(eq(shifts.departmentId, deptId));

  const rows = await db
    .select({ id: shifts.id, date: shifts.date, startTime: shifts.startTime, endTime: shifts.endTime, note: shifts.note, userId: users.id, name: users.name, department: departments.name })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(departments, eq(departments.id, shifts.departmentId))
    .where(and(...where))
    .orderBy(asc(shifts.date), asc(departments.name), asc(shifts.startTime), asc(users.name));

  const offWhere: SQL[] = [eq(timeOffRequests.status, "approved"), lte(timeOffRequests.startDate, end), gte(timeOffRequests.endDate, start), eq(departments.courseId, courseId)];
  if (deptId) offWhere.push(eq(timeOffRequests.departmentId, deptId));
  const off = isManager(user.role)
    ? await db
        .select({ name: users.name, startDate: timeOffRequests.startDate, endDate: timeOffRequests.endDate })
        .from(timeOffRequests)
        .innerJoin(users, eq(users.id, timeOffRequests.userId))
        .innerJoin(departments, eq(departments.id, timeOffRequests.departmentId))
        .where(and(...offWhere))
    : [];

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const link = (week: string) => `/schedule?${new URLSearchParams({ course: String(courseId), dept: String(deptId), week })}`;
  const t = today();

  return (
    <>
      <h1 className="h1">Schedule</h1>
      <form method="get" className="card grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="week" value={start} />
        <select name="course" defaultValue={courseId} className="input" aria-label="Course">
          {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="dept" defaultValue={deptId} className="input" aria-label="Department">
          <option value="0">All departments</option>
          {deptList.filter((d) => d.courseId === courseId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn">Show</button>
      </form>

      <div className="flex items-center justify-between gap-2">
        <Link href={link(addDays(start, -7))} className="btn-secondary">← Prev</Link>
        <p className="text-center font-semibold">{formatDate(start)} – {formatDate(end)}</p>
        <Link href={link(addDays(start, 7))} className="btn-secondary">Next →</Link>
      </div>

      {rows.length === 0 && <Empty>No shifts posted for this week yet.</Empty>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {days.map((d) => {
          const dayShifts = rows.filter((r) => r.date === d);
          const dayOff = off.filter((o) => o.startDate <= d && o.endDate >= d);
          if (!dayShifts.length && !dayOff.length) return null;
          return (
            <div key={d} className={`card space-y-2 ${d === t ? "ring-2 ring-brand" : ""}`}>
              <p className="font-semibold">{formatDate(d)}{d === t && <span className="ml-2 text-xs font-medium text-brand">Today</span>}</p>
              <ul className="space-y-1">
                {dayShifts.map((s) => (
                  <li key={s.id} className={`flex justify-between gap-2 rounded px-2 py-1 text-sm ${s.userId === user.id ? "bg-brand-soft font-semibold" : ""}`}>
                    <span>{s.name}{!deptId && <span className="muted font-normal"> · {s.department}</span>}</span>
                    <span className="shrink-0 text-stone-600">{formatShiftTime(s.startTime, s.endTime)}</span>
                  </li>
                ))}
              </ul>
              {dayOff.length > 0 && <p className="text-xs text-stone-500">Off: {dayOff.map((o) => o.name).join(", ")}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
