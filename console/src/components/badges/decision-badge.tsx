import type { Decision } from "../../lib/domain";

export function DecisionBadge({ decision }: { decision: Decision }) {
  const allow = decision === "allow";
  return (
    <span
      className={[
        "inline-flex min-w-16 justify-center rounded px-2 py-1 text-xs font-semibold",
        allow ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/25" : "bg-rose-400/10 text-rose-200 ring-1 ring-rose-400/25",
      ].join(" ")}
    >
      {allow ? "ALLOW" : "DENY"}
    </span>
  );
}
