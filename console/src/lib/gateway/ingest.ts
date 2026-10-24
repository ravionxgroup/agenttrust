import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { projectInvocations, type Authorization, type Evidence, type Execution, type GatewayEvent, type GatewaySnapshot, type Stage } from "./model";

export const AUDIT_LIMITS = Object.freeze({ fileBytes: 8 * 1024 * 1024, lineBytes: 16 * 1024, records: 5000, jsonDepth: 32, responseBytes: 4 * 1024 * 1024 });
export class AuditSourceError extends Error {
  constructor(public readonly code: string) { super(code); }
}
function fail(code: string): never { throw new AuditSourceError(code); }
const hexId = /^[a-f0-9]{32}$/;
const reasons = new Set(["invocation_received", "scope_granted", "scope_not_granted", "unauthenticated", "invalid_tool", "unknown_tool", "invalid_request_body", "invalid_arguments", "execution_ok", "upstream_error", "upstream_timeout", "upstream_unavailable", "upstream_response_too_large", "dispatch_audit_failed", "request_canceled", "admission_rejected", "mcp_timeout", "mcp_unavailable", "mcp_tool_not_found", "mcp_protocol_error", "mcp_tool_execution_error", "mcp_error", "dispatch_intent", "authorization_audit_failed", "invocation_audit_failed", "unsupported_execution_version"]);
function hash(value: unknown): string { return createHash("sha256").update(String(value)).digest("hex"); }
function text(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.length <= 128 && /^[A-Za-z0-9_.:@/ -]+$/.test(value) && !/Bearer\s|eyJ[^.]*\.[^.]+\./i.test(value) ? value : "[REDACTED]";
}

/** Detect depth/duplicate keys before JSON.parse's last-key-wins behavior. */
function parseLine(line: string): Record<string, unknown> {
  const stack: { kind: string; keys: Set<string> }[] = [];
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      const start = i++;
      while (i < line.length) { if (line[i] === "\\") i += 2; else if (line[i] === '"') break; else i++; }
      let next = i + 1;
      while (/\s/.test(line[next] ?? "") && next < line.length) next++;
      if (line[next] === ":" && stack.at(-1)?.kind === "{") {
        const key = JSON.parse(line.slice(start, i + 1)) as string;
        const keys = stack.at(-1)!.keys;
        if (keys.has(key)) fail("DUPLICATE_JSON_KEY");
        keys.add(key);
      }
    } else if (char === "{" || char === "[") {
      stack.push({ kind: char, keys: new Set() });
      if (stack.length > AUDIT_LIMITS.jsonDepth) fail("JSON_TOO_DEEP");
    } else if (char === "}" || char === "]") stack.pop();
  }
  const raw: unknown = JSON.parse(line);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_RECORD");
  return raw as Record<string, unknown>;
}

function evidence(raw: Record<string, unknown>): Evidence {
  if (raw.schema_version !== 1) fail("UNSUPPORTED_SCHEMA");
  if (typeof raw.event_id !== "string" || !hexId.test(raw.event_id) || typeof raw.invocation_id !== "string" || !hexId.test(raw.invocation_id)) fail("INVALID_IDENTITY");
  if (typeof raw.request_id !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(raw.request_id)) fail("INVALID_IDENTITY");
  if (typeof raw.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(raw.timestamp) || (!Number.isFinite(Date.parse(raw.timestamp)) || new Date(raw.timestamp).toISOString().slice(0, 19) !== raw.timestamp.slice(0, 19))) fail("INVALID_TIMESTAMP");
  for (const name of ["agent_id", "run_id", "tool_id"]) if (typeof raw[name] !== "string") fail("INVALID_RECORD");
  if (raw.tool !== raw.tool_id) fail("INVALID_ALIASES");
  const auth = raw.authorization_decision as Authorization;
  const execution = raw.execution_status as Execution;
  if (!["ALLOW", "DENY", "UNKNOWN"].includes(auth) || !["SUCCEEDED", "FAILED", "NOT_EXECUTED", "UNKNOWN"].includes(execution)) fail("INVALID_STATE");
  if (raw.decision !== (auth === "ALLOW" ? "allow" : auth === "DENY" ? "deny" : "")) fail("INVALID_ALIASES");
  if (auth === "ALLOW" && (!raw.agent_id || !raw.run_id)) fail("INVALID_IDENTITY");
  const stage = raw.event_type as Stage;
  if (stage === "invocation_received") { if (auth !== "UNKNOWN" || execution !== "UNKNOWN") fail("INVALID_STAGE"); }
  else if (stage === "authorization_decision") { if (execution !== (auth === "ALLOW" ? "UNKNOWN" : "NOT_EXECUTED")) fail("INVALID_STAGE"); }
  else if (stage === "execution_attempted") { if (auth !== "ALLOW" || execution !== "UNKNOWN") fail("INVALID_STAGE"); }
  else if (stage === "execution_result") { if (auth !== "ALLOW") fail("INVALID_STAGE"); }
  else fail("INVALID_STAGE");
  const alias = stage === "authorization_decision" && auth === "ALLOW" ? "not_executed" : ({ SUCCEEDED: "ok", FAILED: "error", NOT_EXECUTED: "not_executed", UNKNOWN: "unknown" } as const)[execution];
  if (raw.result_status !== alias) fail("INVALID_ALIASES");
  const identities: Record<string, string> = {};
  for (const name of ["agent_id", "run_id", "token_id", "required_scope", "trace_id", "tool_id", "request_id"]) {
    if (raw[name] !== undefined && typeof raw[name] !== "string") fail("INVALID_RECORD");
    identities[name] = raw[name] ? hash(raw[name]) : "";
  }
  const event: GatewayEvent = { schema_version: 1, event_id: raw.event_id, invocation_id: raw.invocation_id,
    request_id: text(raw.request_id), timestamp: raw.timestamp, event_type: stage, agent_id: text(raw.agent_id), run_id: text(raw.run_id),
    tool_id: text(raw.tool_id), required_scope: text(raw.required_scope), authorization_decision: auth, execution_status: execution,
    reason: typeof raw.reason === "string" && reasons.has(raw.reason) ? raw.reason : "other" };
  return { event, fingerprint: hash(JSON.stringify(raw)), identities };
}

export function parseGatewayJsonl(data: Buffer): GatewaySnapshot {
  if (data.length > AUDIT_LIMITS.fileBytes) fail("SOURCE_TOO_LARGE");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { return fail("INVALID_UTF8"); }
  if (source && !source.endsWith("\n")) fail("INCOMPLETE_WRITE");
  const records: Evidence[] = [];
  try {
    for (const line of source.split("\n")) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > AUDIT_LIMITS.lineBytes) fail("RECORD_TOO_LARGE");
      if (records.length >= AUDIT_LIMITS.records) fail("TOO_MANY_RECORDS");
      records.push(evidence(parseLine(line)));
    }
  } catch (error) { if (error instanceof AuditSourceError) throw error; return fail("INVALID_JSONL"); }
  const snapshot = projectInvocations(records);
  if (Buffer.byteLength(JSON.stringify(snapshot)) > AUDIT_LIMITS.responseBytes) fail("VIEW_TOO_LARGE");
  return snapshot;
}

export async function readGatewayAudit(configuredPath: string | undefined): Promise<GatewaySnapshot> {
  if (!configuredPath) fail("PATH_NOT_CONFIGURED");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    if (typeof constants.O_NOFOLLOW !== "number" || typeof constants.O_NONBLOCK !== "number") fail("UNSUPPORTED_FILESYSTEM");
    if (configuredPath.includes("\0")) fail("UNSAFE_PATH");
    const target = path.resolve(configuredPath);
    // Reject symlinks in every component, not just the leaf. Use physical paths.
    let component = path.parse(target).root;
    for (const part of target.slice(component.length).split(path.sep)) {
      component = path.join(component, part);
      if ((await lstat(component)).isSymbolicLink()) fail("UNSAFE_PATH");
    }
    const before = await lstat(target);
    if (!before.isFile()) fail("UNSAFE_PATH");
    if (!(before.mode & 0o444)) fail("SOURCE_UNREADABLE");
    if (before.size > AUDIT_LIMITS.fileBytes) fail("SOURCE_TOO_LARGE");
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const after = await handle.stat();
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) fail("UNSAFE_PATH");
    if (after.size > AUDIT_LIMITS.fileBytes) fail("SOURCE_TOO_LARGE");
    const buffer = Buffer.alloc(after.size);
    let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    if (offset !== buffer.length) fail("SOURCE_CHANGED");
    return parseGatewayJsonl(buffer);
  } catch (error) {
    if (error instanceof AuditSourceError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    return fail(code === "ENOENT" ? "SOURCE_MISSING" : code === "EACCES" || code === "EPERM" ? "SOURCE_UNREADABLE" : "SOURCE_UNAVAILABLE");
  } finally { await handle?.close().catch(() => undefined); }
}
