import { formatResult } from "../../lib/format";
import type { Decision, ResultStatus } from "../../lib/domain";

export function ResultBadge({ decision, resultStatus }: { decision: Decision; resultStatus: ResultStatus }) {
  const label = formatResult(resultStatus, decision);
  const tone = label === "OK" ? "text-success" : label === "ERROR" ? "text-failed" : "text-muted";

  return <span className={`text-xs font-semibold ${tone}`}>{label}</span>;
}
