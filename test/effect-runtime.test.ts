import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { VERSION } from "../src/index.ts";

it.effect("runs the Effect test runtime", () =>
  Effect.gen(function* testRuntime() {
    const version = yield* Effect.succeed(VERSION);

    assert.strictEqual(version, "0.0.0");
  })
);
