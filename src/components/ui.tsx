import type { ReactNode } from "react";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  awaiting_coworker: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-sky-100 text-sky-800",
  approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-stone-200 text-stone-600",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  awaiting_coworker: "Waiting on coworker",
  awaiting_approval: "Waiting on pro",
  approved: "Approved",
  denied: "Denied",
  declined: "Coworker declined",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status] ?? ""}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

export const roleLabels: Record<string, string> = {
  employee: "Employee",
  assistant_pro: "Assistant Pro",
  head_pro: "Head Pro",
  admin: "Admin",
};

/** Shows ?msg= or ?error= passed back after a form submits. */
export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <div
      role="status"
      className={`rounded-lg px-4 py-3 text-sm font-medium ${
        error ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-green-50 text-green-800 ring-1 ring-green-200"
      }`}
    >
      {error || msg}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">{children}</p>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
