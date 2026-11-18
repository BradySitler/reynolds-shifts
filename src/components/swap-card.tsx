import type { SwapRow } from "@/lib/queries";
import { formatDate, formatShiftTime } from "@/lib/dates";
import { StatusBadge } from "./ui";

/** Describes a swap request in plain words. */
export function SwapSummary({ s, viewerId }: { s: SwapRow; viewerId?: number }) {
  const who = viewerId === s.requesterId ? "You" : s.requesterName;
  const to = viewerId === s.coworkerId ? "you" : s.coworkerName;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {who} → {to}
        </span>
        <StatusBadge status={s.status} />
      </div>
      <p className="text-sm">
        <span className="font-medium">{formatDate(s.shiftDate)}</span> · {formatShiftTime(s.shiftStart, s.shiftEnd)}
        <span className="muted"> · {s.department}, {s.course}</span>
      </p>
      {s.tradeDate && (
        <p className="text-sm">
          In trade for <span className="font-medium">{formatDate(s.tradeDate)}</span> · {formatShiftTime(s.tradeStart!, s.tradeEnd)}
        </p>
      )}
      {s.message && <p className="text-sm italic text-stone-600">&ldquo;{s.message}&rdquo;</p>}
      {s.decisionNote && <p className="text-sm text-stone-600">Pro&apos;s note: {s.decisionNote}</p>}
    </div>
  );
}
