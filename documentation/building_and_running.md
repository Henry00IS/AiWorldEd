# Building and Running AiWorldEd

This guide is for anyone who wants to run AiWorldEd from its source code, test a change locally, create the browser build, or package the standalone desktop application.

You do not need to build the project to use the published online editor or a prebuilt desktop release. Build from source when you want to modify AiWorldEd, test an unreleased change, host your own copy, or create a desktop package for your current platform.

If the project is already set up and you only need an exact command or its side effects, use the [Build command reference](build_command_reference.md).

## What you need

Install the following before opening a terminal:

- **Git**, to obtain and update the source repository.
- **Bun 1.3.14**, which installs packages and runs the project's scripts.
- A current web browser for the browser build.

The repository records Bun 1.3.14 as its package-manager version. A significantly different Bun version may behave differently, so use the recorded version when you need a reproducible build.

Desktop packages use Electrobun, which is installed with the project dependencies. Build desktop packages on the operating system you intend to target: Windows on Windows, Linux on Linux, and macOS on macOS.

## Get the source

If you do not already have the repository:

```console
git clone https://github.com/Henry00IS/AiWorldEd.git
cd AiWorldEd
```

If you already have a checkout, open a terminal in its root folder—the folder containing `package.json`, `src`, and `documentation`.

## Install dependencies

Run:

```console
bun install --frozen-lockfile
```

The frozen lockfile option makes Bun use the exact dependency versions recorded by the project. If you are intentionally changing dependencies, use `bun install` while making that change and review the resulting `bun.lock` update.

Dependency installation creates local package files used by the build. It does not install AiWorldEd as a system-wide application.

## Run the browser editor for development

Start the Vite development server:

```console
bun run dev
```

The command prints a local address. Open that address in a browser. Because the server is started with host access enabled, it may also print a network address that other devices on the same network can reach.

Keep the terminal open while using the development server. Source changes are rebuilt automatically. Stop the server with `Ctrl+C`.

Use the development server when:

- Editing the source and checking changes quickly.
- Debugging with browser developer tools.
- Testing the browser's file and folder permission behavior.
- Verifying responsive layout at different window sizes.

## Create the production browser build

Run:

```console
bun run build
```

This command:

1. Formats supported project files with Prettier.
2. Builds the optimized browser application with Vite.
3. Writes the finished site to the `docs/` folder.

The `docs/` build-output folder is different from the `documentation/` user-guide folder. Do not place authored guide files in `docs/`, because a production build may replace generated files there.

The browser build uses relative asset paths so it can be hosted beneath a project path, including GitHub Pages. Its principal generated files are:

- `docs/index.html`
- `docs/index.js`
- Icons and web-manifest files copied from `public/`

The build may report that the JavaScript bundle is larger than Vite's default warning threshold. That message is a size warning, not a failed build. A successful build ends with a green completion message and exit code zero.

## Preview the production browser build

After building, run:

```console
bun run preview
```

Open the local address printed by Vite. Preview mode serves the generated production files, so it is better than the development server for catching production-only asset or path problems.

Stop the preview server with `Ctrl+C`.

## Run the standalone desktop app during development

Start Electrobun's desktop development workflow:

```console
bun run desktop:dev
```

This watches the desktop entry points and launches AiWorldEd in its desktop shell. Use it when testing native-window behavior, desktop file dialogs, or standalone update integration.

The desktop application uses the same editor entry point as the browser version, so editing behavior should remain consistent between both targets.

## Build a standalone desktop package

Run:

```console
bun run desktop:build
```

Electrobun builds the application for the current operating system using its stable environment. Intermediate files are written to:

```text
desktop_build/
```

Packaged outputs are written to:

```text
desktop_artifacts/
```

On Windows, the post-build process also embeds the application icon into applicable executables. macOS uses the icon set in `public/app_icon.iconset`, while Linux uses the large PNG application icon.

To relaunch the most recent desktop build:

```console
bun run desktop:run
```

If no compatible prior build exists, run `bun run desktop:build` first.

## Validate before sharing a build

Run the same primary checks required by the project:

```console
bun run testrun
bun run build
```

The first command executes the complete Vitest suite once. The second formats supported files and verifies that the production browser bundle can be created.

For a broader continuous-integration check:

```console
bun run ci
```

This checks formatting, runs the complete test suite, and creates the browser build.

Additional checks are available:

```console
bun run typecheck
bun run typecheck:strict
bun run format:check
```

The strict TypeScript check is informational in the current automated workflow because existing strict errors are still being resolved. Do not confuse that known status with the required unit-test and production-build checks.

## Build outputs and source files

Generated build folders should not be treated as the editable source:

| Folder               | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `src/`               | Application source code                        |
| `public/`            | Static assets copied into the browser build    |
| `documentation/`     | Authored Markdown user guides and their images |
| `docs/`              | Generated production browser site              |
| `desktop_build/`     | Intermediate Electrobun build files            |
| `desktop_artifacts/` | Packaged desktop build artifacts               |

Make changes in `src/`, `public/`, or `documentation/`, then rebuild. Editing generated files in `docs/` or `desktop_build/` will not reliably survive the next build.

## How official builds are produced

The project's GitHub Actions workflow installs Bun 1.3.14, installs dependencies from the frozen lockfile, checks formatting, runs tests, and builds the browser site.

For changes pushed to the main branch, the workflow also:

- Deploys the contents of `docs/` to GitHub Pages.
- Builds Windows, Linux, and macOS desktop artifacts on their respective hosted systems.
- Packages release assets.
- Publishes an automatic GitHub release after the desktop builds succeed.

Local builds do not automatically publish a site or create a GitHub release.

## Troubleshooting builds

### `bun` is not recognized

Bun is either not installed or is not available on your terminal's `PATH`. Install Bun 1.3.14, close and reopen the terminal, then verify:

```console
bun --version
```

### Dependency installation fails

- Confirm that the terminal has network access.
- Confirm that `bun.lock` exists.
- Retry `bun install --frozen-lockfile`.
- If the lockfile was intentionally changed, use `bun install` and review the dependency changes before continuing.

Do not delete the lockfile merely to bypass a dependency error; it is what keeps builds reproducible.

### A port is already in use

The development or preview server may select another available port and print it. If it cannot start, stop the process using the requested port or follow the alternate address shown in the terminal.

### The page opens but assets are missing

- Use `bun run preview` rather than opening `docs/index.html` directly from the filesystem.
- Confirm that the build completed successfully.
- Confirm that `docs/index.js` and copied public assets exist.
- If hosting beneath a path, preserve the generated relative file layout.

### A desktop build fails

- Confirm that dependencies installed successfully.
- Build on the same operating-system family as the desired artifact.
- Close a previously launched copy if it is locking build files.
- Check the first meaningful error above any follow-on packaging messages.
- Run `bun run testrun` and `bun run build` separately to determine whether the problem is shared editor code or desktop packaging.

### Tests print canvas warnings

The test environment may report that some canvas operations are not implemented by its simulated browser. When the test command exits successfully and all test files pass, these warnings are informational. Treat an actual failed test or nonzero exit code as the build blocker.

For general application problems after a successful build, see [Troubleshooting](troubleshooting.md).
