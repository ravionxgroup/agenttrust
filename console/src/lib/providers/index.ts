import "server-only";
import { AuditJsonlProvider } from "./audit-jsonl";
import { FixturesProvider } from "./fixtures";
import { GatewayAuditProvider } from "./gateway";
import type { ConsoleDataProvider } from "./provider";

export async function getConsoleDataProvider(): Promise<ConsoleDataProvider> {
  const mode = process.env.AGENTTRUST_CONSOLE_SOURCE ?? "gateway";
  if (mode === "fixtures") return new FixturesProvider();
  if (mode === "sdk") return AuditJsonlProvider.fromEnvironment();
  return new GatewayAuditProvider(mode === "gateway" ? process.env.AGENTTRUST_GATEWAY_AUDIT_PATH : undefined,
                                 mode === "gateway" ? undefined : "INVALID_SOURCE_MODE");
}
