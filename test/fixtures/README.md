# Phase 1 source fixtures

Generated from the read-only `beautiful-mermaid` checkout at `d64e1230e4b98f84ae39cd124032ffc5f0e35ff7`, using elkjs 0.11.0.

- `flowchart.json`: `parseMermaid` → `layoutGraphSync` for `A[WWWW] --> B[i] --> C[Finish]` in all five directions. Only Phase 1 model fields are retained.
- `flowchart-lr.svg`: unmodified output from `renderMermaidSVG` for the LR fixture.

The SVG test compares the complete output after removing the source's unused reverse-arrow marker and both style blocks. It separately compares every retained derived CSS variable. Node geometry, text, edge paths, forward marker, root attributes, and element order must match exactly.

The source tests informing this slice are `parser.test.ts` (headers, rectangles, chains and repeated definitions), `edge-approach-direction.test.ts` (directional edge entry), and `renderer.test.ts` (independent positioned geometry and semantic SVG attributes).

Source copyright: © 2026 Craft Docs, MIT; see the repository's `LICENSE`. No test imports or executes the source repository.
