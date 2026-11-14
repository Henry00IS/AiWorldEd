import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import electrobunConfig from '../../electrobun.config.js';
import packageMetadata from '../../package.json';
import { APPLICATION_DISPLAY_NAME, buildDesktopWindowTitle } from '@/application_identity.js';

/** Typed view of electrobun.config for package assertions. */
interface ElectrobunPackageConfig {
  app: { name: string; version: string };
  build?: {
    bun?: { entrypoint?: string };
    views?: { main_ui?: { entrypoint?: string } };
    copy?: Record<string, string | undefined>;
    win?: Record<string, unknown>;
    linux?: Record<string, unknown>;
    mac?: Record<string, unknown>;
  };
  release?: { baseUrl?: string; generatePatch?: boolean };
}

/** Cast shim `Record<string, unknown>` config to a typed package shape. */
const config = electrobunConfig as unknown as ElectrobunPackageConfig;

describe('Electrobun desktop build configuration', () => {
  it('packages the existing editor application as a native desktop window', () => {
    expect(config.app.name).toBe('AiWorldEd');
    expect(config.app.version).toBe(packageMetadata.version);
    expect(config.build?.bun?.entrypoint).toBe('src/desktop/bun/index.ts');
    expect(config.build?.views?.main_ui?.entrypoint).toBe('src/desktop/main_ui/index.ts');
    expect(config.build?.copy?.['src/desktop/main_ui/index.html']).toBe('views/main_ui/index.html');
    expect(config.build?.win).toMatchObject({
      defaultRenderer: 'native',
      bundleCEF: false,
      icon: 'public/app_icon.ico',
    });
    expect(config.build?.linux).toMatchObject({
      icon: 'public/android-chrome-512x512.png',
    });
    expect(config.build?.mac).toMatchObject({
      icons: 'public/app_icon.iconset',
    });
    expect(config.release?.baseUrl).toBe('https://github.com/Henry00IS/AiWorldEd/releases/latest/download');
    expect(config.release?.generatePatch).toBe(false);
  });

  it('copies public favicon assets into the desktop main_ui view bundle', () => {
    const copy = config.build?.copy ?? {};
    expect(copy['public/favicon.ico']).toBe('views/main_ui/favicon.ico');
    expect(copy['public/favicon-16x16.png']).toBe('views/main_ui/favicon-16x16.png');
    expect(copy['public/favicon-32x32.png']).toBe('views/main_ui/favicon-32x32.png');
    expect(copy['public/apple-touch-icon.png']).toBe('views/main_ui/apple-touch-icon.png');
    expect(copy['public/android-chrome-192x192.png']).toBe('views/main_ui/android-chrome-192x192.png');
    expect(copy['public/android-chrome-512x512.png']).toBe('views/main_ui/android-chrome-512x512.png');
  });

  it('keeps platform icon sources on disk for Electrobun packaging', () => {
    expect(existsSync(resolve(process.cwd(), 'public/app_icon.ico'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/android-chrome-512x512.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/app_icon.iconset/icon_512x512.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/app_icon.iconset/icon_16x16.png'))).toBe(true);
  });

  it('builds desktop window titles with the AI World Editor display name and version', () => {
    expect(APPLICATION_DISPLAY_NAME).toBe('AI World Editor');
    expect(buildDesktopWindowTitle('1.0.42')).toBe('AI World Editor 1.0.42');
    expect(buildDesktopWindowTitle(packageMetadata.version)).toBe(`AI World Editor ${packageMetadata.version}`);
  });
});
