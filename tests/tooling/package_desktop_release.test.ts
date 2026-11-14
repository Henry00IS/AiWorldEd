import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('package_desktop_release script', () => {
  it('publishes versioned Setup once, keeps Electrobun updater files, and drops patches', () => {
    const root = createTempWorkspace();
    const inputDir = join(root, 'desktop_artifacts');
    const outputDir = join(root, 'release_dist');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(join(inputDir, 'stable-win-x64-update-v2.json'), '{"version":"1.0.99","hash":"abc"}');
    writeFileSync(join(inputDir, 'stable-win-x64-update.json'), '{"version":"1.0.99","hash":"abc"}');
    writeFileSync(join(inputDir, 'stable-win-x64-AiWorldEd.tar.zst'), 'portable-bytes');
    writeFileSync(join(inputDir, 'win-x64-AiWorldEd-Setup.zip'), 'setup-bytes');
    writeFileSync(join(inputDir, 'stable-win-x64-1a42wpx0i4p0k.patch'), 'patch-bytes');

    const result = spawnSync(
      'bun',
      ['scripts/package_desktop_release.ts', '--version', '1.0.99', '--input', inputDir, '--output', outputDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const files = readdirSync(outputDir).sort();
    expect(files).toEqual([
      'AiWorldEd-1.0.99-Win-x64-Setup.zip',
      'stable-win-x64-AiWorldEd.tar.zst',
      'stable-win-x64-update-v2.json',
      'stable-win-x64-update.json',
    ]);
    expect(readFileSync(join(outputDir, 'AiWorldEd-1.0.99-Win-x64-Setup.zip'), 'utf8')).toBe('setup-bytes');
    expect(readFileSync(join(outputDir, 'stable-win-x64-AiWorldEd.tar.zst'), 'utf8')).toBe('portable-bytes');
  });

  it('packages linux setup and macos portable updater pairs without duplicates', () => {
    const root = createTempWorkspace();
    const inputDir = join(root, 'desktop_artifacts');
    const outputDir = join(root, 'release_dist');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(join(inputDir, 'stable-linux-x64-update.json'), '{"version":"1.0.99","hash":"linux"}');
    writeFileSync(join(inputDir, 'stable-linux-x64-update-v2.json'), '{"version":"1.0.99","hash":"linux"}');
    writeFileSync(join(inputDir, 'stable-linux-x64-AiWorldEd.tar.zst'), 'linux-portable');
    writeFileSync(join(inputDir, 'linux-x64-AiWorldEd-Setup.tar.gz'), 'linux-setup');
    writeFileSync(join(inputDir, 'stable-macos-arm64-update.json'), '{"version":"1.0.99","hash":"mac"}');
    writeFileSync(join(inputDir, 'stable-macos-arm64-update-v2.json'), '{"version":"1.0.99","hash":"mac"}');
    writeFileSync(join(inputDir, 'stable-macos-arm64-AiWorldEd.app.tar.zst'), 'mac-portable');

    const result = spawnSync(
      'bun',
      ['scripts/package_desktop_release.ts', '--version', '1.0.99', '--input', inputDir, '--output', outputDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const files = readdirSync(outputDir).sort();
    expect(files).toEqual([
      'AiWorldEd-1.0.99-Linux-x64-Setup.tar.gz',
      'stable-linux-x64-AiWorldEd.tar.zst',
      'stable-linux-x64-update-v2.json',
      'stable-linux-x64-update.json',
      'stable-macos-arm64-AiWorldEd.app.tar.zst',
      'stable-macos-arm64-update-v2.json',
      'stable-macos-arm64-update.json',
    ]);
    expect(files.filter((name) => name.includes('Portable'))).toHaveLength(0);
  });

  it('fails when a portable update payload is missing its update.json', () => {
    const root = createTempWorkspace();
    const inputDir = join(root, 'desktop_artifacts');
    const outputDir = join(root, 'release_dist');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(join(inputDir, 'stable-linux-x64-AiWorldEd.tar.zst'), 'portable-bytes');

    const result = spawnSync(
      'bun',
      ['scripts/package_desktop_release.ts', '--version', '1.0.99', '--input', inputDir, '--output', outputDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toMatch(/missing matching .*update\.json/i);
  });

  it('fails when a portable update payload is missing its update-v2.json', () => {
    const root = createTempWorkspace();
    const inputDir = join(root, 'desktop_artifacts');
    const outputDir = join(root, 'release_dist');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(join(inputDir, 'stable-linux-x64-AiWorldEd.tar.zst'), 'portable-bytes');
    writeFileSync(join(inputDir, 'stable-linux-x64-update.json'), '{"version":"1.0.99","hash":"linux"}');

    const result = spawnSync(
      'bun',
      ['scripts/package_desktop_release.ts', '--version', '1.0.99', '--input', inputDir, '--output', outputDir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toMatch(/missing matching stable-linux-x64-update-v2\.json/);
  });

  it('is wired into the desktop CI job after electrobun build', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('bun scripts/package_desktop_release.ts');
    expect(workflow).toContain('path: release_dist/');
    expect(workflow).toContain('Package clean release assets');
  });
});

/**
 * Creates an isolated temp directory cleaned up after the test.
 *
 * @returns Absolute temporary workspace path.
 */
function createTempWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'aiworlded-release-'));
  temporaryDirectories.push(directory);
  return directory;
}
