import { Effect, Result, Schema } from "effect";

import { layoutFlowchart } from "./flowchart/layout.ts";
import type { Graph } from "./flowchart/model.ts";
import { parseFlowchart } from "./flowchart/parser.ts";
import { renderSvg } from "./flowchart/renderer.ts";
import { InputError } from "./input-error.ts";
import { LayoutError } from "./layout-error.ts";
import { RenderOptions } from "./options.ts";
import { ParseError } from "./parse-error.ts";

const decodeSource = Schema.decodeUnknownEffect(Schema.String);

const decodeOptions = Schema.decodeUnknownEffect(RenderOptions, {
  onExcessProperty: "error",
});

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

  const graph = yield* Effect.try({
    catch: (error) =>
      error instanceof ParseError
        ? error
        : new ParseError({ message: String(error) }),
    try: () => parseFlowchart(text),
  });

  const positioned = yield* layout(graph, validated);

  return renderSvg(positioned, validated);
});

/** Runs the synchronous core; throws InputError, ParseError or LayoutError on failure. */
export const renderSync = (
  source: string,
  options: RenderOptions = {}
): string =>
  Result.getOrThrow(Effect.runSync(Effect.result(render(source, options))));
