import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { stackFixture, type StackFixtureStep } from '../stack/modifier_stack_fixture.js';

/**
 * Builds a fixture, refreshes it and returns the result normals.
 *
 * @param steps Stack steps.
 * @param scale Volume size.
 * @param prepare Optional changes before the refresh.
 * @returns Result positions and normals.
 */
function shaded(steps: readonly StackFixtureStep[], scale = 8, prepare?: (volume: THREE.Object3D) => void) {
  const fixture = stackFixture(steps, scale);
  prepare?.(fixture.volume);
  fixture.refresh();
  fixture.model.rebuild();
  const geometry = fixture.model.getResultMesh().geometry;
  return {
    fixture,
    positions: geometry.getAttribute('position'),
    normals: geometry.getAttribute('normal'),
  };
}

/**
 * Counts vertex normals that differ from their triangle's flat normal.
 *
 * @param result Shaded result.
 * @param result.positions Positions.
 * @param result.normals Normals.
 * @returns Smoothed vertex count.
 */
function smoothed(result: {
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  normals: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
}): number {
  let count = 0;
  const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let vertex = 0; vertex < result.positions.count; vertex++) {
    const first = vertex - (vertex % 3);
    a.fromBufferAttribute(result.positions, first);
    b.fromBufferAttribute(result.positions, first + 1);
    c.fromBufferAttribute(result.positions, first + 2);
    const flat = b.sub(a).cross(c.sub(a)).normalize();
    if (n.fromBufferAttribute(result.normals, vertex).dot(flat) < 0.9999) count++;
  }
  return count;
}

/**
 * Returns the vertex normals of faces whose flat normal is vertical.
 *
 * @param result Shaded result.
 * @param result.positions Positions.
 * @param result.normals Normals.
 * @returns Normal Y of cap vertices.
 */
function capNormals(result: ReturnType<typeof shaded>): number[] {
  const out: number[] = [];
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let first = 0; first < result.positions.count; first += 3) {
    a.fromBufferAttribute(result.positions, first);
    b.fromBufferAttribute(result.positions, first + 1);
    c.fromBufferAttribute(result.positions, first + 2);
    if (Math.abs(b.sub(a).cross(c.sub(a)).normalize().y) < 0.999) continue;
    for (let at = 0; at < 3; at++) out.push(Math.abs(result.normals.getY(first + at)));
  }
  return out;
}

const STRAIGHT = curveEncode(
  curveFromPolyline([
    [0, 0.6],
    [1, 0.6],
  ]),
);

describe('smooth shading', () => {
  it('smooths round column sides and keeps caps flat, or nothing at 0', () => {
    const column = (smoothAngle: number) => [
      { kind: 'column', parameters: { sides: '16', profile: STRAIGHT, smoothAngle } },
    ];
    const smooth = shaded(column(60), 2);
    expect(smoothed(smooth)).toBeGreaterThan(30);
    expect(capNormals(smooth).length).toBeGreaterThan(0);
    for (const y of capNormals(smooth)) expect(y).toBeCloseTo(1, 6);
    expect(smoothed(shaded(column(0), 2))).toBe(0);
    expect(smoothed(shaded(column(10), 2))).toBe(0);
  });

  it('keeps square column segments flat', () => {
    const square = JSON.stringify({
      points: [
        [0, 0.6],
        [1, 0.6],
      ],
      segments: [['linear', 8, 's']],
    });
    expect(
      smoothed(shaded([{ kind: 'column', parameters: { sides: '16', profile: square, smoothAngle: 60 } }], 2)),
    ).toBe(0);
  });

  it('starts columns and arches smooth at 60 degrees', () => {
    const fixture = stackFixture(['column', 'arch']);
    for (const entry of ModifierVolume.read(fixture.volume).modifiers) expect(entry.parameters['smoothAngle']).toBe(60);
  });

  it('smooths a bevelled box below the max angle and keeps its 90 degree edges hard', () => {
    const bevel = (volume: THREE.Object3D) => {
      ModifierVolumeBevel.writeDistance(volume, 0.2);
      ModifierVolumeBevel.writeSegments(volume, 4);
    };
    const plain = shaded(['smooth']);
    expect(smoothed(plain)).toBe(0);
    const flat = shaded(['bevel'], 8, bevel);
    expect(smoothed(flat)).toBe(0);
    const smooth = shaded(['bevel', 'smooth'], 8, bevel);
    expect(smoothed(smooth)).toBeGreaterThan(20);
  });

  it('saves the modifier and offers a Smooth Shading Volume', () => {
    expect(modifierVolumeTemplates.find((entry) => entry.id === 'smooth')?.label).toBe('Smooth Shading Volume');
    const { fixture } = shaded([{ kind: 'smooth', parameters: { maxAngle: 45 } }]);
    const json = new SceneSerializer().serialize(fixture.world);
    const loaded = new SceneDeserializer()
      .deserialize(json, new THREE.Group())
      .find((object) => ModifierVolume.isVolume(object));
    expect(ModifierVolume.read(loaded ?? new THREE.Object3D()).modifiers[0]).toMatchObject({
      kind: 'smooth',
      parameters: { maxAngle: 45 },
    });
  });
});
