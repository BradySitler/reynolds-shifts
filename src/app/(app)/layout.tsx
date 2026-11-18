import Link from "next/link";
import { requireUser, isManager } from "@/lib/auth";
import { pendingApprovalCount, incomingSwapCount } from "@/lib/queries";
import { Nav, type NavItem } from "@/components/nav";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, incoming] = await Promise.all([pendingApprovalCount(user), incomingSwapCount(user.id)]);

  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "🏠", badge: incoming },
    { href: "/schedule", label: "Schedule", icon: "📅" },
    { href: "/time-off", label: "Time off", icon: "🌴" },
    { href: "/roster", label: "Roster", icon: "👥" },
  ];
  if (isManager(user.role)) items.push({ href: "/approvals", label: "Approvals", icon: "✅", badge: approvals });
  if (user.role === "admin" || user.role === "head_pro") items.push({ href: "/admin", label: "Manage", icon: "⚙️" });

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-10 bg-brand text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="font-bold tracking-tight">
            ⛳ Reynolds Shifts
          </Link>
          <Nav items={items} />
          <form action={logout} className="flex items-center gap-3">
            <span className="hidden text-sm text-white/80 sm:inline">{user.name}</span>
            <button className="rounded-lg px-2 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
