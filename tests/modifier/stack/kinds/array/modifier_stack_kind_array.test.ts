import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { stackFixture, type StackFixtureStep } from '../../modifier_stack_fixture.js';

/**
 * Returns the model-space centre X of one compiled brush.
 *
 * @param instance Compiled brush.
 * @returns Centre X.
 */
function centreX(instance: SolidBrushInstance): number {
  const box = new THREE.Box3();
  const matrix = instance.getModelSpaceMatrix();
  for (const vertex of instance.brush.vertices) box.expandByPoint(vertex.clone().applyMatrix4(matrix));
  return box.getCenter(new THREE.Vector3()).x;
}

/**
 * Compiles a one-unit cube and a two-unit-wide box through one step.
 *
 * @param step Array step.
 * @returns Copy centre X keyed by source id order: [small copies, wide copies].
 */
function twoPieces(step: StackFixtureStep): number[][] {
  const fixture = stackFixture([step]);
  const wide = fixture.model.addBoxBrush(1, SolidOperation.Additive);
  wide.mesh?.position.set(0, 0, 2);
  wide.mesh?.scale.set(2, 1, 1);
  const instances = fixture.compile().instances;
  return [fixture.source.id, wide.id].map((id) =>
    instances.filter((instance) => instance.id === id || instance.id.startsWith(`${id}#`)).map(centreX),
  );
}

describe('array size source', () => {
  it('defaults to the whole input so every piece shares one step', () => {
    const kind = modifierStackKindFind('linear');
    expect(kind?.normalizeParameters({})['bounds']).toBe('whole');
    const [small, wide] = twoPieces({ kind: 'linear', parameters: { mode: 'relative', count: 2, relativeX: 1 } });
    expect(small?.[1]).toBeCloseTo(2);
    expect(wide?.[1]).toBeCloseTo(2);
  });

  it('spaces each piece by its own size when set to each piece', () => {
    const [small, wide] = twoPieces({
      kind: 'linear',
      parameters: { mode: 'relative', count: 3, relativeX: 1, bounds: 'piece' },
    });
    expect(small).toEqual([0, 1, 2].map((value) => expect.closeTo(value, 6)));
    expect(wide).toEqual([0, 2, 4].map((value) => expect.closeTo(value, 6)));
  });

  it('keeps unrotated radial pieces around their own centres when set to each piece', () => {
    const parameters = { mode: 'ring', count: 2, rotateCopies: false, radiusOffset: 1 };
    const whole = twoPieces({ kind: 'radial', parameters });
    const piece = twoPieces({ kind: 'radial', parameters: { ...parameters, bounds: 'piece' } });
    expect(piece[0]?.[1]).not.toBeCloseTo(whole[0]?.[1] ?? 0, 3);
    expect(piece.flat().every(Number.isFinite)).toBe(true);
  });
});
