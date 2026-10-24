// Integration-only CLI: same bounded reader as the Console, never a browser route.
import ts from "typescript";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const directory = mkdtempSync(path.join(tmpdir(), "agenttrust-audit-projection-"));
try {
  const program = ts.createProgram([path.resolve("src/lib/gateway/ingest.ts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: true, skipLibCheck: true, esModuleInterop: true, outDir: directory, rootDir: path.resolve("src/lib/gateway"),
  });
  if (ts.getPreEmitDiagnostics(program).length) throw new Error("projection compilation failed");
  program.emit();
  const { readGatewayAudit } = createRequire(import.meta.url)(path.join(directory, "ingest.js"));
  process.stdout.write(JSON.stringify(await readGatewayAudit(process.env.AGENTTRUST_GATEWAY_AUDIT_PATH)));
} catch {
  process.stderr.write("Gateway audit projection unavailable\n"); process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
