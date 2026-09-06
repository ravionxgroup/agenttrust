import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { AgentPolicyView, PolicySourceInfo, PolicyView } from "../domain";
import { fixturePolicy } from "../../fixtures/policy";

export interface PolicyLoadResult {
  policy: PolicyView | null;
  source: PolicySourceInfo;
}

export async function loadPolicyFromEnvironment(): Promise<PolicyLoadResult> {
  const policyPath = process.env.AGENTTRUST_POLICY_PATH;
  if (!policyPath) {
    return {
      policy: fixturePolicy,
      source: { kind: "fixtures", label: "Demo policy fixture" },
    };
  }

  try {
    await access(policyPath, constants.R_OK);
    const text = await readFile(policyPath, "utf8");
    return {
      policy: parseSimplePolicyYaml(text),
      source: { kind: "yaml", label: "Local policy data" },
    };
  } catch {
    return {
      policy: null,
      source: { kind: "unavailable", label: "Policy unavailable", warningCount: 1 },
    };
  }
}

export function parseSimplePolicyYaml(text: string): PolicyView {
  const lines = text.split(/\r?\n/).map((line) => stripComment(line)).filter((line) => line.trim().length > 0);
  let issuer = "agenttrust-local";
  let defaultTtlSeconds = 300;
  const agents = new Map<string, { scopes: string[]; explicitTtlSeconds?: number }>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!line.startsWith(" ") && trimmed.startsWith("issuer:")) {
      issuer = parseScalar(trimmed.slice("issuer:".length)) || issuer;
      continue;
    }

    if (!line.startsWith(" ") && trimmed.startsWith("default_ttl_seconds:")) {
      defaultTtlSeconds = parsePositiveInteger(trimmed.slice("default_ttl_seconds:".length), "default_ttl_seconds");
      continue;
    }

    if (trimmed !== "agents:") {
      continue;
    }

    index += 1;
    while (index < lines.length) {
      const agentLine = lines[index];
      if (!agentLine.startsWith("  ") || agentLine.startsWith("    ")) {
        index -= 1;
        break;
      }

      const agentMatch = agentLine.trim().match(/^([^:]+):\s*$/);
      if (!agentMatch) {
        throw new Error("Invalid agent policy entry");
      }

      const agentId = agentMatch[1];
      const agent: { scopes: string[]; explicitTtlSeconds?: number } = { scopes: [] };
      index += 1;

      while (index < lines.length && lines[index].startsWith("    ")) {
        const detail = lines[index].trim();
        if (detail.startsWith("scopes:")) {
          const value = detail.slice("scopes:".length).trim();
          if (value.startsWith("[")) {
            agent.scopes = parseInlineList(value);
          } else if (value.length === 0) {
            const list: string[] = [];
            index += 1;
            while (index < lines.length && lines[index].startsWith("      -")) {
              list.push(parseScalar(lines[index].trim().slice(1)));
              index += 1;
            }
            index -= 1;
            agent.scopes = list;
          }
        } else if (detail.startsWith("ttl_seconds:")) {
          agent.explicitTtlSeconds = parsePositiveInteger(detail.slice("ttl_seconds:".length), "ttl_seconds");
        }
        index += 1;
      }

      if (agent.scopes.length === 0) {
        throw new Error(`agent '${agentId}': scopes must be a non-empty list`);
      }
      agents.set(agentId, agent);
      index -= 1;
      index += 1;
    }
  }

  return {
    issuer,
    defaultTtlSeconds,
    agents: Array.from(agents, ([agentId, agent]) => ({
      agentId,
      scopes: agent.scopes,
      explicitTtlSeconds: agent.explicitTtlSeconds,
      effectiveTtlSeconds: agent.explicitTtlSeconds ?? defaultTtlSeconds,
    })).sort((a, b) => a.agentId.localeCompare(b.agentId)),
  };
}

function stripComment(line: string): string {
  let inQuote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === "'" || char === "\"") && line[index - 1] !== "\\") {
      inQuote = inQuote === char ? null : inQuote ?? char;
    }
    if (char === "#" && inQuote === null) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line.trimEnd();
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error("Expected inline string list");
  }

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner.split(",").map((item) => parseScalar(item)).filter(Boolean);
}

function parsePositiveInteger(value: string, field: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}
