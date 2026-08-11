import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  buildAssetDataUrlModuleContents,
  mimeTypeForAssetPath,
  resolveAtImport,
  stripImportSpecifierQuery,
} from '../../scripts/electrobun_tsconfig_paths_plugin.js';

/**
 * Unit tests for Electrobun Bun.build helpers that mirror Vite asset `?url`
 * inlining for desktop packaging.
 */
describe('Electrobun build plugins', () => {
  it('strips Vite url queries from import specifiers', () => {
    expect(stripImportSpecifierQuery('@/audio/raw/click001.wav?url')).toEqual({
      path: '@/audio/raw/click001.wav',
      isUrlQuery: true,
    });
    expect(stripImportSpecifierQuery('@/foo.ts')).toEqual({
      path: '@/foo.ts',
      isUrlQuery: false,
    });
  });

  it('resolves the click001 wav under src via @/', () => {
    const resolved = resolveAtImport('@/audio/raw/click001.wav');
    expect(resolved).toBe(resolve(process.cwd(), 'src/audio/raw/click001.wav'));
  });

  it('maps wav paths to audio/wav mime types', () => {
    expect(mimeTypeForAssetPath('C:\\x\\click001.wav')).toBe('audio/wav');
  });

  it('maps glb paths to model/gltf-binary mime types', () => {
    expect(mimeTypeForAssetPath('C:\\x\\character.glb')).toBe('model/gltf-binary');
  });

  it('builds a data-url default export for the click sample', () => {
    const wavPath = resolve(process.cwd(), 'src/audio/raw/click001.wav');
    const moduleSource = buildAssetDataUrlModuleContents(wavPath);
    expect(moduleSource.startsWith('export default "data:audio/wav;base64,')).toBe(true);
    expect(moduleSource.length).toBeGreaterThan(100);
  });
});
