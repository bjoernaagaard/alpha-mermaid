import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderSync } from "alpha-mermaid";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const temp = mkdtempSync(path.join(tmpdir(), "alpha-mermaid-cli-"));

const source = "graph LR; A[WWWW] --> B[i] --> C[Finish]";

const expected = `${renderSync(source)}\n`;

const run = (args, input = "") =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: temp,
    encoding: "utf-8",
    input,
    timeout: 10_000,
  });

try {
  writeFileSync(path.join(temp, "input.mmd"), source);

  for (const args of [["-e", source], ["input.mmd"], ["-"], []]) {
    const result = run(args, source);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, "");
  }

  const written = run(["input.mmd", "-o", "output.svg"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(written.stdout, "");
  assert.equal(readFileSync(path.join(temp, "output.svg"), "utf-8"), expected);

  for (const args of [
    [],
    ["-e", ""],
    ["-e", "graph LR; A -->"],
    ["--padding=-1", "input.mmd"],
    ["--unknown"],
    ["-e", source, "input.mmd"],
  ]) {
    const failed = run(args);
    assert.equal(failed.status, 2);
    assert.equal(failed.stdout, "");
    assert.match(failed.stderr, /^alpha-mermaid: error: [^\n]+\n$/u);
  }

  const missing = run(["missing.mmd"]);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /^alpha-mermaid: error: [^\n]+\n$/u);

  for (const flag of ["--help", "--version"]) {
    const result = run([flag]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /alpha-mermaid/u);
    assert.equal(result.stderr, "");
  }

  assert.ok(readFileSync(cli, "utf-8").startsWith("#!/usr/bin/env node\n"));
} finally {
  rmSync(temp, { force: true, recursive: true });
}
