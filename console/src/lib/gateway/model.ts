export type Authorization = "ALLOW" | "DENY" | "UNKNOWN";
export type Execution = "SUCCEEDED" | "FAILED" | "NOT_EXECUTED" | "UNKNOWN";
export type Stage = "invocation_received" | "authorization_decision" | "execution_attempted" | "execution_result";

/** Browser-safe evidence only. Credentials, token IDs and all payloads are omitted. */
export interface GatewayEvent {
  schema_version: 1;
  event_id: string;
  invocation_id: string;
  timestamp: string;
  event_type: Stage;
  request_id: string;
  agent_id: string;
  run_id: string;
  tool_id: string;
  required_scope: string;
  authorization_decision: Authorization;
  execution_status: Execution;
  reason: string;
}
export interface Evidence {
  event: GatewayEvent;
  fingerprint: string;
  identities: Record<string, string>;
}
export interface Invocation {
  invocationId: string;
  timestamp: string;
  agentId: string;
  runId: string;
  tool: string;
  requestId: string;
  authorization: Authorization;
  execution: Execution;
  authorizationMissing: boolean;
  executionMissing: boolean;
  incomplete: boolean;
  conflicting: boolean;
  duplicateCount: number;
  missingStages: Stage[];
  issues: string[];
  reason: string;
  events: GatewayEvent[];
}
export interface GatewayMetrics {
  total: number;
  allowed: number;
  denied: number;
  authorizationUnknown: number;
  succeeded: number;
  failed: number;
  notExecuted: number;
  unknown: number;
  incomplete: number;
  conflicting: number;
}
export interface GatewaySnapshot {
  invocations: Invocation[];
  metrics: GatewayMetrics;
  recordCount: number;
  duplicateCount: number;
}
export interface InvocationFilters {
  agent?: string;
  tool?: string;
  authorization?: string;
  execution?: string;
  from?: string;
  to?: string;
}

export function projectInvocations(records: Evidence[]): GatewaySnapshot {
  const groups = new Map<string, Evidence[]>();
  const seen = new Map<string, Evidence>();
  const conflicts = new Set<string>();
  const duplicates = new Map<string, number>();
  for (const record of records) {
    const event = record.event;
    const prior = seen.get(event.event_id);
    if (prior) {
      if (prior.fingerprint === record.fingerprint && prior.event.invocation_id === event.invocation_id) {
        duplicates.set(event.invocation_id, (duplicates.get(event.invocation_id) ?? 0) + 1);
        continue;
      }
      conflicts.add(prior.event.invocation_id);
      conflicts.add(event.invocation_id);
    } else seen.set(event.event_id, record);
    const group = groups.get(event.invocation_id) ?? [];
    group.push(record);
    groups.set(event.invocation_id, group);
  }
  const invocations = [...groups].map(([invocationId, group]): Invocation => {
    const events = group.map(record => record.event).sort((a, b) => timestampKey(a.timestamp).localeCompare(timestampKey(b.timestamp)) || a.event_id.localeCompare(b.event_id));
    const stages = new Map<Stage, GatewayEvent[]>();
    const issues = new Set<string>();
    if (conflicts.has(invocationId)) issues.add("Event ID reused with conflicting evidence");
    for (const event of events) {
      const stage = stages.get(event.event_type) ?? [];
      stage.push(event);
      stages.set(event.event_type, stage);
    }
    if ([...stages.values()].some(stage => stage.length > 1)) issues.add("Multiple records claim the same lifecycle stage");
    for (const key of ["request_id", "tool_id"]) {
      if (new Set(events.map(event => event[key as "request_id" | "tool_id"])).size > 1) issues.add("Invocation metadata conflicts");
    }
    for (const key of ["agent_id", "run_id", "token_id", "required_scope", "trace_id", "tool_id", "request_id"]) {
      if (new Set(group.map(record => record.identities[key]).filter(Boolean)).size > 1) issues.add("Invocation identity conflicts");
    }
    const decisions = new Set(events.map(event => event.authorization_decision).filter(value => value !== "UNKNOWN"));
    if (decisions.size > 1) issues.add("Authorization evidence conflicts");
    const auth = stages.get("authorization_decision")?.[0];
    const result = stages.get("execution_result")?.[0];
    const attempt = stages.has("execution_attempted");
    if (auth && auth.authorization_decision !== "ALLOW" && (attempt || result)) issues.add("Execution evidence follows non-allow authorization");
    const missingStages: Stage[] = [];
    if (!stages.has("invocation_received")) missingStages.push("invocation_received");
    if (!auth) missingStages.push("authorization_decision");
    const terminalRejection = !!auth && auth.authorization_decision !== "ALLOW";
    if (!terminalRejection && !result) missingStages.push("execution_result");
    if (result && result.execution_status !== "NOT_EXECUTED" && !attempt) missingStages.push("execution_attempted");
    const conflicting = issues.size > 0;
    const identity = (key: "agent_id" | "run_id" | "tool_id") => [...new Set(events.map(event => event[key]).filter(Boolean))].length <= 1
      ? events.find(event => event[key])?.[key] ?? "" : "Conflicting identity";
    return {
      invocationId, timestamp: events[0].timestamp,
      agentId: identity("agent_id"), runId: identity("run_id"), tool: identity("tool_id"), requestId: events[0].request_id,
      authorization: conflicting ? "UNKNOWN" : auth?.authorization_decision ?? "UNKNOWN",
      execution: conflicting ? "UNKNOWN" : terminalRejection ? "NOT_EXECUTED" : result?.execution_status ?? "UNKNOWN",
      authorizationMissing: !auth, executionMissing: !terminalRejection && !result,
      incomplete: missingStages.length > 0, conflicting, duplicateCount: duplicates.get(invocationId) ?? 0,
      missingStages, issues: [...issues], reason: conflicting ? "conflicting_evidence" : result?.reason ?? auth?.reason ?? "missing_evidence", events,
    };
  }).sort((a, b) => timestampKey(b.timestamp).localeCompare(timestampKey(a.timestamp)) || a.invocationId.localeCompare(b.invocationId));
  return { invocations, metrics: invocationMetrics(invocations), recordCount: records.length, duplicateCount: [...duplicates.values()].reduce((a, b) => a + b, 0) };
}

export function invocationMetrics(invocations: Invocation[]): GatewayMetrics {
  const count = (fn: (invocation: Invocation) => boolean) => invocations.filter(fn).length;
  return {
    total: invocations.length, allowed: count(i => i.authorization === "ALLOW"), denied: count(i => i.authorization === "DENY"),
    authorizationUnknown: count(i => i.authorization === "UNKNOWN"), succeeded: count(i => i.execution === "SUCCEEDED"),
    failed: count(i => i.execution === "FAILED"), notExecuted: count(i => i.execution === "NOT_EXECUTED"),
    unknown: count(i => i.execution === "UNKNOWN"), incomplete: count(i => i.incomplete), conflicting: count(i => i.conflicting),
  };
}

export function filterInvocations(invocations: Invocation[], filters: InvocationFilters): Invocation[] {
  const from = filters.from ? Date.parse(filters.from.includes("Z") ? filters.from : filters.from + "Z") : -Infinity;
  const to = filters.to ? Date.parse(filters.to.includes("Z") ? filters.to : filters.to + "Z") : Infinity;
  return invocations.filter(i => (!filters.agent || i.agentId === filters.agent) && (!filters.tool || i.tool === filters.tool)
    && (!filters.authorization || i.authorization === filters.authorization) && (!filters.execution || i.execution === filters.execution)
    && Date.parse(i.timestamp) >= from && Date.parse(i.timestamp) <= to);
}

function timestampKey(timestamp: string): string {
  return timestamp.replace(/(?:\.(\d{1,9}))?Z$/, (_match, fraction: string | undefined) => `.${(fraction ?? "").padEnd(9, "0")}Z`);
}
