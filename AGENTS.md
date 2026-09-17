# Alpha Mermaid Agent Guidance

## Toolchain

- Use pnpm for dependency and script commands. Do not add Bun runtime APIs to published code.
- Run `pnpm check` before completion. Use `pnpm typecheck`, `pnpm lint`, `pnpm test`, or `pnpm build` for focused checks.
- Run `pnpm fix` for formatter and safe lint fixes. Do not weaken Ultracite or anti-slop rules to make checks pass.

## Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, read `node_modules/effect/AGENTS.md` completely. Follow its linked guides when required. Search `node_modules/effect/src` when the guide does not cover an API or concept.

Use Effect for typed failures, validation, I/O, resources, and runtime capabilities. Keep deterministic parsing, geometry, graph transforms, and serialization as plain functions unless Effect provides a concrete benefit.

## Architecture

- Keep diagram implementations in focused parser, layout, and renderer modules under `src/`.
- Keep the package entry point intentional. Do not create internal barrel files.
- Target Node.js and browsers. pnpm is the development package manager, not a runtime requirement.
- Do not add compatibility aliases or preserve obsolete APIs during this one-wave migration.

## Vendored tooling

`tools/oxlint/anti-slop/` is vendored and ignored by lint and format checks. Preserve its license and `UPSTREAM.md` records. Use the documented anti-slop install or update workflow instead of replacing the directory manually.
