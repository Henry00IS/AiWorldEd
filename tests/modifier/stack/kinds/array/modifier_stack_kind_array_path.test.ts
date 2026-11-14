import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { pathCreate, pathDecode, pathEncode } from '@/path/model/path_model.js';
import { arrayTestCentres } from './modifier_stack_array_test_helpers.js';
import { stackFixture } from '../../modifier_stack_fixture.js';
import { arrayTestCentre } from './modifier_stack_array_test_helpers.js';

const corner = pathEncode(
  pathCreate(
    [
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 4],
    ],
    { smooth: false },
  ),
);

/**
 * Rounds a centre for comparison.
 *
 * @param centre Centre.
 * @returns Rounded coordinates.
 */
function rounded(centre: THREE.Vector3): number[] {
  return centre.toArray().map((value) => Math.round(value * 1000) / 1000 || 0);
}

describe('path array', () => {
  it('spreads copies over the whole path, starting at the input', () => {
    const centres = arrayTestCentres([{ kind: 'path', parameters: { path: corner, count: 5 } }]);
    expect(centres.map(rounded)).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
      [4, 0, 2],
      [4, 0, 4],
    ]);
  });

  it('places copies a fixed distance apart', () => {
    const centres = arrayTestCentres([
      { kind: 'path', parameters: { path: corner, count: 3, spacing: 'distance', distance: 3 } },
    ]);
    expect(centres.map(rounded)).toEqual([
      [0, 0, 0],
      [3, 0, 0],
      [4, 0, 2],
    ]);
  });

  it('turns copies with the path when following and keeps them square when not', () => {
    const longBrush = (follow: boolean) => {
      const fixture = stackFixture([{ kind: 'path', parameters: { path: corner, count: 3, follow } }], 40);
      fixture.source.mesh!.scale.set(1, 1, 0.25);
      const instances = fixture.compile().instances;
      return instances.map((instance) => {
        const box = new THREE.Box3();
        const matrix = instance.getModelSpaceMatrix();
        for (const vertex of instance.brush.vertices) box.expandByPoint(vertex.clone().applyMatrix4(matrix));
        return box.getSize(new THREE.Vector3());
      });
    };
    const followed = longBrush(true);
    const square = longBrush(false);
    expect(square[2]!.z).toBeCloseTo(0.25, 5);
    expect(square[2]!.x).toBeCloseTo(1, 5);
    expect(followed[2]!.x).toBeCloseTo(square[2]!.z, 5);
    expect(followed[2]!.z).toBeCloseTo(square[2]!.x, 5);
    expect(square[0]!.toArray()).toEqual(square[2]!.toArray());
  });

  it('loops evenly around a closed path', () => {
    const loop = pathEncode(
      pathCreate(
        [
          [0, 0, 0],
          [4, 0, 0],
          [4, 0, 4],
          [0, 0, 4],
        ],
        { closed: true, smooth: false },
      ),
    );
    const centres = arrayTestCentres([{ kind: 'path', parameters: { path: loop, count: 4, follow: false } }]);
    expect(centres.map(rounded)).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 4],
      [0, 0, 4],
    ]);
  });

  it('stores a valid path and shows Distance only for fixed spacing', () => {
    const kind = modifierStackKindFind('path')!;
    const parameters = kind.normalizeParameters({ path: 'broken' });
    expect(pathDecode(parameters['path'])?.points.length).toBeGreaterThanOrEqual(2);
    expect(parameters['path']).toBe(kind.normalizeParameters({})['path']);
    const distance = kind.fields.find((field) => field.key === 'distance')!;
    expect(distance.visible?.({ spacing: 'distance' })).toBe(true);
    expect(distance.visible?.({ spacing: 'spread' })).toBe(false);
    expect(kind.summary(kind.normalizeParameters({ path: corner, count: 4 }))).toBe('×4 · 8.0 m');
  });

  it('draws an unpickable guide through the path from the volume centre', () => {
    const volume = modifierVolumeTemplateCreate('path');
    volume.updateMatrixWorld(true);
    const step = ModifierVolume.read(volume).modifiers[0]!;
    expect(step.kind).toBe('path');
    const helpers = modifierStackKindFind('path')!.helpers(volume, { ...step.parameters, path: corner });
    expect(helpers).toHaveLength(2);
    const line = helpers[0] as THREE.Line;
    const positions = line.geometry.getAttribute('position');
    expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual([0, 0, 0]);
    const hits: THREE.Intersection[] = [];
    line.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });

  it('keeps the original in place as copy zero', () => {
    const fixture = stackFixture([{ kind: 'path', parameters: { path: corner, count: 2 } }], 40);
    fixture.source.mesh!.position.set(1, 0, 1);
    const centres = fixture.compile().instances.map(arrayTestCentre);
    expect(rounded(centres[0]!)).toEqual([1, 0, 1]);
    expect(rounded(centres[1]!)).toEqual([5, 0, 5]);
  });
});
