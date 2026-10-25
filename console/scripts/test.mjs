import ts from "typescript";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const output = mkdtempSync(path.join(tmpdir(), "agenttrust-console-tests-"));
try {
  const selection = process.argv.slice(2);
  const files = readdirSync("tests").filter(name => /\.test\.tsx?$/.test(name) && (!selection.length || selection.includes(name))).map(name => path.resolve("tests", name));
  if (!files.length || (selection.length && files.length !== selection.length)) throw new Error("Unknown or duplicate test file selection");
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    strict: true, skipLibCheck: true, outDir: output, rootDir: process.cwd() });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: value => value, getNewLine: () => "\n" }));
    process.exitCode = 1;
  } else {
    program.emit();
    const result = spawnSync(process.execPath, ["--test", ...files.map(file => path.join(output, "tests", path.basename(file).replace(/\.tsx?$/, ".js")))],
      { stdio: "inherit", env: { ...process.env, NODE_PATH: path.resolve("node_modules") } });
    process.exitCode = result.status ?? 1;
  }
} finally { rmSync(output, { recursive: true, force: true }); }
