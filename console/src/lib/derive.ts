import type {
  AgentDetails,
  AgentSummary,
  AuditEvent,
  AuditFilters,
  DeniedToolSummary,
  ObservedToolSummary,
  Overview,
  ToolAgentSummary,
  ToolDetails,
  ToolSummary,
  RunDetails,
  RunSummary,
} from "./domain";

export function uniqueObservedAgents(events: AuditEvent[]): string[] {
  return Array.from(new Set(events.map((event) => event.agentId))).sort();
}

export function uniqueObservedRuns(events: AuditEvent[]): string[] {
  return Array.from(new Set(events.map((event) => event.runId))).sort();
}

export function totalCalls(events: AuditEvent[]): number {
  return events.length;
}

export function allowedCalls(events: AuditEvent[]): number {
  return events.filter((event) => event.decision === "allow").length;
}

export function deniedCalls(events: AuditEvent[]): number {
  return events.filter((event) => event.decision === "deny").length;
}

export function executionErrors(events: AuditEvent[]): number {
  return events.filter((event) => event.resultStatus === "error").length;
}

export function firstObservedTimestamp(events: AuditEvent[]): number {
  return Math.min(...events.map((event) => event.ts));
}

export function lastObservedTimestamp(events: AuditEvent[]): number {
  return Math.max(...events.map((event) => event.ts));
}

export function observedWindowSeconds(events: AuditEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  return Math.max(0, lastObservedTimestamp(events) - firstObservedTimestamp(events));
}

export function distinctTools(events: AuditEvent[]): string[] {
  return Array.from(new Set(events.map((event) => event.tool))).sort();
}

export function observedToolsForEvents(events: AuditEvent[]): ObservedToolSummary[] {
  const grouped = new Map<string, AuditEvent[]>();
  for (const event of events) {
    const key = `${event.tool}\u0000${event.requiredScope}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  return Array.from(grouped.values())
    .map((toolEvents) => ({
      tool: toolEvents[0].tool,
      requiredScope: toolEvents[0].requiredScope,
      calls: totalCalls(toolEvents),
      allowedCalls: allowedCalls(toolEvents),
      deniedCalls: deniedCalls(toolEvents),
      executionErrors: executionErrors(toolEvents),
    }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
}

export function deriveTools(events: AuditEvent[]): ToolSummary[] {
  const grouped = new Map<string, AuditEvent[]>();
  for (const event of events) {
    grouped.set(event.tool, [...(grouped.get(event.tool) ?? []), event]);
  }

  return Array.from(grouped, ([tool, toolEvents]) => {
    const scopeCounts = new Map<string, number>();
    for (const event of toolEvents) {
      scopeCounts.set(event.requiredScope, (scopeCounts.get(event.requiredScope) ?? 0) + 1);
    }

    return {
      tool,
      requiredScopes: Array.from(scopeCounts, ([requiredScope, calls]) => ({ requiredScope, calls }))
        .sort((a, b) => b.calls - a.calls || a.requiredScope.localeCompare(b.requiredScope)),
      agentsObserved: uniqueObservedAgents(toolEvents).length,
      runsObserved: uniqueObservedRuns(toolEvents).length,
      calls: totalCalls(toolEvents),
      allowedCalls: allowedCalls(toolEvents),
      deniedCalls: deniedCalls(toolEvents),
      executionErrors: executionErrors(toolEvents),
      lastSeen: lastObservedTimestamp(toolEvents),
    };
  }).sort((a, b) => b.calls - a.calls || b.lastSeen - a.lastSeen || a.tool.localeCompare(b.tool));
}

export function deriveToolDetails(events: AuditEvent[], toolName: string): ToolDetails | null {
  const toolEvents = events.filter((event) => event.tool === toolName);
  if (toolEvents.length === 0) {
    return null;
  }

  const summary = deriveTools(toolEvents)[0];
  const agentGroups = new Map<string, AuditEvent[]>();
  for (const event of toolEvents) {
    agentGroups.set(event.agentId, [...(agentGroups.get(event.agentId) ?? []), event]);
  }

  const agents: ToolAgentSummary[] = Array.from(agentGroups, ([agentId, agentEvents]) => ({
    agentId,
    calls: totalCalls(agentEvents),
    allowedCalls: allowedCalls(agentEvents),
    deniedCalls: deniedCalls(agentEvents),
    executionErrors: executionErrors(agentEvents),
    lastSeen: lastObservedTimestamp(agentEvents),
  })).sort((a, b) => b.calls - a.calls || b.lastSeen - a.lastSeen || a.agentId.localeCompare(b.agentId));

  return {
    ...summary,
    agents,
    recentEvents: recentEvents(toolEvents, 8),
    recentRuns: deriveRuns(toolEvents).slice(0, 8),
  };
}

export function recentEvents(events: AuditEvent[], limit = 8): AuditEvent[] {
  return [...events].sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function deniedCallsGroupedByTool(events: AuditEvent[], limit = 5): DeniedToolSummary[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.decision === "deny") {
      counts.set(event.tool, (counts.get(event.tool) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([tool, deniedCalls]) => ({ tool, deniedCalls }))
    .sort((a, b) => b.deniedCalls - a.deniedCalls || a.tool.localeCompare(b.tool))
    .slice(0, limit);
}

export function filterAuditEvents(events: AuditEvent[], filters: AuditFilters = {}): AuditEvent[] {
  const query = filters.search?.trim().toLowerCase();

  return events.filter((event) => {
    if (filters.agentId && event.agentId !== filters.agentId) {
      return false;
    }
    if (filters.decision && filters.decision !== "all" && event.decision !== filters.decision) {
      return false;
    }
    if (filters.tool && event.tool !== filters.tool) {
      return false;
    }
    if (!query) {
      return true;
    }

    const haystack = [
      event.eventId,
      event.agentId,
      event.runId,
      event.tokenId,
      event.tool,
      event.requiredScope,
      event.decision,
      event.reason ?? "",
      event.resultStatus ?? "",
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

export function deriveOverview(events: AuditEvent[]): Overview {
  const allowed = allowedCalls(events);
  const denied = deniedCalls(events);
  const errors = executionErrors(events);

  return {
    agentsObserved: uniqueObservedAgents(events).length,
    runsObserved: uniqueObservedRuns(events).length,
    toolCalls: totalCalls(events),
    allowedCalls: allowed,
    deniedCalls: denied,
    toolErrors: errors,
    recentEvents: recentEvents(events),
    mostDeniedTools: deniedCallsGroupedByTool(events),
    authorizationSummary: {
      allowed,
      denied,
      errors,
    },
  };
}

export function deriveAgents(events: AuditEvent[]): AgentSummary[] {
  const grouped = new Map<string, AuditEvent[]>();
  for (const event of events) {
    grouped.set(event.agentId, [...(grouped.get(event.agentId) ?? []), event]);
  }

  return Array.from(grouped, ([agentId, agentEvents]) => ({
    agentId,
    runsObserved: uniqueObservedRuns(agentEvents).length,
    toolCalls: totalCalls(agentEvents),
    allowedCalls: allowedCalls(agentEvents),
    deniedCalls: deniedCalls(agentEvents),
    executionErrors: executionErrors(agentEvents),
    distinctTools: distinctTools(agentEvents).length,
    lastSeen: lastObservedTimestamp(agentEvents),
  })).sort((a, b) => b.lastSeen - a.lastSeen || a.agentId.localeCompare(b.agentId));
}

export function deriveAgentDetails(events: AuditEvent[], agentId: string): AgentDetails | null {
  const agentEvents = events.filter((event) => event.agentId === agentId);
  if (agentEvents.length === 0) {
    return null;
  }

  const summary = deriveAgents(agentEvents)[0];
  return {
    ...summary,
    recentRuns: deriveRuns(agentEvents).slice(0, 8),
    recentEvents: recentEvents(agentEvents, 8),
    observedTools: observedToolsForEvents(agentEvents),
  };
}

export function deriveRuns(events: AuditEvent[]): RunSummary[] {
  const grouped = new Map<string, AuditEvent[]>();
  for (const event of events) {
    grouped.set(event.runId, [...(grouped.get(event.runId) ?? []), event]);
  }

  return Array.from(grouped, ([runId, runEvents]) => {
    const newestEvent = [...runEvents].sort((a, b) => b.ts - a.ts)[0];
    const tokenIdsObserved = Array.from(new Set(runEvents.map((event) => event.tokenId))).sort();
    return {
      runId,
      agentId: newestEvent.agentId,
      tokenId: tokenIdsObserved.length === 1 ? tokenIdsObserved[0] : null,
      tokenIdsObserved,
      firstObservedAt: firstObservedTimestamp(runEvents),
      lastObservedAt: lastObservedTimestamp(runEvents),
      observedWindowSeconds: observedWindowSeconds(runEvents),
      toolCalls: totalCalls(runEvents),
      allowedCalls: allowedCalls(runEvents),
      deniedCalls: deniedCalls(runEvents),
      executionErrors: executionErrors(runEvents),
      distinctTools: distinctTools(runEvents).length,
    };
  }).sort((a, b) => b.lastObservedAt - a.lastObservedAt || a.runId.localeCompare(b.runId));
}

export function deriveRunDetails(events: AuditEvent[], runId: string): RunDetails | null {
  const runEvents = events.filter((event) => event.runId === runId);
  if (runEvents.length === 0) {
    return null;
  }

  const summary = deriveRuns(runEvents)[0];
  return {
    ...summary,
    events: [...runEvents].sort((a, b) => a.ts - b.ts),
  };
}
