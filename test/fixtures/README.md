# Phase 1 source fixtures

Generated from the read-only `beautiful-mermaid` checkout at `d64e1230e4b98f84ae39cd124032ffc5f0e35ff7`, using elkjs 0.11.0.

- `flowchart.json`: `parseMermaid` → `layoutGraphSync` for `A[WWWW] --> B[i] --> C[Finish]` in all five directions. Only Phase 1 model fields are retained.
- `flowchart-lr.svg`: unmodified output from `renderMermaidSVG` for the LR fixture.

The SVG test compares the complete output after removing the source's unused reverse-arrow marker and both style blocks. It separately compares every retained derived CSS variable. Node geometry, text, edge paths, forward marker, root attributes, and element order must match exactly.

The source tests informing this slice are `parser.test.ts` (headers, rectangles, chains and repeated definitions), `edge-approach-direction.test.ts` (directional edge entry), and `renderer.test.ts` (independent positioned geometry and semantic SVG attributes).

Source copyright: © 2026 Craft Docs, MIT; see the repository's `LICENSE`. No test imports or executes the source repository.

## Phase 3 source fixtures

`phase3.json` contains 16 inputs and unmodified `renderMermaidSVG` outputs from the same read-only baseline and pinned ELK version. Coverage includes every flowchart geometry, edge styles/terminals, inline styles, nested/disconnected groups, cross-hierarchy routing with a direction override, state/composite-state diagrams, rich labels, and asymmetric fan-out/fan-in in every direction.

The Phase 3 comparison removes only the stylesheet and whitespace between SVG elements. It separately compares every retained derived CSS variable against the source. Geometry, attributes, labels, marker definitions, and element order remain exact. Fixtures were generated under Node with TypeScript stripping and a temporary import-resolution hook for the source's extensionless imports and dependencies; the source checkout was not modified. The hook is not part of the package or test runtime.
