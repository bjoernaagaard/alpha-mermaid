import {
  Console,
  Effect,
  FileSystem,
  Match,
  Option,
  Stdio,
  Stream,
} from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CliFailure } from "./cli-failure.ts";
import { VERSION } from "./index.ts";
import { InputError } from "./input-error.ts";
import { RenderOptions } from "./options.ts";
import { render } from "./render.ts";

export const command = Command.make(
  "alpha-mermaid",
  {
    bg: Flag.String("bg").pipe(
      Flag.withSchema(RenderOptions.fields.bg),
      Flag.optional
    ),
    fg: Flag.String("fg").pipe(
      Flag.withSchema(RenderOptions.fields.fg),
      Flag.optional
    ),
    file: Argument.String("file").pipe(
      Argument.withDescription("Input file, or - for stdin; defaults to stdin"),
      Argument.optional
    ),
    font: Flag.String("font").pipe(
      Flag.withSchema(RenderOptions.fields.font),
      Flag.optional
    ),
    inline: Flag.String("inline").pipe(
      Flag.withAlias("e"),
      Flag.withDescription("Inline Mermaid source"),
      Flag.optional
    ),
    layerSpacing: Flag.Finite("layer-spacing").pipe(
      Flag.withSchema(RenderOptions.fields.layerSpacing),
      Flag.optional
    ),
    nodeSpacing: Flag.Finite("node-spacing").pipe(
      Flag.withSchema(RenderOptions.fields.nodeSpacing),
      Flag.optional
    ),
    output: Flag.String("output").pipe(
      Flag.withAlias("o"),
      Flag.withDescription("Output SVG file, or - for stdout"),
      Flag.withDefault("-")
    ),
    padding: Flag.Finite("padding").pipe(
      Flag.withSchema(RenderOptions.fields.padding),
      Flag.optional
    ),
  },
  Effect.fnUntraced(function* execute(config) {
    const fs = yield* FileSystem.FileSystem;
    const stdio = yield* Stdio.Stdio;

    if (Option.isSome(config.inline) && Option.isSome(config.file)) {
      return yield* new InputError({
        message: "Use either --inline or a file argument, not both",
      });
    }

    let source: string;

    if (Option.isSome(config.inline)) {
      source = config.inline.value;
    } else if (Option.isSome(config.file) && config.file.value !== "-") {
      source = yield* fs.readFileString(config.file.value);
    } else {
      if (yield* stdio.stdinIsTerminal) {
        return yield* new InputError({
          message: "Provide --inline, a file, or piped stdin",
        });
      }

      source = yield* Stream.mkString(Stream.decodeText(stdio.stdin));
    }

    const entries = [
      "bg",
      "fg",
      "font",
      "padding",
      "nodeSpacing",
      "layerSpacing",
    ] as const;

    const values = Object.fromEntries(
      entries.flatMap((key) => {
        const value = config[key];

        return Option.isSome<string | number>(value)
          ? [[key, value.value]]
          : [];
      })
    );

    const svg = yield* render(source, values);

    yield* config.output === "-"
      ? Stream.run(Stream.succeed(`${svg}\n`), stdio.stdout())
      : fs.writeFileString(config.output, `${svg}\n`);
  })
).pipe(Command.withDescription("Render a Mermaid flowchart as SVG"));

export const runCli = Effect.fnUntraced(function* runCli() {
  const console = yield* Console.Console;
  const messages: string[] = [];
  // The CLI framework prints help even on invalid arguments. Buffer it so a
  // failed invocation cannot contaminate redirected SVG output.
  yield* Command.run(command, { renderErrors: false, version: VERSION }).pipe(
    Effect.provideService(Console.Console, {
      ...console,
      log: (...args) => {
        messages.push(args.map(String).join(" "));
      },
    }),
    Effect.catchTag("ShowHelp", (error) =>
      error.errors.length === 0
        ? Effect.void
        : Effect.fail(
            new CliFailure({
              code: 2,
              message: error.errors.map((item) => item.message).join("; "),
            })
          )
    ),
    Effect.mapError((error) =>
      Match.value(error).pipe(
        Match.tag("CliFailure", (failure) => failure),
        Match.tag(
          "InputError",
          "ParseError",
          (failure) => new CliFailure({ code: 2, message: failure.message })
        ),
        Match.tag(
          "LayoutError",
          "PlatformError",
          (failure) => new CliFailure({ code: 1, message: failure.message })
        ),
        Match.orElse(
          (failure) => new CliFailure({ code: 2, message: failure.message })
        )
      )
    ),
    Effect.tapError((error) =>
      Console.error(
        `alpha-mermaid: error: ${error.message.replaceAll(/\s+/gu, " ")}`
      )
    )
  );

  for (const message of messages) {
    yield* Console.log(message);
  }
});
