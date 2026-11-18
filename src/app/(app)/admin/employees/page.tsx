import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { allCourses, allDepartments } from "@/lib/queries";
import { canManageCourse } from "@/lib/permissions";
import { Flash, roleLabels } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { saveEmployee } from "../actions";

const { users, departments, courses } = schema;

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const [courseList, deptList, people] = await Promise.all([
    allCourses(),
    allDepartments(),
    db
      .select({ u: users, department: departments.name, course: courses.name })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(courses, eq(courses.id, users.courseId))
      .orderBy(asc(courses.name), asc(departments.name), asc(users.name)),
  ]);
  const visible = people.filter((p) => user.role === "admin" || canManageCourse(user, p.u.courseId));
  const editId = Number(str(sp.edit)) || 0;
  const editing = visible.find((p) => p.u.id === editId)?.u;
  const myDepts = deptList.filter((d) => canManageCourse(user, d.courseId));
  const roles = Object.entries(roleLabels).filter(([r]) => r !== "admin" || user.role === "admin");

  return (
    <>
      <div>
        <Link href="/admin" className="text-sm font-medium text-brand">← Manage</Link>
        <h1 className="h1 mt-1">Employees</h1>
      </div>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      <form action={saveEmployee} className="card grid gap-3 sm:grid-cols-2" key={editing?.id ?? "new"}>
        <h2 className="h2 sm:col-span-2">{editing ? `Edit ${editing.name}` : "Add an employee"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required defaultValue={editing?.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} className="input" />
          <p className="muted mt-1">Needed to sign in and get emails.</p>
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" defaultValue={editing?.phone ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={editing?.role ?? "employee"} className="input">
            {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="departmentId">Department</label>
          <select id="departmentId" name="departmentId" defaultValue={editing?.departmentId ?? ""} className="input">
            <option value="">None</option>
            {myDepts.map((d) => <option key={d.id} value={d.id}>{courseList.length > 1 ? `${d.course} · ${d.name}` : d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="courseId">Course (if no department)</label>
          <select id="courseId" name="courseId" defaultValue={editing?.courseId ?? user.courseId ?? ""} className="input">
            <option value="">None</option>
            {courseList.filter((c) => canManageCourse(user, c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {editing && (
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" name="active" value="on" defaultChecked={editing.active} className="h-5 w-5 accent-brand" />
            Active (uncheck when someone leaves; they can no longer sign in)
          </label>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn">{editing ? "Save changes" : "Add employee"}</button>
          {editing && <Link href="/admin/employees" className="btn-secondary">Cancel</Link>}
        </div>
      </form>

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {visible.map(({ u, department, course }) => (
          <li key={u.id} className={`flex items-center justify-between gap-3 p-3 ${u.active ? "" : "opacity-50"}`}>
            <div className="min-w-0">
              <p className="font-semibold">{u.name} {!u.active && <span className="text-xs font-normal">(inactive)</span>}</p>
              <p className="muted truncate">{roleLabels[u.role]} · {[department, course].filter(Boolean).join(", ") || "No department"} · {u.email ?? <span className="text-amber-700">no email yet</span>}</p>
            </div>
            <Link href={`/admin/employees?edit=${u.id}`} className="btn-secondary shrink-0">Edit</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
