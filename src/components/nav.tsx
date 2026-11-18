"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Desktop: links in the header */}
      <nav className="hidden gap-1 md:flex">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-white/15 text-white" : "text-white/80 hover:text-white"}`}
          >
            {i.label}
            {!!i.badge && <Badge n={i.badge} />}
          </Link>
        ))}
      </nav>
      {/* Phone: tab bar along the bottom */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              active(i.href) ? "text-brand" : "text-stone-500"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">
              {i.icon}
            </span>
            {i.label}
            {!!i.badge && <Badge n={i.badge} />}
          </Link>
        ))}
      </nav>
    </>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute right-1 top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white md:-right-1 md:-top-1">
      {n}
    </span>
  );
}
