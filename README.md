# alpha-mermaid

An Effect-native Mermaid renderer for SVG and terminal output.

Phase 1 provides flowchart-to-SVG rendering without a DOM or Bun. pnpm manages development commands; CLI and terminal output remain planned.

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

Options are `bg` and `fg` (three- or six-digit hex colors), `font` (letters, digits, underscores, spaces and hyphens), and finite nonnegative `padding`, `nodeSpacing`, and `layerSpacing`. Defaults match the source: white/zinc colors, Inter, 40px padding, 28px node spacing and 48px layer spacing. Unknown options are rejected. SVGs retain the source's Google Fonts import, with system-font fallbacks; generating the SVG requires no network access.

This slice supports `graph`/`flowchart`, `LR`/`RL`/`TD`/`TB`/`BT`, bare or rectangular nodes with single-line plain labels, `-->` edges and chains, semicolon/newline statement separators, and full-line `%%` comments. Repeated definitions retain their original order and latest label. Labels are XML-escaped, not interpreted as markup.

Other shapes, edge labels/styles, subgraphs, rich labels, and other diagram types are not yet supported. Source fixture parity currently covers asymmetric chains in all five directions; source-specific branch bundling and layer alignment remain part of complete flowchart support.

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
