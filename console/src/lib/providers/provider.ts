import type {
  AgentDetails,
  AgentSummary,
  AuditEvent,
  AuditFilters,
  ConsoleDataSnapshot,
  DataSourceInfo,
  Overview,
  PolicySourceInfo,
  PolicyView,
  RunDetails,
  RunSummary,
  ToolDetails,
  ToolSummary,
} from "../domain";

export interface ConsoleDataProvider {
  getOverview(): Promise<Overview>;
  listAuditEvents(filters?: AuditFilters): Promise<AuditEvent[]>;
  listAgents(): Promise<AgentSummary[]>;
  getAgent(agentId: string): Promise<AgentDetails | null>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunDetails | null>;
  listTools(): Promise<ToolSummary[]>;
  getTool(toolName: string): Promise<ToolDetails | null>;
  getPolicy(): Promise<PolicyView | null>;
  getSnapshot(): Promise<ConsoleDataSnapshot>;
  getSourceInfo(): DataSourceInfo;
  getPolicySourceInfo(): Promise<PolicySourceInfo>;
}
