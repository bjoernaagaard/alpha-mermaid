import { Effect, Result, Schema } from "effect";
import { decodeXML } from "entities";

import { layoutFlowchart } from "./flowchart/layout.ts";
import type { Graph } from "./flowchart/model.ts";
import { parseFlowchart } from "./flowchart/parser.ts";
import { renderSvg } from "./flowchart/renderer.ts";
import { InputError } from "./input-error.ts";
import { LayoutError } from "./layout-error.ts";
import { RenderOptions } from "./options.ts";
import { ParseError } from "./parse-error.ts";
import {
  errorPlaceholder,
  extractAccessibility,
  scanDirectives,
} from "./source-directives.ts";

const decodeSource = Schema.decodeUnknownEffect(Schema.String);

const decodeOptions = Schema.decodeUnknownEffect(RenderOptions, {
  onExcessProperty: "error",
});

const decodeDirective = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RenderOptions),
  {
    onExcessProperty: "error",
  }
);

export const layout = Effect.fnUntraced(function* layout(
  graph: Graph,
  options: RenderOptions
) {
  return yield* Effect.try({
    catch: (cause) =>
      new LayoutError({ cause, message: "Flowchart layout failed" }),
    try: () => layoutFlowchart(graph, options),
  });
});

const renderDiagram = Effect.fnUntraced(function* renderDiagram(
  text: string,
  options: RenderOptions
) {
  const accessible = extractAccessibility(text);

  const graph = yield* Effect.try({
    catch: (error) =>
      error instanceof ParseError
        ? error
        : new ParseError({ message: String(error) }),
    try: () => parseFlowchart(accessible.text),
  });

  const positioned = yield* layout(graph, options);
  const svg = renderSvg(positioned, options);

  return accessible.tags
    ? svg.replace(">", () => `>\n${accessible.tags}`)
    : svg;
});

const renderSource = Effect.fnUntraced(function* renderSource(
  text: string,
  options: RenderOptions
) {
  const scanned = yield* Effect.try({
    catch: (error) =>
      error instanceof ParseError
        ? error
        : new ParseError({ message: String(error) }),
    try: () => scanDirectives(decodeXML(text)),
  });

  const defaults: RenderOptions = {};

  for (const config of scanned.configs) {
    const decoded = yield* decodeDirective(config).pipe(
      Effect.mapError(
        (error) =>
          new ParseError({
            message: `Invalid init directive: ${error.message}`,
          })
      )
    );

    Object.assign(defaults, decoded);
  }

  const effective = { ...defaults, ...options };

  return yield* renderDiagram(scanned.text, effective).pipe(
    Effect.catch((error) =>
      effective.suppressErrors
        ? Effect.succeed(
            errorPlaceholder(effective.parseError ?? error.message)
          )
        : Effect.fail(error)
    )
  );
});

export const render = Effect.fnUntraced(function* render(
  source: string,
  options: RenderOptions = {}
): Effect.fn.Return<string, InputError | ParseError | LayoutError> {
  const text = yield* decodeSource(source).pipe(
    Effect.mapError((error) => new InputError({ message: error.message }))
  );

  const validated = yield* decodeOptions(options).pipe(
    Effect.mapError((error) => new InputError({ message: error.message }))
  );

  return yield* renderSource(text, validated).pipe(
    Effect.catch((error) =>
      validated.suppressErrors
        ? Effect.succeed(
            errorPlaceholder(validated.parseError ?? error.message)
          )
        : Effect.fail(error)
    )
  );
});

/** Runs the synchronous core; throws InputError, ParseError or LayoutError on failure. */
export const renderSync = (
  source: string,
  options: RenderOptions = {}
): string =>
  Result.getOrThrow(Effect.runSync(Effect.result(render(source, options))));
