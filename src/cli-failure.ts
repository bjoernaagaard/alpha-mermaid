import { Runtime, Schema } from "effect";
import { TaggedError as taggedError } from "effect/Schema";

export class CliFailure extends taggedError<CliFailure>()("CliFailure", {
  code: Schema.Number,
  message: Schema.String,
}) {
  override readonly [Runtime.errorReported] = false;

  override get [Runtime.errorExitCode]() {
    return this.code;
  }
}
