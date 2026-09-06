import { AuditJsonlProvider } from "./audit-jsonl";
import type { ConsoleDataProvider } from "./provider";

export async function getConsoleDataProvider(): Promise<ConsoleDataProvider> {
  return AuditJsonlProvider.fromEnvironment();
}
