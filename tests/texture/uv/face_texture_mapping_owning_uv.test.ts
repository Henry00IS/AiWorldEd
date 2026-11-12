import { describe, it, expect } from 'vitest';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { withTrsAccessors, withTrsAccessorsOwningUv } from '@/texture/uv/face_texture_mapping.js';

/** TRS proxies that adopt a freshly built UV matrix instead of copying it. */
describe('withTrsAccessorsOwningUv', () => {
  it('keeps the given UV matrix object', () => {
    const uv = SurfaceUvMatrix.centered();
    const mapping = withTrsAccessorsOwningUv('brick', uv, 'face');
    expect(mapping.uv).toBe(uv);
    expect(mapping.align).toBe('face');
  });

  it('reads the same texture id and TRS fields as the copying wrapper', () => {
    const owning = withTrsAccessorsOwningUv('brick', SurfaceUvMatrix.centered());
    const copying = withTrsAccessors({ textureId: 'brick', uv: SurfaceUvMatrix.centered() });
    expect(owning.textureId).toBe(copying.textureId);
    expect(owning.scaleU).toBe(copying.scaleU);
    expect(owning.rotationDeg).toBe(copying.rotationDeg);
  });

  it('is returned unchanged by withTrsAccessors', () => {
    const owning = withTrsAccessorsOwningUv('brick', SurfaceUvMatrix.centered());
    expect(withTrsAccessors(owning)).toBe(owning);
  });

  it('exposes only textureId, uv, the marker, and align as own keys', () => {
    const withAlign = withTrsAccessorsOwningUv('brick', SurfaceUvMatrix.centered(), 'face');
    const withoutAlign = withTrsAccessorsOwningUv('brick', SurfaceUvMatrix.centered());
    expect(Object.keys(withAlign)).toEqual(['textureId', 'uv', '__trsProxy', 'align']);
    expect(Object.keys(withoutAlign)).toEqual(['textureId', 'uv', '__trsProxy']);
    expect(Object.keys({ ...withAlign })).toEqual(['textureId', 'uv', '__trsProxy', 'align']);
  });

  it('writes a TRS field by rebuilding the UV matrix and reads it back', () => {
    const mapping = withTrsAccessors({ textureId: 'brick', uv: SurfaceUvMatrix.centered() });
    const before = mapping.uv;
    mapping.scaleU = 2;
    mapping.rotationDeg = 30;
    expect(mapping.uv).not.toBe(before);
    expect(mapping.scaleU).toBeCloseTo(2, 9);
    expect(mapping.rotationDeg).toBeCloseTo(30, 9);
  });
});
