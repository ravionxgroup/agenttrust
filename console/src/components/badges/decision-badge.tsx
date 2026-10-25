import type { Decision } from "../../lib/domain";
import { StatusBadge } from "./status-badge";

export function DecisionBadge({ decision }: { decision: Decision }) {
  const allow = decision === "allow";
  const unknown = decision === "unknown";
  return (
    <StatusBadge tone={unknown ? "neutral" : allow ? "success" : "denied"} className="min-w-16">
      {unknown ? "UNKNOWN" : allow ? "ALLOW" : "DENY"}
    </StatusBadge>
  );
}
