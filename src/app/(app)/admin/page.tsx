import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { allCourses, allDepartments } from "@/lib/queries";
import { canManageCourse } from "@/lib/permissions";
import { Flash, Section, roleLabels } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { addCourse, addDepartment, setApprover } from "./actions";

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const [courseList, deptList, managers] = await Promise.all([
    allCourses(),
    allDepartments(),
    db
      .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, courseId: schema.users.courseId })
      .from(schema.users)
      .where(and(ne(schema.users.role, "employee"), eq(schema.users.active, true)))
      .orderBy(asc(schema.users.name)),
  ]);
  const mine = courseList.filter((c) => canManageCourse(user, c.id));

  return (
    <>
      <h1 className="h1">Manage</h1>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/upload" className="card hover:border-brand">
          <p className="font-semibold">📤 Upload schedule or roster</p>
          <p className="muted">Post the week&apos;s shifts from your spreadsheet.</p>
        </Link>
        <Link href="/admin/employees" className="card hover:border-brand">
          <p className="font-semibold">👥 Employees</p>
          <p className="muted">Add people, change roles and departments.</p>
        </Link>
      </div>

      <Section title="Who approves requests">
        <p className="muted -mt-2">Time-off and swap requests go to the assistant pro picked for each department. If none is picked, they go to the course&apos;s head pro.</p>
        {mine.map((c) => (
          <div key={c.id} className="card space-y-3">
            <h3 className="font-semibold">{c.name}</h3>
            {deptList.filter((d) => d.courseId === c.id).map((d) => (
              <form key={d.id} action={setApprover} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input type="hidden" name="departmentId" value={d.id} />
                <span className="sm:w-48">{d.name}</span>
                <select name="approverId" defaultValue={d.approverId ?? ""} className="input sm:flex-1" aria-label={`Approver for ${d.name}`}>
                  <option value="">Head pro (no one picked)</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({roleLabels[m.role]})</option>
                  ))}
                </select>
                <button className="btn-secondary">Save</button>
              </form>
            ))}
            <form action={addDepartment} className="flex gap-2 border-t border-stone-100 pt-3">
              <input type="hidden" name="courseId" value={c.id} />
              <input name="name" required placeholder="New department, e.g. Bag Room" className="input" aria-label="New department name" />
              <button className="btn-secondary shrink-0">Add</button>
            </form>
          </div>
        ))}
      </Section>

      {user.role === "admin" && (
        <Section title="Courses">
          <form action={addCourse} className="card flex gap-2">
            <input name="name" required placeholder="Course name" className="input" aria-label="Course name" />
            <button className="btn shrink-0">Add course</button>
          </form>
          <p className="muted">New courses start with Cart Attendants and Starters departments.</p>
        </Section>
      )}
    </>
  );
}
