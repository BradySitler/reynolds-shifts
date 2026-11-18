import { and, asc, eq, ilike, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { allCourses, allDepartments } from "@/lib/queries";
import { Empty, roleLabels } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";

const { users, departments, courses } = schema;

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q)?.trim() ?? "";
  const courseId = Number(str(sp.course)) || 0;
  const deptId = Number(str(sp.dept)) || 0;

  const where: SQL[] = [eq(users.active, true)];
  if (q) where.push(ilike(users.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`));
  if (courseId) where.push(eq(users.courseId, courseId));
  if (deptId) where.push(eq(users.departmentId, deptId));

  const [people, courseList, deptList] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, department: departments.name, course: courses.name })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(courses, eq(courses.id, users.courseId))
      .where(and(...where))
      .orderBy(asc(courses.name), asc(departments.name), asc(users.name)),
    allCourses(),
    allDepartments(),
  ]);

  return (
    <>
      <h1 className="h1">Roster</h1>
      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Search by name" className="input sm:col-span-2" aria-label="Search by name" />
        <select name="course" defaultValue={courseId || ""} className="input" aria-label="Course">
          <option value="">All courses</option>
          {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="dept" defaultValue={deptId || ""} className="input" aria-label="Department">
          <option value="">All departments</option>
          {deptList.filter((d) => !courseId || d.courseId === courseId).map((d) => (
            <option key={d.id} value={d.id}>{courseList.length > 1 ? `${d.course} · ${d.name}` : d.name}</option>
          ))}
        </select>
        <button className="btn sm:col-span-4 sm:w-auto sm:justify-self-start">Search</button>
      </form>

      <p className="muted">{people.length} {people.length === 1 ? "person" : "people"}</p>
      {people.length === 0 ? (
        <Empty>Nobody matches that search.</Empty>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  {p.name}
                  {p.role !== "employee" && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">{roleLabels[p.role]}</span>}
                </p>
                <p className="muted">{[p.department, p.course].filter(Boolean).join(" · ") || "No department"}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm">
                {p.phone && <a href={`tel:${p.phone}`} className="font-medium text-brand">📞 {p.phone}</a>}
                <a href={`mailto:${p.email}`} className="font-medium text-brand break-all">✉️ {p.email}</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
