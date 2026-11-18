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
          Upload the same Excel file you email out now (saved as <strong>.xlsx</strong>): names down the side, Thursday through Wednesday across the top, and a section for each department. If the file has a tab for every week, the weeks that haven&apos;t ended yet are posted. People and departments that aren&apos;t on file yet are added for you.
        </p>
        <details className="muted">
          <summary className="cursor-pointer font-medium text-stone-700">What the codes mean</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>6:00-2:00</strong> is 6 AM to 2 PM. <strong>7:30-EOE</strong> runs to end of event, <strong>12:00-CL</strong> to close.</li>
            <li>Words like <strong>Open</strong>, <strong>Close</strong> or <strong>Here</strong> show as written.</li>
            <li><strong>*</strong>, <strong>RO</strong> and blank cells mean not working.</li>
            <li>Rows above the first department (events, player counts) are skipped.</li>
          </ul>
          <p className="mt-2">
            You can also upload a simple list with one row per shift (Date, Employee, Department, Start, End).{" "}
            <a href="/admin/upload/template?kind=schedule" className="font-medium text-brand underline">Download that template</a>.
          </p>
        </details>
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
