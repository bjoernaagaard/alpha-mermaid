import { Schema } from "effect";
import { TaggedError as taggedError } from "effect/Schema";

export class InputError extends taggedError<InputError>()("InputError", {
  message: Schema.String,
}) {}
