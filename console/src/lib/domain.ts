export type Decision = "allow" | "deny";
export type ResultStatus = "ok" | "error" | null;
export type DataSourceKind = "fixtures" | "jsonl";
export type PolicySourceKind = "fixtures" | "yaml" | "unavailable";

export interface AuditEvent {
  eventId: string;
  ts: number;
  agentId: string;
  runId: string;
  tokenId: string;
  tool: string;
  requiredScope: string;
  decision: Decision;
  reason: string | null;
  argsRedacted: Record<string, unknown>;
  resultStatus: ResultStatus;
}

export interface AgentIdentity {
  agentId: string;
  runId: string;
  scopes: string[];
  issuer: string;
  issuedAt: number;
  expiresAt: number;
  tokenId: string;
}

export interface AgentPolicy {
  agentId: string;
  scopes: string[];
  ttlSeconds?: number;
}

export interface Policy {
  issuer: string;
  defaultTtlSeconds: number;
  agents: Record<string, AgentPolicy>;
}

export interface AgentPolicyView {
  agentId: string;
  scopes: string[];
  explicitTtlSeconds?: number;
  effectiveTtlSeconds: number;
}

export interface PolicyView {
  issuer: string;
  defaultTtlSeconds: number;
  agents: AgentPolicyView[];
}

export interface DeniedToolSummary {
  tool: string;
  deniedCalls: number;
}

export interface AuthorizationSummary {
  allowed: number;
  denied: number;
  errors: number;
}

export interface Overview {
  agentsObserved: number;
  runsObserved: number;
  toolCalls: number;
  allowedCalls: number;
  deniedCalls: number;
  toolErrors: number;
  recentEvents: AuditEvent[];
  mostDeniedTools: DeniedToolSummary[];
  authorizationSummary: AuthorizationSummary;
}

export interface ObservedToolSummary {
  tool: string;
  requiredScope: string;
  calls: number;
  allowedCalls: number;
  deniedCalls: number;
  executionErrors: number;
}

export interface ObservedScopeSummary {
  requiredScope: string;
  calls: number;
}

export interface ToolSummary {
  tool: string;
  requiredScopes: ObservedScopeSummary[];
  agentsObserved: number;
  runsObserved: number;
  calls: number;
  allowedCalls: number;
  deniedCalls: number;
  executionErrors: number;
  lastSeen: number;
}

export interface ToolAgentSummary {
  agentId: string;
  calls: number;
  allowedCalls: number;
  deniedCalls: number;
  executionErrors: number;
  lastSeen: number;
}

export interface ToolDetails extends ToolSummary {
  agents: ToolAgentSummary[];
  recentEvents: AuditEvent[];
  recentRuns: RunSummary[];
}

export interface AgentSummary {
  agentId: string;
  runsObserved: number;
  toolCalls: number;
  allowedCalls: number;
  deniedCalls: number;
  executionErrors: number;
  distinctTools: number;
  lastSeen: number;
}

export interface AgentDetails extends AgentSummary {
  recentRuns: RunSummary[];
  recentEvents: AuditEvent[];
  observedTools: ObservedToolSummary[];
}

export interface RunSummary {
  runId: string;
  agentId: string;
  tokenId: string | null;
  tokenIdsObserved: string[];
  firstObservedAt: number;
  lastObservedAt: number;
  observedWindowSeconds: number;
  toolCalls: number;
  allowedCalls: number;
  deniedCalls: number;
  executionErrors: number;
  distinctTools: number;
}

export interface RunDetails extends RunSummary {
  events: AuditEvent[];
}

export interface AuditFilters {
  search?: string;
  agentId?: string;
  decision?: "all" | Decision;
  tool?: string;
}

export interface DataSourceInfo {
  kind: DataSourceKind;
  label: string;
  warningCount?: number;
}

export interface PolicySourceInfo {
  kind: PolicySourceKind;
  label: string;
  warningCount?: number;
}

export interface ConsoleDataSnapshot {
  overview: Overview;
  events: AuditEvent[];
  agents: AgentSummary[];
  runs: RunSummary[];
  tools: ToolSummary[];
  policy: PolicyView | null;
  source: DataSourceInfo;
  policySource: PolicySourceInfo;
}

export interface RawAuditEvent {
  event_id?: unknown;
  ts?: unknown;
  agent_id?: unknown;
  run_id?: unknown;
  token_id?: unknown;
  tool?: unknown;
  required_scope?: unknown;
  decision?: unknown;
  reason?: unknown;
  args_redacted?: unknown;
  result_status?: unknown;
}
