export function formatTimestamp(epochSeconds: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(epochSeconds * 1000));
}

export function formatFullTimestamp(epochSeconds: number): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochSeconds * 1000));
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
