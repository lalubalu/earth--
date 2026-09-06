# Contributing

Thanks for looking. This is a small project with a narrow scope: public feeds in, explained signals out, no fabricated data anywhere. Contributions that keep to that are welcome.

## Setup

```powershell
pnpm install
pnpm dev
```

Node 20.9+ and pnpm 12. The scripts are cross-platform; please keep them that way (no `rm -rf`, no bash-only syntax in `package.json`).

## Before you open a pull request

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same four steps. `pnpm build` must succeed with no environment variables set.

## Conventions

- Every `.ts`, `.tsx`, `.js`, `.mjs`, `.css`, and `.glsl` file starts with the header `/* Programmer: <your name> / Date: MM/DD/YYYY */` using the day the file was created.
- Comments are sparse and explain the why or a gotcha. Do not narrate what the code obviously does.
- Engine code is pure. No `Date.now()`, no `Math.random()`, no I/O; the clock is `input.now`.
- Feed adapters are written against a live response. When you add or change one, capture a trimmed fixture under `apps/dashboard/test/fixtures` and note the date you verified the shape in the adapter's doc comment.
- Colour is never the only encoding in the UI. Severity has a word, kinds have shapes, feed health has text.
- Never fabricate data, screenshots, or numbers. If a feed is down the UI says so.

## Engine changes

- Add or update tests in `packages/signal-engine/test`. Synthetic data comes from the seeded generator in `test/helpers.ts`.
- Document any new configuration field in `types.ts` with a comment that says what the number means and why the default is what it is.
- Run `pnpm changeset` and pick a bump. Patch for fixes, minor for new detectors or fields, major for a breaking output change.

## Dashboard changes

- Keep the three.js scene on demand rendering. Anything that animates must respect `prefers-reduced-motion`.
- Keep the AI routes honest: the model only sees signals and series summaries, the answer is validated, and the fallback must work with no key.
- Check the page at 375 px and 1440 px. Lighthouse numbers are in the README; do not regress accessibility below 100.

## Reporting problems

Use the issue templates. For a feed that has changed shape upstream, include the URL and a sample of the new response.
