import { formatResult } from "../../lib/format";
import type { Decision, ResultStatus } from "../../lib/domain";

export function ResultBadge({ decision, resultStatus }: { decision: Decision; resultStatus: ResultStatus }) {
  const label = formatResult(resultStatus, decision);
  const tone = label === "OK" ? "text-emerald-200" : label === "ERROR" ? "text-amber-200" : "text-slate-400";

  return <span className={`text-xs font-semibold ${tone}`}>{label}</span>;
}
