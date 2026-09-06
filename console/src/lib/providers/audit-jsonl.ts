import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { deriveAgentDetails, deriveAgents, deriveOverview, deriveRunDetails, deriveRuns, deriveToolDetails, deriveTools, filterAuditEvents } from "../derive";
import type { AgentDetails, AgentSummary, AuditEvent, AuditFilters, ConsoleDataSnapshot, DataSourceInfo, Overview, PolicySourceInfo, PolicyView, RawAuditEvent, RunDetails, RunSummary, ToolDetails, ToolSummary } from "../domain";
import { FixturesProvider } from "./fixtures";
import type { ConsoleDataProvider } from "./provider";
import { loadPolicyFromEnvironment } from "./policy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapRawEvent(raw: RawAuditEvent): AuditEvent | null {
  const eventId = asString(raw.event_id);
  const ts = asNumber(raw.ts);
  const agentId = asString(raw.agent_id);
  const runId = asString(raw.run_id);
  const tokenId = asString(raw.token_id);
  const tool = asString(raw.tool);
  const requiredScope = asString(raw.required_scope);
  const decision = raw.decision === "allow" || raw.decision === "deny" ? raw.decision : null;
  const resultStatus = raw.result_status === "ok" || raw.result_status === "error" || raw.result_status === null
    ? raw.result_status
    : null;

  if (!eventId || ts === null || !agentId || !runId || !tokenId || !tool || !requiredScope || !decision) {
    return null;
  }

  return {
    eventId,
    ts,
    agentId,
    runId,
    tokenId,
    tool,
    requiredScope,
    decision,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    argsRedacted: isRecord(raw.args_redacted) ? raw.args_redacted : {},
    resultStatus,
  };
}

export class AuditJsonlProvider implements ConsoleDataProvider {
  private warningCount = 0;

  constructor(private readonly auditPath: string) {}

  static async fromEnvironment(): Promise<ConsoleDataProvider> {
    const auditPath = process.env.AGENTTRUST_AUDIT_PATH;
    if (!auditPath) {
      return new FixturesProvider();
    }

    try {
      await access(auditPath, constants.R_OK);
      return new AuditJsonlProvider(auditPath);
    } catch {
      return new FixturesProvider();
    }
  }

  async getOverview(): Promise<Overview> {
    return deriveOverview(await this.listAuditEvents());
  }

  async listAuditEvents(filters?: AuditFilters): Promise<AuditEvent[]> {
    this.warningCount = 0;
    const text = await readFile(this.auditPath, "utf8");
    const events: AuditEvent[] = [];

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as RawAuditEvent;
        const event = mapRawEvent(parsed);
        if (event) {
          events.push(event);
        } else {
          this.warningCount += 1;
        }
      } catch {
        this.warningCount += 1;
      }
    }

    const sorted = events.sort((a, b) => b.ts - a.ts);
    return filterAuditEvents(sorted, filters);
  }

  async listAgents(): Promise<AgentSummary[]> {
    return deriveAgents(await this.listAuditEvents());
  }

  async getAgent(agentId: string): Promise<AgentDetails | null> {
    return deriveAgentDetails(await this.listAuditEvents(), agentId);
  }

  async listRuns(): Promise<RunSummary[]> {
    return deriveRuns(await this.listAuditEvents());
  }

  async getRun(runId: string): Promise<RunDetails | null> {
    return deriveRunDetails(await this.listAuditEvents(), runId);
  }

  async listTools(): Promise<ToolSummary[]> {
    return deriveTools(await this.listAuditEvents());
  }

  async getTool(toolName: string): Promise<ToolDetails | null> {
    return deriveToolDetails(await this.listAuditEvents(), toolName);
  }

  async getPolicy(): Promise<PolicyView | null> {
    return (await loadPolicyFromEnvironment()).policy;
  }

  async getSnapshot(): Promise<ConsoleDataSnapshot> {
    const events = await this.listAuditEvents();
    const policyResult = await loadPolicyFromEnvironment();
    return {
      overview: deriveOverview(events),
      events,
      agents: deriveAgents(events),
      runs: deriveRuns(events),
      tools: deriveTools(events),
      policy: policyResult.policy,
      source: this.getSourceInfo(),
      policySource: policyResult.source,
    };
  }

  getSourceInfo(): DataSourceInfo {
    return {
      kind: "jsonl",
      label: "Local audit data",
      warningCount: this.warningCount,
    };
  }

  async getPolicySourceInfo(): Promise<PolicySourceInfo> {
    return (await loadPolicyFromEnvironment()).source;
  }
}
