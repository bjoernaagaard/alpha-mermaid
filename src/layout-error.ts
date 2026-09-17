import { Schema } from "effect";
import { TaggedError as taggedError } from "effect/Schema";

export class LayoutError extends taggedError<LayoutError>()("LayoutError", {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}
