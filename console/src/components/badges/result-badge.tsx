import { formatResult } from "../../lib/format";
import type { Decision, ResultStatus } from "../../lib/domain";
import { StatusBadge } from "./status-badge";

export function ResultBadge({ decision, resultStatus }: { decision: Decision; resultStatus: ResultStatus }) {
  const label = formatResult(resultStatus, decision);
  const tone = label === "OK" ? "success" : label === "ERROR" ? "failed" : label === "UNKNOWN" ? "unknown" : "neutral";

  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
