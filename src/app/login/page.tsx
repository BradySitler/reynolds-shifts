import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import { str, type SearchParams } from "@/lib/flash";
import { requestLoginLink } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const sent = str(sp.sent);
  const dev = str(sp.dev);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white">⛳</div>
        <h1 className="h1">Reynolds Shifts</h1>
        <p className="muted mt-1">Time off, shift swaps and the staff roster</p>
      </div>
      <Flash error={str(sp.error)} />
      {sent ? (
        <div className="card space-y-3 text-center">
          <p className="font-semibold">Check your email</p>
          <p className="muted">
            If <strong>{sent}</strong> is on the staff list, we just sent it a sign-in link. It expires in 30 minutes.
          </p>
          {dev && (
            <a href={dev} className="btn w-full">
              Open sign-in link (test mode)
            </a>
          )}
          <a href="/login" className="text-sm font-medium text-brand underline">
            Use a different email
          </a>
        </div>
      ) : (
        <form action={requestLoginLink} className="card space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Work email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
          </div>
          <button className="btn w-full">Email me a sign-in link</button>
          <p className="muted text-center">No password needed. Ask your pro to add you if your email isn&apos;t recognized.</p>
        </form>
      )}
    </main>
  );
}
