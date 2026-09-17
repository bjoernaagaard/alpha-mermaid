import { Schema } from "effect";
import { TaggedError as taggedError } from "effect/Schema";

export class ParseError extends taggedError<ParseError>()("ParseError", {
  message: Schema.String,
}) {}
