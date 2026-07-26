# Build Command Reference

This is the quick-reference companion to [Building and running AiWorldEd](building_and_running.md). Use the walkthrough when setting up the project for the first time; use this page when you already know the workflow and need the exact command, its side effects, or its output.

Run these commands from the repository root—the folder containing `package.json`.

## Recommended command sequences

### First checkout

```console
bun install --frozen-lockfile
bun run testrun
bun run build
```

### Everyday browser development

```console
bun run dev
```

In a second terminal, run tests as needed:

```console
bun run test
```

### Validate a finished change

```console
bun run testrun
bun run build
```

### Reproduce the primary automated checks

```console
bun run ci
```

### Build and run the desktop application

```console
bun run desktop:build
bun run desktop:run
```

## Command summary

| Command                         | Purpose                                           | Stays running?      | Modifies project files?                                                   |
| ------------------------------- | ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `bun install --frozen-lockfile` | Install exact recorded dependencies               | No                  | Creates or updates local dependency storage; does not change the lockfile |
| `bun run dev`                   | Start the browser development server              | Yes                 | No authored source changes                                                |
| `bun run test`                  | Start Vitest in its interactive/default mode      | Usually yes         | No                                                                        |
| `bun run testrun`               | Run the complete test suite once                  | No                  | No                                                                        |
| `bun run build`                 | Format supported files and build the browser site | No                  | Yes: formats files and replaces generated `docs/` output                  |
| `bun run preview`               | Serve the generated browser build locally         | Yes                 | No                                                                        |
| `bun run format`                | Format supported project files                    | No                  | Yes                                                                       |
| `bun run format:check`          | Report formatting differences without fixing them | No                  | No                                                                        |
| `bun run typecheck`             | Run the baseline TypeScript check                 | No                  | No                                                                        |
| `bun run typecheck:strict`      | Run the stricter informational TypeScript check   | No                  | No                                                                        |
| `bun run ci`                    | Check formatting, run tests, and build            | No                  | Yes: the build stage replaces generated `docs/` output                    |
| `bun run desktop:dev`           | Watch and launch the desktop app for development  | Yes                 | May create desktop build/cache output                                     |
| `bun run desktop:build`         | Package the desktop app for the current platform  | No                  | Replaces desktop build/artifact output                                    |
| `bun run desktop:run`           | Launch the most recent compatible desktop build   | Until the app exits | No authored source changes                                                |

## Dependency commands

### Install reproducibly

```console
bun install --frozen-lockfile
```

Use this after cloning, switching to a revision with dependency changes, or cleaning local packages. It fails instead of rewriting `bun.lock` when the package manifest and lockfile disagree.

### Install while intentionally changing dependencies

```console
bun install
```

Use this only when dependency changes are intended. Review both `package.json` and `bun.lock` before accepting the result.

## Browser development commands

### `bun run dev`

Runs:

```text
vite --host
```

Purpose:

- Starts the fast development server.
- Rebuilds changed modules while the server is running.
- Makes the server available through local and, where permitted, network addresses.

Expected result:

- The terminal prints one or more browser addresses.
- The process remains active until you press `Ctrl+C`.
- No production files are written to `docs/`.

### `bun run build`

Runs:

```text
prettier --write --log-level silent .
vite build
```

Purpose:

- Formats supported repository files.
- Produces the optimized browser application.
- Verifies that Vite can transform and bundle the editor.

Output:

```text
docs/
├── index.html
├── index.js
└── copied public assets
```

Important side effects:

- Supported authored files may be reformatted.
- Generated browser files in `docs/` are replaced.
- Authored user guides remain in the separate `documentation/` folder.

Success criteria:

- The command exits with code zero.
- Vite reports that the build completed.
- A bundle-size warning alone does not mean the build failed.

### `bun run preview`

Runs:

```text
vite preview
```

Purpose:

- Serves the existing `docs/` production output.
- Lets you verify production asset paths and behavior locally.

Requirements:

- Run `bun run build` first.
- Keep the terminal open while previewing.
- Stop the server with `Ctrl+C`.

## Test commands

### `bun run test`

Runs:

```text
vitest
```

Use during development when you want Vitest's default interactive or watch-oriented behavior. The process can remain active and rerun relevant tests after changes.

### `bun run testrun`

Runs:

```text
vitest run
```

Use for a definitive one-time result. This is the required full-suite command before finishing a project change.

Success criteria:

- Every test file passes.
- The command exits with code zero.
- Simulated-browser canvas warnings are informational when the suite still passes.

### Run one test file

Use Vitest directly through Bun:

```console
bunx vitest run tests/ui/toolbar.test.ts
```

Replace the path with the test file relevant to the change. A targeted test is useful during development but does not replace the required full `bun run testrun`.

### Run several related test files

```console
bunx vitest run tests/ui/toolbar.test.ts tests/ui/toolbar_icons.test.ts
```

List each file explicitly. Finish with the complete test suite before sharing the change.

## Formatting commands

### `bun run format`

Runs:

```text
prettier --write .
```

Formats all supported files found by Prettier. Review the resulting changes, especially if the working tree already contained unrelated edits.

### `bun run format:check`

Runs:

```text
prettier --check .
```

Checks formatting without rewriting files. This is the appropriate command when you only want to confirm formatting state.

## Type-checking commands

### `bun run typecheck`

Runs:

```text
tsc --noEmit
```

Checks the baseline TypeScript configuration without creating JavaScript output.

### `bun run typecheck:strict`

Runs:

```text
tsc --project tsconfig.strict.json --noEmit
```

Uses the project's strongest TypeScript settings. This check is currently informational in automated builds while existing strict errors are being resolved; unit tests and the production build remain required.

## Combined validation

### `bun run ci`

Runs these scripts in order:

```text
bun run format:check
bun run testrun
bun run build
```

Use it to reproduce the primary quality job locally. The stages stop at the first failure.

Although the formatting check is read-only, the final build runs Prettier in write mode and replaces the generated `docs/` output.

## Desktop commands

### `bun run desktop:dev`

Runs:

```text
electrobun dev
```

Purpose:

- Starts Electrobun's development workflow.
- Watches desktop entry points.
- Launches the application in its desktop shell.

Use it for native window, desktop file-dialog, and updater-bridge testing. Stop the process with `Ctrl+C` after closing the application if it remains active.

### `bun run desktop:build`

Runs:

```text
electrobun build --env=stable
```

Purpose:

- Builds the desktop application for the current operating system.
- Runs the configured icon post-processing.
- Creates packages suitable for local inspection or later release packaging.

Output folders:

| Folder               | Contents                      |
| -------------------- | ----------------------------- |
| `desktop_build/`     | Intermediate Electrobun files |
| `desktop_artifacts/` | Packaged desktop outputs      |

Build Windows artifacts on Windows, Linux artifacts on Linux, and macOS artifacts on macOS.

### `bun run desktop:run`

Runs:

```text
electrobun run
```

Launches the most recent compatible Electrobun build. It does not create a missing or stale package; use `bun run desktop:build` first when needed.

## Release utility commands

These utilities support automated release preparation. Most users building a local copy do not need them.

### Resolve the CI release version

Print the version derived for the current CI context:

```console
bun scripts/ci_release_version.ts
```

Write the resolved version into `package.json`, then print it:

```console
bun scripts/ci_release_version.ts --write
```

The `--write` form modifies `package.json`. Use it only as part of an intentional release-version workflow.

### Package desktop release assets

```console
bun scripts/package_desktop_release.ts --version 1.2.3 --input desktop_artifacts --output release_dist
```

Arguments:

| Argument    | Meaning                                            |
| ----------- | -------------------------------------------------- |
| `--version` | Version embedded in human-facing release filenames |
| `--input`   | Folder containing Electrobun desktop artifacts     |
| `--output`  | Folder that receives cleaned release assets        |

Official automation builds each operating system separately and combines the resulting assets later.

### Compose release notes

```console
bun scripts/compose_release_notes.ts --version 1.2.3 --assets release_assets --sha COMMIT_SHA --out release_body.md
```

Arguments:

| Argument       | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| `--version`    | Release version displayed in the notes               |
| `--assets`     | Folder containing release files to describe          |
| `--sha`        | Source commit identifier                             |
| `--out`        | Markdown file to create                              |
| `--repository` | Optional repository override used when forming links |

This creates release-note Markdown; it does not publish a GitHub release by itself.

### Windows icon utilities

The desktop configuration automatically runs the Windows icon embedder after applicable builds and packaging. The lower-level icon scripts under `scripts/` are maintenance tools and normally should not be invoked separately from `bun run desktop:build`.

## Generated paths at a glance

| Path                 | Generated by                                         | Safe to edit directly?                                |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `docs/`              | `bun run build`                                      | No; rebuild from source                               |
| `desktop_build/`     | Electrobun development/build commands                | No                                                    |
| `desktop_artifacts/` | `bun run desktop:build`                              | No                                                    |
| `release_dist/`      | Desktop release packaging utility                    | No                                                    |
| `release_body.md`    | Release-note utility when that output name is chosen | Reviewable output, but regenerate after inputs change |

## Exit codes and warnings

- Exit code `0` means the command completed successfully.
- A nonzero exit code means the command failed, even if some earlier stages passed.
- Read the first meaningful error; later messages may only be consequences.
- Vite's large-chunk notice is a warning when the build otherwise completes.
- Canvas messages from the simulated test browser are warnings when Vitest reports all tests passed.

For setup explanations and troubleshooting steps, return to [Building and running AiWorldEd](building_and_running.md).
