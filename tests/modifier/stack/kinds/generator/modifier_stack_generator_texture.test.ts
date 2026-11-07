import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Compiles one generator and returns its pieces.
 *
 * @param kind Generator kind.
 * @param parameters Parameter overrides.
 * @returns Generated brushes.
 */
function pieces(kind: string, parameters: Record<string, unknown>): SolidBrushInstance[] {
  return stackFixture([{ kind, parameters }], 4).compile().instances.slice(1);
}

/**
 * Projects the centre of each face of a piece through its UV matrix.
 *
 * @param piece Generated brush.
 * @returns Texture id and UV per face.
 */
function faceUvs(piece: SolidBrushInstance): { textureId: string; u: number; v: number }[] {
  return piece.brush.faces.map((face) => {
    const surface = piece.getFaceSurface(face.surfaceIndex);
    const centre = new THREE.Vector3();
    piece.brush.vertices.forEach((vertex) => centre.add(vertex));
    centre.divideScalar(Math.max(1, piece.brush.vertices.length));
    return { textureId: surface.textureId, ...surface.uv.project(centre) };
  });
}

describe('generator texture slot', () => {
  it('lists every texture instead of From captured brush, and reads old choices as the default', () => {
    for (const kind of ['arch', 'stairs', 'column']) {
      const field = modifierStackKindFind(kind)?.fields.find((entry) => entry.key === 'texture');
      expect(field?.type).toBe('texture');
      const normalize = (texture: string) => modifierStackKindFind(kind)?.normalizeParameters({ texture })['texture'];
      expect(normalize('captured')).toBe('');
      expect(normalize('default')).toBe('');
      expect(normalize('bricks/red')).toBe('bricks/red');
    }
  });

  it('puts the picked texture on every face of every generator', () => {
    for (const kind of ['arch', 'stairs', 'column']) {
      const made = pieces(kind, { texture: 'bricks/red' });
      expect(made.length).toBeGreaterThan(0);
      for (const piece of made) expect(faceUvs(piece).every((face) => face.textureId === 'bricks/red')).toBe(true);
    }
  });

  it('applies the slot scale, offset, and rotation on top of the generated layout', () => {
    for (const kind of ['arch', 'stairs', 'column']) {
      const plain = faceUvs(pieces(kind, {})[0]!);
      const scaled = faceUvs(pieces(kind, { textureScaleU: 2, textureScaleV: 4 })[0]!);
      scaled.forEach((face, index) => {
        expect(face.u).toBeCloseTo(plain[index]!.u / 2, 4);
        expect(face.v).toBeCloseTo(plain[index]!.v / 4, 4);
      });
      const shifted = faceUvs(pieces(kind, { textureOffsetU: 0.5 })[0]!);
      shifted.forEach((face, index) => expect(face.u).toBeCloseTo(plain[index]!.u - 0.5, 4));
      const turned = faceUvs(pieces(kind, { textureRotation: 90 })[0]!);
      turned.forEach((face, index) => {
        expect(face.u).toBeCloseTo(plain[index]!.v, 4);
        expect(face.v).toBeCloseTo(1 - plain[index]!.u, 4);
      });
    }
  });
});
