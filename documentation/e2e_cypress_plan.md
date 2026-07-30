# Plan: Cypress E2E Testing for CI/CD

## Goal

Add end-to-end tests that boot the real editor in a real browser, exercise the
basic features (startup, primitive creation, outliner, selection, delete,
undo/redo), and run them in GitHub Actions on every PR and push to `main`.

## Current State (findings)

- Stack: Bun 1.3.14, Vite 5 (build output → `docs/`), TypeScript, Three.js.
- Unit tests: Vitest + jsdom under `tests/` (`bun run testrun`).
- CI: `.github/workflows/ci.yml` has a `quality` job (format, unit tests,
  build) that desktop builds and Pages deploy already depend on.
- UI: toolbar buttons carry `aria-label` attributes; there are **no
  `data-testid` attributes** anywhere in `src/`.
- App boot: `index.html` → `src/app.ts` → `ViewportLayoutManager` renders into
  `#editor-container`; WebGL canvas is created by the shared render surface.
- The editor already exposes a programmatic surface
  (`src/ai/client/editor_api*.ts`) that E2E tests can reuse instead of
  simulating fragile mouse drags on a WebGL canvas.

## Key Design Decisions

### 1. Cypress as the only new devDependency

Cypress is test tooling (like Vitest/jsdom), not a runtime dependency, so the
"Three.js only" rule is respected. Install with:

```bash
bun add -d cypress
```

`cypress` must be added to `trustedDependencies` in `package.json` so Bun runs
its postinstall (downloads the Cypress binary), otherwise run
`bun x cypress install` explicitly after install.

### 2. Test against the built app via a test bridge

Pointer-drag interactions on a WebGL canvas are the flakiest part of any 3D
E2E suite. We avoid them:

- Cypress `cy.visit('/?e2e=1')` loads the app with an **E2E test bridge
  enabled** (see below).
- Feature-level actions (create box, select, delete, undo) go through the
  bridge, which delegates to the existing editor API / command stack.
- Real DOM interactions are still used where they are stable and meaningful:
  clicking toolbar buttons, opening menus, clicking outliner rows.

### 3. Deterministic app-ready signal

Canvas rendering is async. The bridge sets
`window.__AIWORLDED_READY__ = true` after the first successful render pass. Every spec
waits for it with a custom `cy.waitForEditor()` command instead of
`cy.wait(ms)` (no hardcoded timing, per AGENTS.md).

## File / Folder Layout (new files)

```
cypress.config.ts                 # Cypress configuration (TypeScript)
cypress/
  tsconfig.json                   # Isolated TS project for Cypress types
  e2e/
    app_boot.cy.ts                # Smoke: app boots, viewport renders
    create_primitive.cy.ts        # Toolbar/menu creation flow
    outliner_selection.cy.ts      # Outliner lists + selects objects
    delete_and_undo.cy.ts         # Delete, undo, redo via commands
  support/
    e2e.ts                        # Support entry (imports commands)
    commands.ts                   # cy.waitForEditor(), cy.editorApi()
src/
  e2e_bridge/
    test_bridge.ts                # window.__AIWORLDED__ bridge (e2e=1 gated)
    test_bridge_scene.ts          # Scene-introspection helpers for specs
tests/
  e2e_bridge/
    test_bridge.test.ts           # Vitest unit tests for the bridge
documentation/
  e2e_testing.md                  # How to run/write E2E tests
.github/workflows/ci.yml          # Extended with an `e2e` job
package.json                      # New scripts + cypress devDependency
.gitignore                        # Ignore cypress screenshots/videos
```

Snake_case filenames match AGENTS.md; every class lives in its own file.

## Phase 1 — Tooling and Boot Smoke Test

1. `bun add -d cypress` and add `"trustedDependencies": ["cypress"]` to
   `package.json`.
2. Create `cypress.config.ts`:
   - `e2e.baseUrl = 'http://localhost:4173'` (the `vite preview` port).
   - `video: false`, `screenshotOnRunFailure: true` initially.
   - `defaultCommandTimeout` raised modestly for first WebGL frame.
3. Create `cypress/tsconfig.json` extending the root config but with
   `"types": ["cypress"]` so Cypress globals never collide with the Vitest
   globals used under `tests/`. The root `tsconfig.json`
   (`include: src + tests`) and `vitest.config.ts`
   (`include: tests/**`) already ignore `cypress/`; keep it that way.
4. Build the test bridge (`src/e2e_bridge/test_bridge.ts`):
   - Imported once from `src/app.ts`.
   - No-ops unless the bundle uses development/`e2e` mode and
     `new URLSearchParams(location.search).has('e2e')`.
   - Publishes `window.__AIWORLDED__` with `whenReady()`, `getSceneSummary()`
     (object names/types from the outliner model), `createBox()`,
     `deleteSelected()`, `undo()`, `redo()`, `selectByName()` — all delegating
     to the existing editor API and command stack, never reimplementing logic.
   - Sets `window.__AIWORLDED_READY__` after the first frame.
5. Unit tests (`tests/e2e_bridge/test_bridge.test.ts`) per AGENTS.md:
   constructs its own editor fixture, verifies the bridge no-ops without the
   query param and reports correct scene summaries with it.
6. Write `app_boot.cy.ts`:
   - visits `/?e2e=1`, waits for readiness;
   - asserts `#editor-container` contains a `<canvas>`;
   - asserts no `console.error` / uncaught exceptions during boot
     (listener installed in `cypress/support/e2e.ts`);
   - asserts the toolbar and outliner panels exist in the DOM.
7. New scripts in `package.json`:
   - `"e2e:open": "cypress open"` (interactive, needs `bun run dev`)
   - `"e2e:run": "cypress run"` (headless, needs the app already served)
   - `"e2e:preview": "vite preview --port 4173 --strictPort"`

## Phase 2 — Basic Feature Specs

All specs create what they need through the bridge and assert through the real
DOM (outliner rows, properties panel, toolbar state) so they test user-visible
behavior, not internals. No hardcoded positions/rotations.

1. `create_primitive.cy.ts`
   - Uses the real toolbar (`[aria-label]` selectors already exist) to open
     the Create menu; clicks Box.
   - Asserts the outliner gains one row and the row name matches the bridge's
     scene summary.
2. `outliner_selection.cy.ts`
   - Creates two primitives via the bridge, clicks the real outliner row of
     the second, asserts it receives the selection styling and the bridge
     reports it as the selection.
3. `delete_and_undo.cy.ts`
   - Creates a primitive, selects and deletes it via the Delete keyboard
     shortcut dispatched to the focused outliner, asserts the row is gone.
   - Sends `Ctrl+Z` / `Ctrl+Shift+Z` (real keyboard events) and asserts the
     row returns / disappears again.
4. Custom commands in `cypress/support/commands.ts`:
   - `cy.waitForEditor()` — polls `window.__AIWORLDED_READY__`.
   - `cy.editorApi(fn)` — typed wrapper around `cy.window()` bridge access so
     specs never poke `window` directly.

## Phase 3 — CI Integration

Add an `e2e` job to `.github/workflows/ci.yml`, and make `desktop-build` and
`deploy-pages` depend on it (`needs: [quality, e2e]`) so a broken app can
never ship.

```yaml
e2e:
  name: Cypress E2E
  runs-on: ubuntu-latest
  needs: quality
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: 1.3.14
    - name: Cache Cypress binary
      uses: actions/cache@v4
      with:
        path: ~/.cache/Cypress
        key: cypress-${{ runner.os }}-${{ hashFiles('bun.lock') }}
    - run: bun install --frozen-lockfile
    - run: bun x cypress install
    - run: bun run e2e:build
    - name: Serve build and run Cypress
      run: |
        bun run e2e:preview &
        bun x wait-on http://localhost:4173 --timeout 60000
        bun x cypress run --browser chrome
    - name: Upload failure screenshots
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: cypress-screenshots
        path: cypress/screenshots
```

Notes:

- `ubuntu-latest` runs Chrome headless with SwiftShader WebGL, which Cypress
  supports out of the box; if a blank canvas ever appears, add
  `CYPRESS_ELECTRON_EXTRA_ARGS='--use-gl=swiftshader'` (escape hatch, not
  default).
- Cypress binary caching keeps the ~100 MB download off the critical path.
- Estimated runtime addition: 2–4 minutes.

## Phase 4 — Hardening (fast follow-ups, can be separate PRs)

1. Enable Cypress `testRetries: 1` **only** in CI after observing flake rates;
   never retry locally so real flakes surface.
2. Enable `video: true` on failure or keep screenshots-only for speed.
3. Add a canvas "not fully black" pixel check to `app_boot.cy.ts` (read pixels
   via the bridge's rendered-frame hook) once rendering proves stable.
4. Document everything in `documentation/e2e_testing.md`: local workflow
   (`bun run dev` + `bun run e2e:open`), how the bridge works, and the rule
   that specs assert through the DOM, not the bridge.

## Acceptance Criteria

- `bun run testrun` and `bun run build` still pass (AGENTS.md gate).
- `bun x cypress run` passes locally against `vite preview`.
- CI `e2e` job runs on PRs and blocks desktop builds and Pages deploys.
- Failure screenshots are downloadable from CI.
- No `data-testid`-free brittle selectors for creation flows: toolbar uses
  existing `aria-label`s; dynamic rows are located by visible text.
- Writing a new spec requires only `cy.visit('/?e2e=1')`,
  `cy.waitForEditor()`, and bridge commands — no timing hacks.

## Risks and Mitigations

| Risk                                   | Mitigation                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Headless Chrome without GPU → no WebGL | SwiftShader works by default; SwiftShader launch flag documented as fallback |
| Cypress binary download slows CI       | `actions/cache` on `~/.cache/Cypress` keyed by `bun.lock`                    |
| Cypress vs Vitest global type clash    | Isolated `cypress/tsconfig.json` with Cypress-only types                     |
| Flaky canvas pointer input             | Bridge drives model-level actions; real input only on DOM UI                 |
| Bun skips Cypress postinstall          | `trustedDependencies` + explicit `cypress install` in CI                     |
| Bridge leaks into production           | Gated behind `?e2e=1`; covered by unit test asserting the no-op path         |
