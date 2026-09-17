import assert from "node:assert/strict";

import { InputError, ParseError, render, renderSync } from "alpha-mermaid";
import { Effect } from "effect";

assert.equal("document" in globalThis, false);

assert.equal("Bun" in globalThis, false);

const timer = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");

const source = "graph LR; A[Wide label] --> B[i]";

const svg = renderSync(source);

assert.equal(await Effect.runPromise(render(source)), svg);

const state =
  "stateDiagram-v2\n[*] --> Waiting\nWaiting --> Done : finish\nDone --> [*]";

assert.equal(await Effect.runPromise(render(state)), renderSync(state));

assert.match(renderSync(state), /data-shape="state-end"/u);

assert.match(svg, /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/u);

assert.match(svg, /data-from="A" data-to="B"/u);

assert.throws(() => renderSync(42), InputError);

assert.throws(() => renderSync(source, { padding: "40" }), InputError);

assert.throws(() => renderSync(source, { unknownOption: true }), InputError);

assert.throws(() => renderSync("graph LR; A -->"), ParseError);

assert.deepEqual(
  Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
  timer
);
