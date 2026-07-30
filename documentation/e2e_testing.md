# E2E Testing (Cypress)

Automated end-to-end tests boot the real editor in a real browser and check
basic workflows through the actual DOM: startup, toolbar menus, and the
outliner.

## Local workflow

```bash
bun install                        # once; downloads the Cypress binary
bun run dev                        # terminal 1: editor on the dev server
bun run e2e:open                   # terminal 2: interactive Cypress runner
```

Headless run against the production build (this is what CI does):

```bash
bun run e2e:build
bun run e2e:preview                # serves docs/ on http://localhost:4173
bun run e2e:run                    # second terminal; add --browser chrome
```

## How it works

Specs visit the app with the `?e2e=1` query parameter
(`cy.visit('/?e2e=1')`). The bridge also requires a development bundle or the
explicit `e2e` Vite build mode used by `bun run e2e:build`. Production builds
therefore cannot expose `window.__AIWORLDED__`, even when a URL contains the
query parameter.

The bridge:

- exposes a ready flag (`window.__AIWORLDED_READY__`) that flips true after
  the first successful render pass — always wait with `cy.waitForEditor()`, never
  `cy.wait(milliseconds)`;
- delegates to production command paths (`CommandStack`, `SelectionManager`,
  primitive creation) through `cy.editorApi()`, so specs drive the real
  editor instead of simulating fragile WebGL canvas drags.

Assertions go through the real DOM where possible (toolbar buttons, menu
items, outliner rows); the bridge is for state setup and cross-checks.

## TypeScript notes

Cypress 15 detects `typescript@^7` and transpiles specs with Babel
(`@babel/preset-typescript`) instead of ts-loader, because TS 7 ships only a
native compiler. `cypress.config.ts` therefore registers the project-local
`@cypress/webpack-batteries-included-preprocessor` and points its version
detection at `typescript/package.json` (the package has no JS entry point).
Do not remove those packages when upgrading tools.

The unit-test counterpart for the bridge lives in
`tests/e2e_bridge/` (Vitest), keeping every bridge behavior covered without a
browser.

## CI

`.github/workflows/ci.yml` job `e2e` builds the web bundle, serves it with
`vite preview`, and runs all specs in headless Chrome on Ubuntu. Desktop
builds and the GitHub Pages deploy require this job, so a broken editor can
no longer ship. Failure screenshots are uploaded as the
`cypress-screenshots` artifact.
