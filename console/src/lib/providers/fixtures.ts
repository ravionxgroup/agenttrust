import { deriveAgentDetails, deriveAgents, deriveOverview, deriveRunDetails, deriveRuns, deriveToolDetails, deriveTools, filterAuditEvents } from "../derive";
import type { AgentDetails, AgentSummary, AuditEvent, AuditFilters, ConsoleDataSnapshot, DataSourceInfo, Overview, PolicySourceInfo, PolicyView, RunDetails, RunSummary, ToolDetails, ToolSummary } from "../domain";
import { fixtureAuditEvents } from "../../fixtures/audit-events";
import type { ConsoleDataProvider } from "./provider";
import { loadPolicyFromEnvironment } from "./policy";

export class FixturesProvider implements ConsoleDataProvider {
  private readonly events = [...fixtureAuditEvents].sort((a, b) => b.ts - a.ts);
  private readonly source: DataSourceInfo = {
    kind: "fixtures",
    label: "Demo fixtures",
  };

  async getOverview(): Promise<Overview> {
    return deriveOverview(this.events);
  }

  async listAuditEvents(filters?: AuditFilters): Promise<AuditEvent[]> {
    return filterAuditEvents(this.events, filters);
  }

  async listAgents(): Promise<AgentSummary[]> {
    return deriveAgents(this.events);
  }

  async getAgent(agentId: string): Promise<AgentDetails | null> {
    return deriveAgentDetails(this.events, agentId);
  }

  async listRuns(): Promise<RunSummary[]> {
    return deriveRuns(this.events);
  }

  async getRun(runId: string): Promise<RunDetails | null> {
    return deriveRunDetails(this.events, runId);
  }

  async listTools(): Promise<ToolSummary[]> {
    return deriveTools(this.events);
  }

  async getTool(toolName: string): Promise<ToolDetails | null> {
    return deriveToolDetails(this.events, toolName);
  }

  async getPolicy(): Promise<PolicyView | null> {
    return (await loadPolicyFromEnvironment()).policy;
  }

  async getSnapshot(): Promise<ConsoleDataSnapshot> {
    const policyResult = await loadPolicyFromEnvironment();
    return {
      overview: await this.getOverview(),
      events: await this.listAuditEvents(),
      agents: await this.listAgents(),
      runs: await this.listRuns(),
      tools: await this.listTools(),
      policy: policyResult.policy,
      source: this.source,
      policySource: policyResult.source,
    };
  }

  getSourceInfo(): DataSourceInfo {
    return this.source;
  }

  async getPolicySourceInfo(): Promise<PolicySourceInfo> {
    return (await loadPolicyFromEnvironment()).source;
  }
}
