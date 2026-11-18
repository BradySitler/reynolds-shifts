# Reynolds Shifts

A phone-friendly site where Reynolds golf course staff can:

- **Request time off.** The request goes to the assistant pro picked for the employee's department (for example, cart attendants → the assistant pro over cart attendants). If no one is picked, it goes to the course's head pro.
- **See the roster** of employees across every course, with phone and email.
- **Swap shifts** with a coworker. The coworker accepts first, then the assistant pro approves, and the schedule updates.
- **See the schedule**, which head pros post each week by uploading a spreadsheet.

Everyone signs in with a link emailed to them. There are no passwords.

## Roles

| Role | Can do |
| --- | --- |
| Employee | See schedule and roster, request time off, request and accept swaps |
| Assistant Pro | Everything above, plus approve requests for the departments they're picked for |
| Head Pro | Everything above for their whole course, plus manage employees, approvers and uploads for their course |
| Admin | Everything, at every course, and can add courses |

## Spreadsheets

Upload from **Manage → Upload**.

- **Schedule (the course's usual sheet):** names down the side, Thursday–Wednesday across the top with dates like `May 1` under the day names, and a section row for each department (Golf Professionals, Cart Attendants, …). Codes: `6:00-2:00` (6 AM–2 PM), `7:30-EOE` (to end of event), `12:00-CL` (to close), words like `Open`/`Close`/`Here` as written, and `*`, `RO` or blank for not working. Rows above the first section (events, player counts) are skipped. In a workbook with a tab per week, only weeks that haven't ended are posted. Unknown people and departments are added automatically; people added this way have no email until one is entered on the Employees page.
- **Schedule (simple list):** one row per shift with `Date`, `Employee` (name or email), `Department`, `Start`, `End`, optional `Note`.
- **Roster:** columns `Name`, `Email`, `Phone`, `Department`, `Role`. Existing people are updated by email, and people added from a schedule upload get their email filled in by name.

If anything in a file can't be read, nothing is saved and the page lists what to fix. Re-uploading replaces that week's shifts for the departments in the file.

## Stack

Next.js (App Router) · Postgres via Drizzle ORM · email through Resend. Hosted on Vercel with a Neon Postgres database from the Vercel Marketplace.

## Running locally

```bash
npm install
# .env.local
#   DATABASE_URL=postgres://postgres@127.0.0.1:5432/reynolds
#   APP_URL=http://localhost:3000
npm run db:migrate
npm run seed:demo        # demo course, 18 people, two weeks of shifts
npm run dev
```

Without `RESEND_API_KEY`, emails print to the terminal and the login page shows a "test mode" sign-in button. Demo logins: `admin.user@example.com`, `carter.assistant@example.com`, `avery.lane@example.com`.

`npm test` runs the unit tests.

## Deploying

1. Import the repo into Vercel.
2. Add a Neon Postgres database from the Vercel Marketplace (it sets `DATABASE_URL`).
3. Set environment variables: `APP_URL` (the site's URL), `RESEND_API_KEY`, and `EMAIL_FROM` (an address on a domain verified in Resend, such as `Reynolds Shifts <shifts@yourdomain.com>`).
4. Set the project's build command to `npm run db:migrate && npm run build` so each deploy brings the database up to date.
5. Set `ADMIN_EMAILS` to your email (comma-separated for more than one). The first time that address signs in, it becomes an admin. Then add the course and upload the schedule. (`npm run create-admin` does the same from a terminal.)

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public URL, used in email links. Defaults to the Vercel production URL |
| `ADMIN_EMAILS` | Addresses that become admins on their first sign-in |
| `RESEND_API_KEY` | Sends email. Without it, emails are logged instead |
| `EMAIL_FROM` | Sender address (domain must be verified in Resend) |
| `APP_TIME_ZONE` | Defaults to `America/New_York` |
| `NEXT_PUBLIC_WEEK_START_DAY` | First day of the schedule week, 0 = Sunday. Defaults to 4 (Thursday) |
