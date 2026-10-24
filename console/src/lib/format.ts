const CONSOLE_LOCALE = "en-US";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTimestamp(epochSeconds: number): string {
  const parts = getUtcTimestampParts(epochSeconds);
  return `${parts.month} ${parts.day}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.period}`;
}

export function formatFullTimestamp(epochSeconds: number): string {
  const parts = getUtcTimestampParts(epochSeconds);
  return `${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.period} UTC`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(CONSOLE_LOCALE).format(value);
}

export function truncateId(value: string, prefixLength = 14): string {
  if (value.length <= prefixLength + 4) {
    return value;
  }
  return `${value.slice(0, prefixLength)}...`;
}

export function formatResult(resultStatus: "ok" | "error" | null, decision: "allow" | "deny"): string {
  if (decision === "deny") {
    return "NOT EXECUTED";
  }
  if (resultStatus === "error") {
    return "ERROR";
  }
  return "OK";
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatObservedWindow(seconds: number): string {
  if (seconds < 1) {
    return "0s";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getUtcTimestampParts(epochSeconds: number): {
  year: number;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  period: "AM" | "PM";
} {
  const date = new Date(epochSeconds * 1000);
  const hours24 = date.getUTCHours();
  const hour12 = hours24 % 12 || 12;

  return {
    year: date.getUTCFullYear(),
    month: MONTH_NAMES[date.getUTCMonth()],
    day: pad2(date.getUTCDate()),
    hour: pad2(hour12),
    minute: pad2(date.getUTCMinutes()),
    second: pad2(date.getUTCSeconds()),
    period: hours24 >= 12 ? "PM" : "AM",
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
