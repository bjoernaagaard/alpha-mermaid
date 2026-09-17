import { Schema } from "effect";

const spacing = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const color = Schema.String.check(
  Schema.isPattern(/^#(?:[\da-f]{3}|[\da-f]{6})$/iu)
);

export class RenderOptions extends Schema.Class<RenderOptions>("RenderOptions")(
  {
    bg: Schema.optionalKey(color),
    componentSpacing: Schema.optionalKey(spacing),
    fg: Schema.optionalKey(color),
    font: Schema.optionalKey(
      Schema.String.check(Schema.isPattern(/^[\w -]+$/u))
    ),
    layerSpacing: Schema.optionalKey(spacing),
    nodeSpacing: Schema.optionalKey(spacing),
    padding: Schema.optionalKey(spacing),
    parseError: Schema.optionalKey(Schema.String),
    suppressErrors: Schema.optionalKey(Schema.Boolean),
  }
) {}
