import { describe, expect, it } from 'vitest';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { primitiveMappedFaces, primitivePieces, type PrimitiveMappedFace } from './primitive/primitive_fixture.js';

/** Keys of the cap texture placement, in inspector order. */
const CAP_UV_KEYS = [
  'capTextureScaleU',
  'capTextureScaleV',
  'capTextureOffsetU',
  'capTextureOffsetV',
  'capTextureRotation',
];

/**
 * Returns the flat top and bottom faces.
 *
 * @param faces Mapped faces.
 * @returns Cap faces.
 */
function caps(faces: readonly PrimitiveMappedFace[]): PrimitiveMappedFace[] {
  return faces.filter((face) => Math.abs(face.normal.y) > 0.999);
}

/**
 * Returns texture length per metre along the first edge of every face.
 *
 * @param faces Faces.
 * @returns Ratios.
 */
function repeatsPerMetre(faces: readonly PrimitiveMappedFace[]): number[] {
  return faces.map((face) => {
    const [a, b] = face.corners;
    return a && b ? a.uv.distanceTo(b.uv) / a.point.distanceTo(b.point) : NaN;
  });
}

describe('cap texture placement', () => {
  it('gives every generator with cap textures its own cap UV controls, shown only while caps are on', () => {
    const capped = modifierStackKinds.filter((kind) => kind.fields.some((field) => field.label === 'Cap Textures'));
    expect(capped.map((kind) => kind.id)).toEqual(expect.arrayContaining(['column', 'cylinder', 'pipe', 'prism']));
    for (const kind of capped) {
      const fields = CAP_UV_KEYS.map((key) => kind.fields.find((field) => field.key === key));
      for (const field of fields) {
        expect(field, kind.id).toBeDefined();
        expect(field?.hint?.length, kind.id).toBeGreaterThan(10);
        for (const word of field?.label.split(' ') ?? []) expect(word[0]).toBe(word[0]?.toUpperCase());
        expect(field?.visible?.({ capTextures: false }), kind.id).toBe(false);
        expect(field?.visible?.({ capTextures: true }), kind.id).toBe(true);
      }
    }
  });

  it('keeps caps at one repeat per metre however the sides wrap and scale while caps are on', () => {
    for (const kind of ['column', 'cylinder', 'prism', 'pipe']) {
      const sides = { wrap: 'tile', repeatAround: 3, textureScaleU: 3, textureScaleV: 3, capTextures: true };
      for (const ratio of repeatsPerMetre(caps(primitiveMappedFaces(primitivePieces(kind, [2, 3, 2], sides).pieces))))
        expect(ratio, kind).toBeCloseTo(1, 5);
      const scaled = { ...sides, capTextureScaleU: 2, capTextureScaleV: 2 };
      for (const ratio of repeatsPerMetre(caps(primitiveMappedFaces(primitivePieces(kind, [2, 3, 2], scaled).pieces))))
        expect(ratio, kind).toBeCloseTo(0.5, 5);
    }
  });

  it('keeps the shared placement on caps while caps are off', () => {
    const on = { wrap: 'tile', repeatAround: 3, capTextures: true };
    const off = { wrap: 'tile', repeatAround: 3 };
    const read = (parameters: Record<string, unknown>) =>
      repeatsPerMetre(caps(primitiveMappedFaces(primitivePieces('column', [2, 3, 2], parameters).pieces)));
    expect(read(off)[0]).not.toBeCloseTo(read(on)[0] ?? 0, 3);
    expect(read({ ...off, textureScaleU: 2, textureScaleV: 2 })[0]).toBeCloseTo((read(off)[0] ?? 0) / 2, 5);
  });
});
