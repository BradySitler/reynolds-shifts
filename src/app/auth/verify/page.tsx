import { verifyLogin } from "@/app/login/actions";
import { str, type SearchParams } from "@/lib/flash";

// Sign-in happens on a button press, not on page load, so email link scanners can't use up the link.
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = str((await searchParams).token) ?? "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <form action={verifyLogin} className="card space-y-4 text-center">
        <h1 className="h2">Sign in to Reynolds Shifts</h1>
        <input type="hidden" name="token" value={token} />
        <button className="btn w-full">Continue</button>
      </form>
    </main>
  );
}
