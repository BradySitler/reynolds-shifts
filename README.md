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

Download templates from **Manage → Upload**.

- **Schedule:** one row per shift. Columns `Date`, `Employee` (name or email), `Department`, `Start`, `End`, optional `Note`. Dates like `11/22/2026` and times like `6:30 AM` work. If any row has a problem, nothing is saved and the page lists what to fix.
- **Roster:** columns `Name`, `Email`, `Phone`, `Department`, `Role`. Existing people are updated by email.

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
4. Run migrations against the database: `DATABASE_URL=... npm run db:migrate`.
5. Create the first admin: `DATABASE_URL=... npm run create-admin -- you@example.com "Your Name"`. Then sign in, add the course, and upload the roster.

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public URL, used in email links |
| `RESEND_API_KEY` | Sends email. Without it, emails are logged instead |
| `EMAIL_FROM` | Sender address (domain must be verified in Resend) |
| `APP_TIME_ZONE` | Defaults to `America/New_York` |
