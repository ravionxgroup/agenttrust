import type { PolicyView } from "../lib/domain";

export const fixturePolicy: PolicyView = {
  issuer: "agenttrust-local",
  defaultTtlSeconds: 300,
  agents: [
    {
      agentId: "support-agent",
      scopes: ["crm.read", "kb.search", "ticket.close"],
      explicitTtlSeconds: 180,
      effectiveTtlSeconds: 180,
    },
    {
      agentId: "deploy-agent",
      scopes: ["service.status", "logs.read"],
      effectiveTtlSeconds: 300,
    },
    {
      agentId: "incident-agent",
      scopes: ["logs.read", "service.restart"],
      effectiveTtlSeconds: 300,
    },
    {
      agentId: "billing-agent",
      scopes: ["invoice.read"],
      effectiveTtlSeconds: 300,
    },
  ],
};
