import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  buildAssetDataUrlModuleContents,
  extensionForAssetPath,
  mimeTypeForAssetPath,
  resolveAtImport,
  stripImportSpecifierQuery,
} from '../../scripts/electrobun_tsconfig_paths_plugin.js';

/**
 * Unit tests for Electrobun Bun.build helpers that mirror Vite asset `?url`
 * inlining for desktop packaging.
 *
 * Paths intentionally stay under src/ (repo assets). No reference/ samples.
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

  it('resolves the player character glb under src via @/', () => {
    const resolved = resolveAtImport('@/player/assets/character.glb');
    expect(resolved).toBe(resolve(process.cwd(), 'src/player/assets/character.glb'));
  });

  it('extracts extensions from posix and windows-style paths', () => {
    expect(extensionForAssetPath('/tmp/character.glb')).toBe('.glb');
    expect(extensionForAssetPath('C:\\assets\\character.glb')).toBe('.glb');
    expect(extensionForAssetPath('C:/assets/click001.wav')).toBe('.wav');
  });

  it('maps wav paths to audio/wav mime types', () => {
    expect(mimeTypeForAssetPath('/tmp/click001.wav')).toBe('audio/wav');
    expect(mimeTypeForAssetPath('C:\\x\\click001.wav')).toBe('audio/wav');
  });

  it('maps glb paths to model/gltf-binary mime types', () => {
    expect(mimeTypeForAssetPath('/tmp/character.glb')).toBe('model/gltf-binary');
    expect(mimeTypeForAssetPath('C:\\x\\character.glb')).toBe('model/gltf-binary');
  });

  it('builds a data-url default export for the click sample', () => {
    const wavPath = resolve(process.cwd(), 'src/audio/raw/click001.wav');
    const moduleSource = buildAssetDataUrlModuleContents(wavPath);
    expect(moduleSource.startsWith('export default "data:audio/wav;base64,')).toBe(true);
    expect(moduleSource.length).toBeGreaterThan(100);
  });

  it('builds a data-url default export for the player character glb', () => {
    const glbPath = resolve(process.cwd(), 'src/player/assets/character.glb');
    const moduleSource = buildAssetDataUrlModuleContents(glbPath);
    expect(moduleSource.startsWith('export default "data:model/gltf-binary;base64,')).toBe(true);
    expect(moduleSource.length).toBeGreaterThan(100);
  });
});
