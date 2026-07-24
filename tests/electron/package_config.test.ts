import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const repositoryRoot = join(__dirname, '..', '..');

/**
 * Reads a text file relative to the repository root.
 * @param relativePath Path under the repository root.
 * @returns File contents as utf-8 text.
 */
function readRepositoryTextFile(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), 'utf-8');
}

/**
 * Parses package.json from the repository root.
 * @returns Parsed package manifest object.
 */
function readPackageManifest(): Record<string, unknown> {
  return JSON.parse(readRepositoryTextFile('package.json')) as Record<string, unknown>;
}

describe('standalone executable packaging config', () => {
  it('ignores the builds output directory in git', () => {
    const gitignoreContents = readRepositoryTextFile('.gitignore');
    const ignoredPaths = gitignoreContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    expect(ignoredPaths).toContain('builds');
  });

  it('points electron at a main process entry file that exists', () => {
    const packageManifest = readPackageManifest();
    const mainEntry = packageManifest.main;

    expect(typeof mainEntry).toBe('string');
    expect(existsSync(join(repositoryRoot, mainEntry as string))).toBe(true);
  });

  it('defines scripts that build the web app and package a desktop executable', () => {
    const packageManifest = readPackageManifest();
    const scripts = packageManifest.scripts as Record<string, string>;

    expect(scripts['electron:pack']).toMatch(/pack_desktop\.cjs/);
    expect(scripts['electron:pack']).toMatch(/vite build/);
    expect(scripts['build']).toBe('vite build');
    expect(existsSync(join(repositoryRoot, 'scripts', 'pack_desktop.cjs'))).toBe(true);
  });

  it('exports packaged artifacts into the builds directory', () => {
    const packageManifest = readPackageManifest();
    const electronBuilder = packageManifest.build as {
      directories?: { output?: string };
      files?: string[];
      win?: { target?: unknown };
    };

    expect(electronBuilder.directories?.output).toBe('builds');
    expect(electronBuilder.files).toEqual(
      expect.arrayContaining(['docs/**/*', 'electron/**/*']),
    );
    expect(electronBuilder.win?.target).toBeDefined();
  });

  it('serves the vite build through a secure custom protocol', () => {
    const mainProcessSource = readRepositoryTextFile('electron/main.cjs');

    expect(mainProcessSource).toContain("protocol.registerSchemesAsPrivileged");
    expect(mainProcessSource).toContain("scheme: APP_SCHEME");
    expect(mainProcessSource).toContain('docs');
    expect(mainProcessSource).toContain('loadURL');
  });
});
