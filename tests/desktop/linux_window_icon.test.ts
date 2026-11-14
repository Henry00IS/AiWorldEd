import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linuxWindowIconPathResolve, linuxWindowIconTarget } from '@/desktop/linux_window_icon.js';

describe('Linux window icon', () => {
  it('resolves the 192 px icon packaged with the editor view next to the bin folder', () => {
    const packageRoot = join(process.cwd(), '.vite', 'linux_window_icon_test');
    const binDirectory = join(packageRoot, 'bin');
    const viewDirectory = join(packageRoot, 'Resources', 'app', 'views', 'main_ui');
    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(viewDirectory, { recursive: true });
    writeFileSync(join(packageRoot, 'Resources', 'appIcon.png'), 'large icon');
    writeFileSync(join(viewDirectory, 'android-chrome-192x192.png'), 'icon');

    expect(linuxWindowIconPathResolve(binDirectory)).toBe(join(viewDirectory, 'android-chrome-192x192.png'));
  });

  it('packages the window icon with the editor view', () => {
    const config = readFileSync(resolve(process.cwd(), 'electrobun.config.ts'), 'utf8');
    expect(config).toContain("'public/android-chrome-192x192.png': 'views/main_ui/android-chrome-192x192.png'");
  });

  it('returns null when the package has no icon', () => {
    const emptyBin = join(process.cwd(), '.vite', 'linux_window_icon_missing', 'bin');
    mkdirSync(emptyBin, { recursive: true });
    expect(linuxWindowIconPathResolve(emptyBin)).toBeNull();
  });

  it('targets the native wrapper library and icon of the running app', () => {
    const packageRoot = join(process.cwd(), '.vite', 'linux_window_icon_target');
    const binDirectory = join(packageRoot, 'bin');
    const viewDirectory = join(packageRoot, 'Resources', 'app', 'views', 'main_ui');
    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(viewDirectory, { recursive: true });
    writeFileSync(join(viewDirectory, 'android-chrome-192x192.png'), 'icon');

    expect(linuxWindowIconTarget(join(binDirectory, 'bun'))).toEqual({
      libraryPath: join(binDirectory, 'libNativeWrapper.so'),
      iconPath: join(viewDirectory, 'android-chrome-192x192.png'),
    });
  });

  it('applies the window icons after the window is shown', () => {
    const bunEntry = readFileSync(resolve(process.cwd(), 'src/desktop/bun/index.ts'), 'utf8');
    expect(bunEntry).toContain('await applyLinuxWindowIcon(shownWindow);');
  });
});
