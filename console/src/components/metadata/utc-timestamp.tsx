import { formatUtcTimestamp } from "../../lib/format";

/** Compact presentation without replacing the original recorded timestamp. */
export function UtcTimestamp({ value }: { value: string | null | undefined }) {
  const display = formatUtcTimestamp(value);
  if (display === null) return <span>{value ?? ""}</span>;
  return <time dateTime={value ?? undefined} className="whitespace-nowrap tabular-nums" aria-label={`${display} UTC; original timestamp ${value}`}>{display}</time>;
}
