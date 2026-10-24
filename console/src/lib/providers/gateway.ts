import { AuditJsonlProvider } from "./audit-jsonl";
import { AuditSourceError, readGatewayAudit } from "../gateway/ingest";
import { projectInvocations, type GatewaySnapshot } from "../gateway/model";
import type { AuditEvent, AuditFilters, ConsoleDataSnapshot, DataSourceInfo, PolicySourceInfo } from "../domain";
import { deriveAgents, deriveOverview, deriveRuns, deriveTools, filterAuditEvents } from "../derive";

/** One bounded read/projection per provider/request, shared across derived views. */
export class GatewayAuditProvider extends AuditJsonlProvider {
  private loaded?: Promise<GatewaySnapshot>;
  private source: DataSourceInfo = { kind: "gateway", label: "Persisted Gateway audit", status: "ready" };
  constructor(private readonly sourcePath?: string, private readonly configurationError?: string) { super(""); }
  private load(): Promise<GatewaySnapshot> {
    this.loaded ??= (async () => {
      try {
        if (this.configurationError) throw new AuditSourceError(this.configurationError);
        return await readGatewayAudit(this.sourcePath);
      } catch (error) {
        const code = error instanceof AuditSourceError ? error.code : "SOURCE_UNAVAILABLE";
        this.source = { kind: "gateway", label: "Gateway audit unavailable", code,
                        status: ["PATH_NOT_CONFIGURED", "SOURCE_MISSING", "SOURCE_UNREADABLE", "SOURCE_UNAVAILABLE"].includes(code) ? "unavailable" : "error" };
        return projectInvocations([]);
      }
    })();
    return this.loaded;
  }
  override async listAuditEvents(filters?: AuditFilters): Promise<AuditEvent[]> {
    const snapshot = await this.load();
    // Entity pages operate on one invocation row, not four lifecycle events.
    return filterAuditEvents(snapshot.invocations.map(invocation => ({
      eventId: invocation.events[0].event_id, ts: Date.parse(invocation.timestamp) / 1000,
      agentId: invocation.agentId, runId: invocation.runId, tokenId: "", tool: invocation.tool,
      requiredScope: invocation.events.find(event => event.required_scope)?.required_scope ?? "",
      decision: invocation.authorization === "ALLOW" ? "allow" : invocation.authorization === "DENY" ? "deny" : "unknown",
      reason: invocation.reason, argsRedacted: {},
      resultStatus: ({ SUCCEEDED: "ok", FAILED: "error", NOT_EXECUTED: "not_executed", UNKNOWN: "unknown" } as const)[invocation.execution],
    })), filters);
  }
  override getSourceInfo(): DataSourceInfo { return this.source; }
  override async getPolicy() { return null; }
  override async getPolicySourceInfo(): Promise<PolicySourceInfo> { return { kind: "unavailable", label: "Gateway policy is not ingested" }; }
  override async getSnapshot(): Promise<ConsoleDataSnapshot> {
    const gateway = await this.load();
    const events = await this.listAuditEvents();
    return { gateway, events, overview: deriveOverview(events), agents: deriveAgents(events), runs: deriveRuns(events), tools: deriveTools(events),
             policy: null, policySource: await this.getPolicySourceInfo(), source: this.source };
  }
}
