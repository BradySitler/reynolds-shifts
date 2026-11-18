import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { allCourses } from "@/lib/queries";
import { canManageCourse } from "@/lib/permissions";
import { Flash } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { uploadRoster, uploadSchedule } from "../actions";

export default async function UploadPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const courses = (await allCourses()).filter((c) => canManageCourse(user, c.id));

  const coursePicker = (
    <div>
      <label className="label">
        Course
        </label>
      <select name="courseId" defaultValue={user.courseId ?? courses[0]?.id} className="input" required>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div>
        <Link href="/admin" className="text-sm font-medium text-brand">← Manage</Link>
        <h1 className="h1 mt-1">Upload a spreadsheet</h1>
      </div>
      <Flash msg={str(sp.msg)} error={str(sp.error)} />

      <form action={uploadSchedule} className="card space-y-4">
        <h2 className="h2">Post the schedule</h2>
        <p className="muted">
          One row per shift with columns <strong>Date</strong>, <strong>Employee</strong> (name or email), <strong>Department</strong>, <strong>Start</strong>, <strong>End</strong>, and an optional <strong>Note</strong>.{" "}
          <a href="/admin/upload/template?kind=schedule" className="font-medium text-brand underline">Download a template</a>.
        </p>
        {coursePicker}
        <input type="file" name="file" accept=".xlsx,.csv" required className="input py-2" aria-label="Schedule spreadsheet" />
        <label className="flex items-start gap-2">
          <input type="checkbox" name="replace" defaultChecked className="mt-0.5 h-5 w-5 accent-brand" />
          <span>Replace shifts already posted for these dates and departments <span className="muted">(use this when re-uploading a corrected sheet)</span></span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-5 w-5 accent-brand" />
          <span>Email each person their shifts</span>
        </label>
        <button className="btn w-full sm:w-auto">Upload schedule</button>
      </form>

      <form action={uploadRoster} className="card space-y-4">
        <h2 className="h2">Add or update employees</h2>
        <p className="muted">
          Columns <strong>Name</strong>, <strong>Email</strong>, <strong>Phone</strong>, <strong>Department</strong>, <strong>Role</strong> (Employee, Assistant Pro or Head Pro). People already on file are updated by email.{" "}
          <a href="/admin/upload/template?kind=roster" className="font-medium text-brand underline">Download a template</a>.
        </p>
        {coursePicker}
        <input type="file" name="file" accept=".xlsx,.csv" required className="input py-2" aria-label="Roster spreadsheet" />
        <button className="btn w-full sm:w-auto">Upload roster</button>
      </form>
    </>
  );
}
