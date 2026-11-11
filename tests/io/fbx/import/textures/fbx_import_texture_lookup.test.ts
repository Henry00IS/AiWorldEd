import { describe, expect, it } from 'vitest';
import { fbxImportTexturePathFind } from '@/io/fbx/import/textures/fbx_import_texture_lookup.js';

const PROJECT_TEXTURES = ['models/crate/textures/wood.png', 'shared/wood.png', 'shared/metal.png', 'walls/brick.png'];

describe('fbxImportTexturePathFind', () => {
  it('resolves relative paths next to the FBX file, including parent folders', () => {
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, 'models/crate', ['textures\\wood.png'])).toBe(
      'models/crate/textures/wood.png',
    );
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, 'models/crate', ['../../shared/wood.png'])).toBe(
      'shared/wood.png',
    );
  });

  it('falls back to the file name, preferring the FBX folder', () => {
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, 'models/crate', ['C:\\Users\\artist\\wood.png'])).toBe(
      'models/crate/textures/wood.png',
    );
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, null, ['/home/artist/Brick.PNG'])).toBe('walls/brick.png');
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, null, ['wood.png'])).toBe('shared/wood.png');
  });

  it('matches a converted image by its name stem', () => {
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, 'models', ['metal.tga'])).toBe('shared/metal.png');
  });

  it('returns null when the project lacks the image', () => {
    expect(fbxImportTexturePathFind(PROJECT_TEXTURES, 'models', ['glass.png'])).toBeNull();
    expect(fbxImportTexturePathFind([], null, ['wood.png'])).toBeNull();
  });
});
