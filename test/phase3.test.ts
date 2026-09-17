import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { InputError, ParseError, render, renderSync } from "../src/index.ts";
import fixtures from "./fixtures/phase3.json";

const visible = (svg: string): string =>
  svg.replace(/<style>[\s\S]*?<\/style>\n/u, "").replaceAll(/>\s+</gu, "><");

it.effect.each(fixtures)(
  "matches source SVG for $name through both APIs",
  ({ source, svg: baseline }) =>
    Effect.gen(function* sourceParity() {
      const svg = yield* render(source);
      assert.strictEqual(visible(svg), visible(baseline));
      assert.strictEqual(svg, renderSync(source));

      for (const match of svg.matchAll(
        /(?<name>--_[\w-]+):\s*(?<value>[^;]+);/gu
      )) {
        const pattern = new RegExp(
          `${match.groups?.name}:\\s*(?<value>[^;]+);`,
          "u"
        );

        assert.strictEqual(
          match.groups?.value,
          baseline.match(pattern)?.groups?.value
        );
      }
    })
);

it.effect(
  "merges init directives in order and gives explicit options precedence",
  () =>
    Effect.gen(function* optionPrecedence() {
      const source =
        '%%{init: {"padding": 3, "bg": "#123", "nodeSpacing": 11}}%%\n%%{initialize: {"padding": 7, "layerSpacing": 73}}%%\ngraph LR; A[Wide] --> B[i]';

      assert.strictEqual(
        yield* render(source, { padding: 0 }),
        renderSync("graph LR; A[Wide] --> B[i]", {
          bg: "#123",
          layerSpacing: 73,
          nodeSpacing: 11,
          padding: 0,
        })
      );
    })
);

it.effect(
  "escapes accessibility metadata and removes it before graph parsing",
  () =>
    Effect.gen(function* accessibility() {
      const svg = yield* render(
        'graph LR\naccTitle: Old\naccTitle: A $& <B>\naccDescr: "Description"\nA --> B'
      );

      assert.include(
        svg,
        "<title>A $&amp; &lt;B&gt;</title>\n<desc>&quot;Description&quot;</desc>"
      );
      assert.notInclude(svg, 'data-id="accTitle"');
      assert.notInclude(svg, "<title>Old</title>");
    })
);

it.effect.each([
  '%%{init: {"padding": -1}}%%',
  '%%{init: {"unknown": true}}%%',
  '%%{init: {"padding": "40"}}%%',
  '%%{init: {"suppressErrors": "true"}}%%',
  '%%{init: {"padding": 3,}}%%',
  "%%{init: []}%%",
  '%%{init: {"padding": 3}',
  '%%{init: {"padding": 3',
])("returns typed failures for malformed directives %#", (directive) =>
  Effect.gen(function* invalidDirective() {
    const source = `${directive}\ngraph LR; A --> B`;
    assert.instanceOf(yield* Effect.flip(render(source)), ParseError);
    assert.throws(() => renderSync(source), ParseError);
  })
);

it.effect(
  "suppresses parse failures only when requested, escaping a custom message",
  () =>
    Effect.gen(function* suppression() {
      const source =
        '%%{init: {"suppressErrors": true, "parseError": "Bad }%% \\\" <script>&"}}%%\ngraph LR; A -->';

      const svg = yield* render(source);
      assert.strictEqual(svg, renderSync(source));
      assert.include(svg, 'viewBox="0 0 640 48"');
      assert.include(svg, "Bad }%% &quot; &lt;script&gt;&amp;");
      assert.instanceOf(
        yield* Effect.flip(render(source, { suppressErrors: false })),
        ParseError
      );
      assert.instanceOf(
        yield* Effect.flip(
          render("graph LR; A", { padding: -1, suppressErrors: true })
        ),
        InputError
      );
    })
);

it.effect(
  "can suppress malformed directives through validated caller options",
  () =>
    Effect.gen(function* suppressedDirective() {
      const options = { parseError: "Invalid input", suppressErrors: true };
      assert.include(
        yield* render("%%{init: {", options),
        ">Invalid input</text>"
      );
    })
);
