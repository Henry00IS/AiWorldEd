import { describe, expect, it } from 'vitest';
import { PATH_ASSET_DEFAULT, pathAssetDecode, pathAssetEncode } from '@/path/model/path_asset.js';
import { pathReferenceEncode, pathReferenceRead } from '@/path/model/path_reference.js';

describe('path references', () => {
  it('names a scene Path and keeps the shape to fall back on', () => {
    const text = pathReferenceEncode('Room Wall', PATH_ASSET_DEFAULT);
    expect(pathReferenceRead(text)).toEqual({ scene: 'Room Wall', fallback: PATH_ASSET_DEFAULT });
    expect(pathAssetDecode(text)).toEqual(PATH_ASSET_DEFAULT);
  });

  it('reads an own path, a blank name or other text as no reference', () => {
    expect(pathReferenceRead(pathAssetEncode(PATH_ASSET_DEFAULT))).toBeNull();
    expect(pathReferenceRead(pathReferenceEncode('  ', PATH_ASSET_DEFAULT))).toBeNull();
    expect(pathReferenceRead('not json')).toBeNull();
  });
});
