import { assert, it } from "@effect/vitest";
import {
  Console,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
  Runtime,
  Stdio,
  Stream,
  Terminal,
} from "effect";
import { forEach as consume } from "effect/Sink";
import { ChildProcessSpawner } from "effect/unstable/process";

import { runCli } from "../src/cli-command.ts";
import { CliFailure } from "../src/cli-failure.ts";
import { renderSync } from "../src/index.ts";

const source = "graph LR; A[WWWW] --> B[i] --> C[Finish]";

const expected = `${renderSync(source)}\n`;

const harness = Effect.fnUntraced(function* harness(
  args: string[],
  input = "",
  terminal = false
) {
  const original = yield* Console.Console;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const reads: string[] = [];

  const files = new Map([
    ["input.mmd", source],
    ["output.svg", "untouched"],
  ]);

  const fallback = FileSystem.makeNoop({});

  const layer = Layer.mergeAll(
    Path.layer,
    FileSystem.layerNoop({
      readFileString: (path) =>
        Effect.suspend(() => {
          reads.push(path);
          const contents = files.get(path);

          return contents === undefined
            ? fallback.readFileString(path)
            : Effect.succeed(contents);
        }),
      writeFileString: (path, contents) =>
        path === "unwritable.svg"
          ? fallback.writeFileString(path, contents)
          : Effect.sync(() => {
              files.set(path, contents);
            }),
    }),
    Stdio.layerTest({
      args: Effect.succeed(args),
      stdin: Stream.fromIterable(
        [...new TextEncoder().encode(input)].map((byte) => Uint8Array.of(byte))
      ),
      stdinIsTerminal: Effect.succeed(terminal),
      stdout: () =>
        consume((chunk: string | Uint8Array) =>
          Effect.sync(() => {
            stdout.push(
              Predicate.isString(chunk)
                ? chunk
                : new TextDecoder().decode(chunk)
            );
          })
        ),
    }),
    Layer.succeed(Console.Console, {
      ...original,
      error: (...values) => {
        stderr.push(`${values.map(String).join(" ")}\n`);
      },
      log: (...values) => {
        stdout.push(`${values.map(String).join(" ")}\n`);
      },
    }),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        display: (text) =>
          Effect.sync(() => {
            stdout.push(text);
          }),
        readInput: Effect.die("Unexpected interactive input"),
        readLine: Effect.die("Unexpected interactive input"),
        rows: Effect.succeed(24),
      })
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("Unexpected subprocess"))
    )
  );

  return { files, layer, reads, stderr, stdout };
});

it.effect.each([
  ["--inline", source],
  ["-e", source, "-o", "-"],
  ["input.mmd"],
  ["-"],
  [],
])("renders each input mode with provided services %#", (args) =>
  Effect.gen(function* inputModes() {
    const test = yield* harness(args, source);
    yield* runCli().pipe(Effect.provide(test.layer));
    assert.strictEqual(test.stdout.join(""), expected);
    assert.deepStrictEqual(test.stderr, []);
    assert.deepStrictEqual(
      test.reads,
      args.includes("input.mmd") ? ["input.mmd"] : []
    );
  })
);

it.effect(
  "writes only to the selected file and forwards validated non-default options",
  () =>
    Effect.gen(function* outputFile() {
      const test = yield* harness([
        "input.mmd",
        "-o",
        "output.svg",
        "--padding",
        "0",
        "--node-spacing",
        "19",
        "--layer-spacing",
        "73.5",
        "--bg",
        "#18181B",
        "--fg",
        "#abc",
        "--font",
        "Roboto Mono",
      ]);

      yield* runCli().pipe(Effect.provide(test.layer));
      assert.strictEqual(
        test.files.get("output.svg"),
        `${renderSync(source, { bg: "#18181B", fg: "#abc", font: "Roboto Mono", layerSpacing: 73.5, nodeSpacing: 19, padding: 0 })}\n`
      );
      assert.deepStrictEqual(test.stdout, []);
      assert.deepStrictEqual(test.stderr, []);
    })
);

it.effect("decodes UTF-8 across stdin chunk boundaries", () =>
  Effect.gen(function* unicodeInput() {
    const input = "graph LR; A[界😀] --> B[é]";
    const test = yield* harness([], input);
    yield* runCli().pipe(Effect.provide(test.layer));
    assert.strictEqual(test.stdout.join(""), `${renderSync(input)}\n`);
  })
);

it.effect.each([
  ["-e", source, "input.mmd"],
  ["-e", source, "-"],
  ["input.mmd", "extra.mmd"],
  ["--unknown"],
  ["--padding=-1", "input.mmd"],
  ["--padding=NaN", "input.mmd"],
  ["--layer-spacing=Infinity", "input.mmd"],
  ["--bg=red", "input.mmd"],
  ["--font=</style>", "input.mmd"],
  ["--inline"],
])("rejects invalid usage before reading or writing %#", (args) =>
  Effect.gen(function* invalidUsage() {
    const test = yield* harness(args);
    const error = yield* Effect.flip(runCli().pipe(Effect.provide(test.layer)));
    assert.instanceOf(error, CliFailure);
    assert.strictEqual(error[Runtime.errorExitCode], 2);
    assert.deepStrictEqual(test.stdout, []);
    assert.deepStrictEqual(test.reads, []);
    assert.lengthOf(test.stderr, 1);
    assert.match(test.stderr[0] ?? "", /^alpha-mermaid: error: [^\n]+\n$/u);
  })
);

it.effect("does not overwrite an output file on parse failure", () =>
  Effect.gen(function* failedRender() {
    const test = yield* harness(["-e", "graph LR; A -->", "-o", "output.svg"]);
    const error = yield* Effect.flip(runCli().pipe(Effect.provide(test.layer)));
    assert.strictEqual(error.code, 2);
    assert.strictEqual(test.files.get("output.svg"), "untouched");
    assert.deepStrictEqual(test.stdout, []);
    assert.deepStrictEqual(test.stderr, [
      "alpha-mermaid: error: Expected edge target: A -->\n",
    ]);
  })
);

it.effect.each([["missing.mmd"], ["input.mmd", "-o", "unwritable.svg"]])(
  "reports I/O failures with exit code 1 %#",
  (args) =>
    Effect.gen(function* ioFailure() {
      const test = yield* harness(args);

      const error = yield* Effect.flip(
        runCli().pipe(Effect.provide(test.layer))
      );

      assert.strictEqual(error.code, 1);
      assert.deepStrictEqual(test.stdout, []);
      assert.lengthOf(test.stderr, 1);
    })
);

it.effect(
  "rejects interactive missing input rather than waiting for a terminal",
  () =>
    Effect.gen(function* noInput() {
      const test = yield* harness([], "", true);

      const error = yield* Effect.flip(
        runCli().pipe(Effect.provide(test.layer))
      );

      assert.strictEqual(error.code, 2);
      assert.deepStrictEqual(test.stderr, [
        "alpha-mermaid: error: Provide --inline, a file, or piped stdin\n",
      ]);
    })
);

it.effect.each(["--help", "--version"])(
  "prints %s without reading input",
  (flag) =>
    Effect.gen(function* informationalFlags() {
      const test = yield* harness([flag], "", true);
      yield* runCli().pipe(Effect.provide(test.layer));
      assert.include(test.stdout.join(""), "alpha-mermaid");
      assert.deepStrictEqual(test.stderr, []);
      assert.deepStrictEqual(test.reads, []);
    })
);
