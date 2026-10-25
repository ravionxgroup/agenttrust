import type { Decision } from "../../lib/domain";

export function DecisionBadge({ decision }: { decision: Decision }) {
  const allow = decision === "allow";
  const unknown = decision === "unknown";
  return (
    <span
      className={[
        "inline-flex min-w-16 justify-center rounded px-2 py-1 text-xs font-semibold",
        unknown ? "bg-muted/10 text-muted ring-1 ring-muted/25" : allow ? "bg-success/10 text-success ring-1 ring-success/25" : "bg-denied/10 text-denied ring-1 ring-denied/25",
      ].join(" ")}
    >
      {unknown ? "UNKNOWN" : allow ? "ALLOW" : "DENY"}
    </span>
  );
}
