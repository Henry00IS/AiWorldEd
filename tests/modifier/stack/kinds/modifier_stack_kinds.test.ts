import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierStackKindFind, modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { expectStackConvex, stackFixture } from '../modifier_stack_fixture.js';

/**
 * Returns the world-space bounds of compiled brushes.
 *
 * @param instances Brushes whose vertices are in model space.
 * @returns Union of vertex bounds.
 */
function boundsOf(
  instances: readonly { brush: { vertices: readonly THREE.Vector3[] }; getModelSpaceMatrix(): THREE.Matrix4 }[],
): THREE.Box3 {
  const box = new THREE.Box3();
  for (const instance of instances) {
    const matrix = instance.getModelSpaceMatrix();
    for (const vertex of instance.brush.vertices) box.expandByPoint(vertex.clone().applyMatrix4(matrix));
  }
  return box;
}

/**
 * Returns the vertical extents of each compiled brush, sorted.
 *
 * @param instances Brushes.
 * @returns Sorted top heights.
 */
function tops(instances: Parameters<typeof boundsOf>[0]): number[] {
  return instances.map((instance) => boundsOf([instance]).max.y).sort((a, b) => a - b);
}

describe('modifier stack kinds', () => {
  it('lists every kind once with a label, description and normalizable defaults', () => {
    expect(modifierStackKinds.map((kind) => kind.id)).toEqual([
      'stairs',
      'arch',
      'column',
      'linear',
      'radial',
      'transform',
      'mirror',
      'shear',
      'bevel',
      'smooth',
    ]);
    for (const kind of modifierStackKinds) {
      expect(kind.label).not.toBe('');
      expect(kind.description).not.toBe('');
      expect(kind.normalizeParameters({})).toEqual(kind.normalizeParameters(kind.normalizeParameters({})));
    }
  });

  it('spaces linear copies by fixed step, by size multiple, or to fit a distance', () => {
    const fixed = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2 } }]).compile()
      .instances;
    expect(boundsOf(fixed).max.x).toBeCloseTo(4.5);
    const relative = stackFixture([
      { kind: 'linear', parameters: { mode: 'relative', count: 3, relativeX: 1.5 } },
    ]).compile().instances;
    expect(boundsOf(relative).max.x).toBeCloseTo(3.5);
    const fit = stackFixture([{ kind: 'linear', parameters: { mode: 'fit', count: 5, endpointX: 8 } }]).compile()
      .instances;
    expect(boundsOf(fit).max.x).toBeCloseTo(8.5);
  });

  it('places radial copies on a ring around the volume axis', () => {
    const fixture = stackFixture([{ kind: 'radial', parameters: { origin: 'centre', count: 4, radiusOffset: 2 } }]);
    const result = fixture.compile().instances;
    expect(result).toHaveLength(4);
    const box = boundsOf(result.slice(1));
    expect(box.min.x).toBeCloseTo(-2.5);
    expect(box.max.z - box.min.z).toBeCloseTo(5);
  });

  it('puts the original on the radial ring and leaves the ring centre empty', () => {
    const result = stackFixture([{ kind: 'radial', parameters: { count: 8, radius: 2 } }]).compile().instances;
    const centres = result.map((instance) => boundsOf([instance]).getCenter(new THREE.Vector3()));
    expect(result).toHaveLength(8);
    expect(centres[0]?.length()).toBeCloseTo(0);
    const ringCentre = new THREE.Vector3(0, 0, -2);
    centres.forEach((centre) => expect(centre.distanceTo(ringCentre)).toBeCloseTo(2));
    expect(Math.sign(centres[1]?.x ?? 0)).toBe(-Math.sign(centres[7]?.x ?? 0));
    expect(centres[1]?.z).toBeCloseTo(centres[7]?.z ?? NaN);
    expect(centres[4]?.z).toBeCloseTo(-4);
  });

  it('moves the radial ring centre across the axis when the chosen side lies along it', () => {
    const parameters = { count: 4, radius: 3, centreSide: '+y' };
    const result = stackFixture([{ kind: 'radial', parameters }]).compile().instances;
    expect(boundsOf([result[2]!]).getCenter(new THREE.Vector3()).z).toBeCloseTo(-6);
  });

  it('keeps radial stacks saved before the ring placement around their pivot', () => {
    const radial = modifierStackKindFind('radial')!;
    expect(radial.normalizeParameters({ mode: 'ring', radiusOffset: 1 })['origin']).toBe('centre');
    expect(radial.normalizeParameters({})['origin']).toBe('ring');
    expect(radial.normalizeParameters({ count: 8 })['origin']).toBe('ring');
    expect(radial.normalizeParameters({ mode: 'arc', origin: 'ring' })['origin']).toBe('ring');
  });

  it('accumulates transform-array steps', () => {
    const result = stackFixture([
      { kind: 'transform', parameters: { count: 4, offsetX: 0, offsetY: 1, offsetZ: 0, rotationY: 0 } },
    ]).compile().instances;
    expect(tops(result)).toEqual([0.5, 1.5, 2.5, 3.5].map((value) => expect.closeTo(value, 5)));
  });

  it('mirrors across the chosen side of the volume and keeps faces outward', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x', plane: 'max' } }], 4);
    const result = fixture.compile().instances;
    expect(result).toHaveLength(2);
    expect(boundsOf(result.slice(1)).min.x).toBeCloseTo(3.5);
    for (const brush of result) expectStackConvex(brush);
  });

  it('sizes stairs by the DMC rises and counts', () => {
    for (const [rise, steps] of [
      [0.075, 13],
      [0.125, 8],
      [0.339, 3],
    ] as const) {
      const fixture = stackFixture([{ kind: 'stairs', parameters: { rise } }], 1);
      expect(fixture.compile().instances.slice(1)).toHaveLength(steps);
    }
    const counted = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 4 } }], 2)
      .compile()
      .instances.slice(1);
    expect(tops(counted)).toEqual([-0.5, 0, 0.5, 1].map((value) => expect.closeTo(value, 5)));
    for (const step of counted) expectStackConvex(step);
  });

  it('builds floating treads and caps the step count', () => {
    const floating = stackFixture(
      [{ kind: 'stairs', parameters: { sizing: 'count', count: 4, fill: 'floating', thickness: 0.1 } }],
      2,
    )
      .compile()
      .instances.slice(1);
    for (const tread of floating) expect(boundsOf([tread]).getSize(new THREE.Vector3()).y).toBeCloseTo(0.1);
    const capped = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 99999 } }], 2);
    expect(capped.compile().instances.slice(1)).toHaveLength(256);
  });

  it('builds arches from convex voussoirs or a wall with an opening', () => {
    const ring = stackFixture([{ kind: 'arch', parameters: { segments: 12 } }], 4)
      .compile()
      .instances.slice(1);
    expect(ring).toHaveLength(12);
    for (const piece of ring) expectStackConvex(piece);
    const wall = stackFixture([{ kind: 'arch', parameters: { style: 'wall', segments: 8 } }], 4)
      .compile()
      .instances.slice(1);
    expect(wall.length).toBeGreaterThan(8);
    for (const piece of wall) expectStackConvex(piece);
  });

  it('builds columns with the classic side counts', () => {
    for (const sides of ['6', '8', '12', '16']) {
      const pieces = stackFixture([{ kind: 'column', parameters: { sides } }], 2)
        .compile()
        .instances.slice(1);
      expect(pieces).toHaveLength(3);
      for (const piece of pieces) expectStackConvex(piece);
    }
  });

  it('summarizes each modifier for its collapsed header', () => {
    expect(modifierStackKindFind('linear')?.summary({ count: 4 })).toContain('4');
    expect(modifierStackKindFind('stairs')?.summary({ sizing: 'count', count: 5 })).toBe('5 steps');
    expect(
      modifierStackKindFind('bevel')?.summary(modifierStackKindFind('bevel')?.normalizeParameters({}) ?? {}),
    ).toContain('seg');
  });
});
