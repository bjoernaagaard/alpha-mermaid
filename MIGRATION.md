# Alpha Mermaid Migration Plan

## Purpose

This document tracks the migration from `beautiful-mermaid` to `alpha-mermaid`. The migration must preserve verified rendering behavior while it creates a new, Effect-native public API and toolchain.

Source repository: `/Users/bsa/Projects/beautiful-mermaid`

Source baseline: `d64e123` (`main`)

Target repository: `/Users/bsa/Projects/alpha-mermaid`

Update the source baseline before you migrate later source changes. Do not mix a source update with an unrelated migration phase.

## Status legend

- `[x]` Complete and verified
- `[ ]` Not started
- `[~]` In progress
- `[!]` Blocked; add the blocker after the item

## Target architecture

Effect owns the application boundaries. Pure functions own deterministic rendering work.

```text
untrusted input
      |
      v
Effect Schema validation -> tagged errors -> orchestration
      |
      v
detect -> parse -> model -> layout -> serialize
      |
      +--------------------+
      v                    v
     SVG              terminal text
```

Use Effect for:

- public failure channels;
- schema validation at untrusted boundaries;
- command-line processing;
- file, console, and process access;
- resource lifetime and replaceable runtime capabilities.

Use plain functions for:

- source scanning and parsing;
- graph and geometry transformations;
- text measurement;
- diagram-specific layout calculations;
- SVG and terminal serialization.

Do not create a service that only forwards to a pure parser, layout function, or renderer. A service must own a real capability or lifecycle.

## Migration rules

1. Migrate one working vertical slice at a time.
2. Preserve behavior before you change behavior.
3. Derive expected output from the source fixtures, not from the new code.
4. Keep parser, layout, and renderer ownership separate.
5. Replace obsolete names and aliases. Do not add compatibility layers.
6. Add Effect at public and runtime boundaries. Do not wrap deterministic code only to increase Effect usage.
7. Keep all enabled Ultracite and anti-slop rules at error severity.
8. Keep the Craft Docs MIT notice with migrated source.
9. Run `pnpm check` before you mark a phase complete.
10. Make each completed phase a separate commit.

## Progress

### Phase 0: Project foundation

Status: complete

- [x] Select pnpm as the package manager.
- [x] Pin Effect and `@effect/platform-node` to matching release candidates.
- [x] Configure TypeScript, tsup, Vitest, and `@effect/vitest`.
- [x] Configure Ultracite with Oxlint, Oxfmt, and type-aware checks.
- [x] Vendor and enable generic anti-slop rules.
- [x] Enable all Effect-specific anti-slop rules.
- [x] Record anti-slop source provenance and preserve vendor licenses.
- [x] Add project guidance for Effect and architecture boundaries.
- [x] Produce ESM JavaScript, source maps, and declarations.
- [x] Verify a frozen pnpm install and `pnpm check`.

Exit evidence:

- `pnpm install --frozen-lockfile` passes.
- `pnpm check` passes.
- An intentional manual `_tag` object fails the Effect anti-slop rule.

### Phase 1: First complete rendering slice

Goal: render a basic flowchart to SVG through the new public API.

- [ ] Define `RenderOptions` with Effect Schema.
- [ ] Define the smallest stable tagged error set for input, parse, and layout failures.
- [ ] Define the Effect-native `render` API.
- [ ] Define a synchronous convenience API for the synchronous core.
- [ ] Migrate flowchart diagram detection.
- [ ] Migrate the flowchart model and parser for nodes and directed edges.
- [ ] Migrate text measurement required by the slice.
- [ ] Migrate the ELK adapter required by the slice.
- [ ] Encapsulate ELK's synchronous worker bypass behind one internal boundary.
- [ ] Migrate the minimum theme variables and SVG serializer.
- [ ] Port asymmetric parser, layout, and SVG fixture tests.
- [ ] Verify that the built package can render without Bun or a DOM.

Exit criteria:

- A consumer can render `graph LR; A --> B` through the Effect API.
- The synchronous convenience API produces the same SVG.
- Parse and layout failures have typed error channels.
- The source fixture comparison passes.
- `pnpm check` passes.

### Phase 2: Effect CLI

Goal: deliver one usable end-to-end product surface before more diagram types are added.

- [ ] Add `effect/unstable/cli` commands and validated flags.
- [ ] Read source from an inline argument, a file, or standard input.
- [ ] Write SVG to standard output or a selected file.
- [ ] Provide Node services at the composition root.
- [ ] Run the command with `NodeRuntime.runMain`.
- [ ] Map tagged failures to stable messages and exit codes.
- [ ] Test the command with provided services. Do not use module mocks.
- [ ] Add the executable to package metadata and the build.

Exit criteria:

- The CLI renders the Phase 1 fixture from inline text, a file, and stdin.
- Invalid input returns a nonzero exit code and one clear diagnostic.
- CLI tests do not access the user's real files.
- `pnpm check` passes.

### Phase 3: Complete flowchart and state support

- [ ] Port all flowchart node shapes.
- [ ] Port edge types, labels, terminals, and inline edge styles.
- [ ] Port subgraphs and nested subgraphs.
- [ ] Port direction overrides and disconnected graph behavior.
- [ ] Port class definitions, class assignments, and node styles.
- [ ] Port state diagrams and composite states.
- [ ] Port accessibility title and description handling.
- [ ] Port init-directive option handling.
- [ ] Port suppressed-error SVG behavior if it remains part of the new API.
- [ ] Port flowchart and state SVG fixtures.

Exit criteria:

- All migrated flowchart and state fixtures match their approved output.
- Every supported direction has an asymmetric test.
- Nested and disconnected graphs have integration coverage.
- `pnpm check` passes.

### Phase 4: Terminal renderer

- [ ] Migrate the terminal canvas and character roles.
- [ ] Migrate grid placement and edge routing.
- [ ] Migrate A* pathfinding and edge bundling.
- [ ] Migrate Unicode and plain ASCII character sets.
- [ ] Migrate ANSI, true-color, and HTML color modes that remain in scope.
- [ ] Add CLI output-format selection.
- [ ] Port flowchart and state terminal fixtures.

Exit criteria:

- Flowchart and state diagrams render through the library and CLI.
- Unicode and plain ASCII fixtures pass.
- Color output never changes uncolored geometry.
- `pnpm check` passes.

### Phase 5: Specialized diagram types

Migrate each row as an independent vertical slice. A row is complete only when its parser, model, layout, renderer, fixtures, and public routing are complete.

| Diagram     | SVG      | Terminal      | Status |
| ----------- | -------- | ------------- | ------ |
| Sequence    | Required | Required      | [ ]    |
| Class       | Required | Required      | [ ]    |
| ER          | Required | Required      | [ ]    |
| XY chart    | Required | Required      | [ ]    |
| Pie         | Required | Not supported | [ ]    |
| Quadrant    | Required | Not supported | [ ]    |
| Git graph   | Required | Not supported | [ ]    |
| Timeline    | Required | Not supported | [ ]    |
| Gantt       | Required | Not supported | [ ]    |
| Requirement | Required | Not supported | [ ]    |
| Journey     | Required | Not supported | [ ]    |
| Block       | Required | Not supported | [ ]    |
| Mindmap     | Required | Not supported | [ ]    |
| Sankey      | Required | Not supported | [ ]    |
| C4          | Required | Not supported | [ ]    |

For each row:

- [ ] Port parser tests before renderer integration tests.
- [ ] Keep its parser, layout, renderer, and types in one owned directory.
- [ ] Route through the shared public API and CLI.
- [ ] Verify source fixtures or add independently derived expected output.
- [ ] Run `pnpm check` and commit the completed slice.

### Phase 6: Theme and public API completion

- [ ] Port the two-color theme foundation.
- [ ] Port optional line, accent, muted, surface, and border colors.
- [ ] Port the approved built-in themes.
- [ ] Port Shiki-theme conversion without adding Shiki as a runtime dependency.
- [ ] Support CSS custom properties and transparent SVG output.
- [ ] Finalize package exports. Keep internal modules private.
- [ ] Add public API type tests.
- [ ] Document supported Mermaid syntax and explicit unsupported syntax.
- [ ] Remove the temporary scaffold-only runtime test when product tests cover the same integration.

Exit criteria:

- Public exports are intentional and covered by type tests.
- Theme tests cover mono and enriched modes.
- Runtime dependencies do not include development-only site tools.
- `pnpm check` passes.

### Phase 7: Browser bundle, showcase, and editor

- [ ] Define a browser entry point without an accidental global API.
- [ ] Port the showcase data and generate a static showcase.
- [ ] Port the editor only after library behavior is stable.
- [ ] Replace Bun-specific site generation APIs or keep them in an explicit development-only package. Do not make Bun a consumer requirement.
- [ ] Port sharing, export, pan, zoom, and theme controls that remain in scope.
- [ ] Add browser-level interaction and accessibility checks.
- [ ] Render representative diagrams and inspect screenshots on light and dark themes.

Exit criteria:

- The showcase exercises every supported diagram type.
- The editor renders valid input and displays typed failures.
- Browser output matches library output for the same source and options.
- Required UI states have inspected visual evidence.
- `pnpm check` passes.

### Phase 8: Parity audit and release readiness

- [ ] Run the complete source fixture inventory against the migrated project.
- [ ] Account for each source test as migrated, replaced, or intentionally removed.
- [ ] Compare package exports, CLI behavior, and documented diagram support.
- [ ] Remove migration-only helpers, obsolete comments, and dead source paths.
- [ ] Confirm that no source imports reach into `beautiful-mermaid`.
- [ ] Confirm all retained third-party notices and source attribution.
- [ ] Benchmark representative small, large, and nested diagrams.
- [ ] Run a clean frozen install and `pnpm check`.
- [ ] Prepare release notes that list intentional differences.

Release or publication is not part of this phase unless the user gives explicit approval.

## Verification strategy

Use the smallest check that can detect a mistake during development. Run the full check before phase completion.

| Change            | Required verification                               |
| ----------------- | --------------------------------------------------- |
| Pure parser       | Focused parser tests and typecheck                  |
| Layout            | Coordinate assertions and approved output fixture   |
| SVG renderer      | Structural assertions and approved SVG fixture      |
| Terminal renderer | Exact text fixture                                  |
| Effect boundary   | `it.effect` with typed failure assertions           |
| Service or Layer  | Test Layer; no module mock                          |
| CLI               | In-memory service test and process-level smoke test |
| Browser UI        | Interaction check and inspected screenshot          |
| Phase completion  | `pnpm check`                                        |

Tests must distinguish the correct behavior from a plausible wrong implementation. Use asymmetric graphs, both sides of boundaries, and explicit output assertions. Do not only assert that rendering did not throw.

## Known risks

### ELK synchronous integration

The source calls private ELK worker internals to keep rendering synchronous. An ELK update can break this path without a type error. Keep this code behind one module, pin ELK, and test the synchronous contract directly.

### Effect release candidates

Effect RC APIs can change. Keep matching Effect package versions. Read the installed Effect guidance and migration notes before every upgrade. Make an Effect upgrade a separate change.

### Output drift

Small text metrics or layout changes can alter many fixtures. Do not accept a large fixture update as one change. Explain the intended geometry change and inspect representative output first.

### Anti-slop migration pressure

The source was not written for the target rules. Do not disable rules or hide types with assertions. Port in small slices and change implementation structure when a rule identifies a real ownership or performance problem.

### Source drift

The source fork can change during migration. Update the source baseline in this document and migrate those changes in a separate commit before you continue.

## Definition of done

The migration is complete when:

- all approved diagram types in the matrix are complete;
- the Effect library API and CLI have typed, tested failure behavior;
- SVG and terminal fixtures pass;
- the browser surfaces use the same rendering core;
- no compatibility aliases or source-repository imports remain;
- package exports expose no internal modules;
- licenses and provenance records are complete;
- a frozen install and `pnpm check` pass from a clean checkout.
