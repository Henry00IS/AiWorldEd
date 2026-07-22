import { describe, it, expect } from 'vitest';
import {
  isImageFileName,
  extractFileExtension,
  getTextureDisplayName,
  getAcceptedImageExtensions
} from '../../src/texture/image_file_filter.js';

describe('image_file_filter', () => {
  it('should accept common image extensions case-insensitively', () => {
    expect(isImageFileName('Brick.PNG')).toBe(true);
    expect(isImageFileName('floor.jpg')).toBe(true);
    expect(isImageFileName('sky.WebP')).toBe(true);
  });

  it('should reject non-image files', () => {
    expect(isImageFileName('readme.txt')).toBe(false);
    expect(isImageFileName('mesh.obj')).toBe(false);
    expect(isImageFileName('noextension')).toBe(false);
  });

  it('should extract extensions from nested paths', () => {
    expect(extractFileExtension('walls/brick/red.png')).toBe('png');
    expect(extractFileExtension('file.')).toBe('');
  });

  it('should build display names from file stems', () => {
    expect(getTextureDisplayName('metal_plate.jpeg')).toBe('metal_plate');
    expect(getTextureDisplayName('sub/folder/wood.tga')).toBe('wood');
  });

  it('should expose a sorted extension list for UI hints', () => {
    const extensions = getAcceptedImageExtensions();
    expect(extensions).toContain('png');
    expect(extensions).toEqual([...extensions].sort());
  });
});
