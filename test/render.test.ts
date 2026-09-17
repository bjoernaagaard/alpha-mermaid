import { readFile } from "node:fs/promises";

import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  InputError,
  LayoutError,
  ParseError,
  RenderOptions,
  render,
  renderSync,
} from "../src/index.ts";
import { layout } from "../src/render.ts";

const visible = (text: string) =>
  text
    .replace(/<style>[\s\S]*?<\/style>\n/u, "")
    .replace(/\n {2}<marker id="arrowhead-start"[\s\S]*?<\/marker>/u, "")
    .trim();

it.effect(
  "renders the requested inline flowchart identically through both APIs",
  () =>
    Effect.gen(function* sameSvg() {
      const svg = yield* render("graph LR; A --> B");
      assert.strictEqual(svg, renderSync("graph LR; A --> B"));
      assert.include(svg, 'points="100,58.45 148,58.45"');
      assert.include(svg, 'viewBox="0 0 248 116.9"');
    })
);

it.effect(
  "matches source SVG apart from unused definitions and CSS whitespace",
  () =>
    Effect.gen(function* sourceParity() {
      const source = "graph LR\n A[WWWW] --> B[i] --> C[Finish]";

      const baseline = yield* Effect.promise(() =>
        readFile(new URL("fixtures/flowchart-lr.svg", import.meta.url), "utf-8")
      );

      const svg = yield* render(source);
      assert.strictEqual(visible(svg), visible(baseline));

      for (const variable of [
        "text",
        "line",
        "arrow",
        "node-fill",
        "node-stroke",
      ]) {
        const pattern = new RegExp(`--_${variable}:\\s*(?<value>[^;]+);`, "u");
        assert.strictEqual(
          svg.match(pattern)?.groups?.value,
          baseline.match(pattern)?.groups?.value
        );
      }
    })
);

it.effect("validates options with the exported Schema", () =>
  Effect.gen(function* schemaOptions() {
    const options = yield* Schema.decodeUnknownEffect(RenderOptions)({
      bg: "#123",
      font: "Inter",
      padding: 0,
    });

    assert.strictEqual(options.padding, 0);
    assert.strictEqual(
      yield* render("graph LR; A", options),
      renderSync("graph LR; A", options)
    );
  })
);

it.effect.each([
  { padding: -1 },
  { layerSpacing: Number.NaN },
  { nodeSpacing: Number.POSITIVE_INFINITY },
  { bg: "#fff;fill:red" },
  { font: "</style><script>" },
])("returns typed input failures for invalid options %#", (options) =>
  Effect.gen(function* invalidOptions() {
    const error = yield* Effect.flip(render("graph LR; A", options));
    assert.instanceOf(error, InputError);
    assert.throws(() => renderSync("graph LR; A", options), InputError);
  })
);

it.effect("returns typed parse failures and supports tag-based recovery", () =>
  Effect.gen(function* parseFailure() {
    const error = yield* Effect.flip(render("graph LR; A -->"));
    assert.instanceOf(error, ParseError);
    assert.throws(() => renderSync("graph LR; A -->"), ParseError);

    const recovered = yield* render("sequenceDiagram").pipe(
      Effect.catchTag("ParseError", () => Effect.succeed("unsupported"))
    );

    assert.strictEqual(recovered, "unsupported");
  })
);

it.effect(
  "maps real dangling-edge ELK failures into LayoutError and recovers",
  () =>
    Effect.gen(function* layoutFailure() {
      const error = yield* Effect.flip(
        layout(
          {
            direction: "LR",
            edges: [{ source: "A", target: "missing" }],
            nodes: new Map([["A", { id: "A", label: "Start" }]]),
          },
          {}
        )
      );

      assert.instanceOf(error, LayoutError);
      assert.isDefined(error.cause);
      assert.include(yield* render("graph LR; A --> B"), 'data-to="B"');
    })
);
