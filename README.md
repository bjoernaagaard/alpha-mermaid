# alpha-mermaid

An Effect-native Mermaid renderer for SVG and terminal output.

Flowchart and state-diagram SVG rendering is available through the Effect-native library and Node CLI, without a DOM or Bun. pnpm manages development commands; terminal output remains planned.

Track scope, phase status, exit criteria, and risks in the [migration plan](MIGRATION.md).

## Render a flowchart

```ts
import { Effect } from "effect";
import { render, renderSync } from "alpha-mermaid";

const source = "graph LR; A[Start] --> B[Finish]";
const svg = await Effect.runPromise(render(source));
const sameSvg = renderSync(source);
```

`render(source, options?)` returns `Effect<string, InputError | ParseError | LayoutError>` with no required services. `renderSync` returns the same SVG and throws those error classes directly. Both APIs validate input and options at runtime. `RenderOptions` is an exported Effect Schema class; plain option objects are also accepted.

Options are `bg` and `fg` (three- or six-digit hex colors), `font` (letters, digits, underscores, spaces and hyphens), and finite nonnegative `padding`, `nodeSpacing`, `layerSpacing`, and `componentSpacing`. Defaults are white/zinc colors, Inter, 40px padding, 28px node/component spacing and 48px layer spacing. Unknown options are rejected. SVGs retain the source's Google Fonts import, with system-font fallbacks; generating the SVG requires no network access.

Flowcharts support all source node geometries (including diamonds, cylinders, subroutines, and slanted nodes), directed/bidirectional/unarrowed edges, dotted/thick/invisible edges, circle/cross terminals, labels, chains, parallel nodes (`&`), nested subgraphs, direction overrides, disconnected components, `classDef`, `class`, `:::`, `style`, and `linkStyle`. All five directions (`LR`, `RL`, `TD`, `TB`, `BT`) are supported. Semicolons/newlines separate statements; full-line `%%` comments are ignored. Explicit flowchart definitions retain insertion order and update the label and geometry.

`stateDiagram` and `stateDiagram-v2` support transitions, labels, aliases, descriptions, start/end pseudostates (`[*]`), and composite states. Labels support line breaks and the source's limited bold, italic, underline, and strikethrough formatting; other markup is escaped rather than executed. This is the source baseline's syntax subset, not the complete Mermaid specification.

`accTitle:` and `accDescr:` lines become escaped SVG `<title>` and `<desc>` elements. JSON `%%{init: {...}}%%` and `%%{initialize: {...}}%%` directives accept the current `RenderOptions`; later directives override earlier ones, and explicit API/CLI options take precedence. Theme names, palette enrichment, and other diagram types remain planned.

Errors normally remain typed failures. Set `suppressErrors: true` to return the source-compatible SVG error placeholder for parse/layout failures, optionally with a custom `parseError` message. Invalid API arguments still produce `InputError`; suppression does not bypass schema validation. The CLI can use these options through an init directive.

The migration preserves source-baseline rendering quirks: node borders can partly cover terminal/reverse-arrow markers, and slanted-node clipping can leave a short connector stub. Fixture parity does not imply these source behaviors have been redesigned.

## Command line

Build with `pnpm build`, then run:

```bash
node dist/cli.js --inline 'graph LR; A[Start] --> B[Finish]' -o diagram.svg
node dist/cli.js input.mmd --output diagram.svg
printf 'graph LR; A --> B' | node dist/cli.js > diagram.svg
node dist/cli.js --help
```

The package executable is named `alpha-mermaid`. Omit the input file or use `-` to read stdin. `--inline` (`-e`) cannot be combined with a file argument. Output defaults to stdout; `--output` (`-o`) selects a file, or `-` for stdout. SVG output ends with a newline. Output files are overwritten only after rendering succeeds.

Rendering flags are `--bg`, `--fg`, `--font`, `--padding`, `--node-spacing`, and `--layer-spacing`, with the same validation and defaults as the library options. Quote hex colors, for example `--bg '#18181B' --fg '#FAFAFA'`.

Exit codes are `0` for success, `2` for invalid arguments, input, or Mermaid syntax, and `1` for layout or I/O failures. Expected failures produce one diagnostic on stderr and no help text on stdout. `--help` and `--version` do not read input.

## Development

```bash
pnpm install
pnpm check
```

Use these focused commands while developing:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
