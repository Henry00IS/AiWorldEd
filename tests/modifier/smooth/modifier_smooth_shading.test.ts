import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { modifierStackAdd, modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate, modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { SolidModel } from '@/solid/model/solid_model.js';
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

/**
 * Counts non-flat normals in the rendered model geometry.
 *
 * @param model Solid model.
 * @returns Smoothed vertex count.
 */
function modelSmoothed(model: SolidModel): number {
  const geometry = model.getResultMesh().geometry;
  return smoothed({ positions: geometry.getAttribute('position'), normals: geometry.getAttribute('normal') });
}

/**
 * Reloads a saved world and rebuilds its first solid.
 *
 * @param world World to save.
 * @returns Reloaded solid.
 */
function modelReload(world: THREE.Group): SolidModel {
  const loaded = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), loaded);
  modifierBevelRefreshScene(loaded);
  const model = loaded.children.map((object) => SolidModel.fromObject(object)).find((entry) => entry !== null);
  if (!model) throw new Error('missing reloaded solid');
  model.rebuild();
  return model;
}

/**
 * Adds a separate smoothing volume around the existing fixture.
 *
 * @param fixture Bevelled scene fixture.
 * @returns Smoothing volume.
 */
function smoothVolumeAdd(fixture: ReturnType<typeof stackFixture>): THREE.Object3D {
  const smooth = modifierVolumeTemplateCreate('smooth');
  const settings = ModifierVolume.read(smooth);
  ModifierVolume.write(smooth, modifierStackParameterSet(settings, settings.modifiers[0]?.id ?? '', 'maxAngle', 60));
  smooth.scale.copy(fixture.volume.scale);
  fixture.world.add(smooth);
  fixture.refresh();
  return smooth;
}

/**
 * Changes the last smoothing modifier and refreshes its rendered normals.
 *
 * @param fixture Bevelled scene fixture.
 * @param angle Smoothing threshold in degrees.
 */
function smoothAngleSet(fixture: ReturnType<typeof stackFixture>, angle: number): void {
  const settings = ModifierVolume.read(fixture.volume);
  const id = settings.modifiers.find((entry) => entry.kind === 'smooth')?.id ?? '';
  ModifierVolume.write(fixture.volume, modifierStackParameterSet(settings, id, 'maxAngle', angle));
  fixture.refresh();
}

describe('smooth shading', () => {
  it('smooths a single-segment bevel at 60 degrees without softening a plain box', () => {
    expect(
      smoothed(
        shaded(['bevel', { kind: 'smooth', parameters: { maxAngle: 60 } }], 8, (volume) =>
          ModifierVolumeBevel.writeDistance(volume, 0.2),
        ),
      ),
    ).toBeGreaterThan(20);
    expect(smoothed(shaded(['smooth']))).toBe(0);
  });

  it('lets a later Smooth Shading override bevel strip normals, including flat shading', () => {
    const prepare = (volume: THREE.Object3D) =>
      ModifierVolumeBevel.writeSettings(volume, {
        ...ModifierVolumeBevel.readSettings(volume),
        distance: 0.2,
        segments: 4,
        options: modifierBevelOptionsNormalize({ normals: 'smooth' }),
      });
    expect(smoothed(shaded(['bevel'], 8, prepare))).toBeGreaterThan(20);
    const result = shaded(['bevel', { kind: 'smooth', parameters: { maxAngle: 0 } }], 8, prepare);
    expect(smoothed(result)).toBe(0);
  });

  it('smooths a separate bevel volume and keeps normals through bake and save/load', () => {
    const fixture = stackFixture(['bevel']);
    ModifierVolumeBevel.writeDistance(fixture.volume, 0.2);
    const smooth = smoothVolumeAdd(fixture);
    expect(modelSmoothed(fixture.model)).toBeGreaterThan(20);
    expect(modelSmoothed(modelReload(fixture.world))).toBeGreaterThan(20);
    new CommandModifierVolumeBake(fixture.volume).execute();
    new CommandModifierVolumeBake(smooth).execute();
    expect(modelSmoothed(fixture.model)).toBeGreaterThan(20);
    expect(modelSmoothed(modelReload(fixture.world))).toBeGreaterThan(20);
  });

  it('does not apply a later bevel twice when Smooth Shading comes first', () => {
    const prepare = (volume: THREE.Object3D) => ModifierVolumeBevel.writeDistance(volume, 0.1);
    const plain = shaded(['bevel'], 8, prepare);
    const reordered = shaded(['smooth', 'bevel'], 8, prepare);
    expect(Array.from(reordered.positions.array)).toEqual(Array.from(plain.positions.array));
  });

  it('smooths a single-segment bevel at a sufficiently large angle', () => {
    const result = shaded(['bevel', { kind: 'smooth', parameters: { maxAngle: 90 } }], 8, (volume) => {
      ModifierVolumeBevel.writeDistance(volume, 0.2);
      ModifierVolumeBevel.writeSegments(volume, 1);
    });
    expect(smoothed(result)).toBeGreaterThan(20);
  });

  it('updates a bevelled box when smooth shading is added and retuned interactively', () => {
    const fixture = stackFixture(['bevel']);
    ModifierVolumeBevel.writeDistance(fixture.volume, 0.2);
    ModifierVolumeBevel.writeSegments(fixture.volume, 4);
    fixture.refresh();
    expect(modelSmoothed(fixture.model)).toBe(0);
    ModifierVolume.write(fixture.volume, modifierStackAdd(ModifierVolume.read(fixture.volume), 'smooth'));
    fixture.refresh();
    expect(modelSmoothed(fixture.model)).toBeGreaterThan(20);
    smoothAngleSet(fixture, 0);
    expect(modelSmoothed(fixture.model)).toBe(0);
    smoothAngleSet(fixture, 60);
    expect(modelSmoothed(fixture.model)).toBeGreaterThan(20);
  });

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

  it('smooths fillet facets at the max angle while keeping flat sides and caps flat', () => {
    const profile = JSON.stringify({
      points: [
        [0, 0.6],
        [1, 0.6],
      ],
      segments: [['linear', 8, 'rounded_square', 0.3]],
    });
    const column = (smoothAngle: number) => [
      { kind: 'column', parameters: { profile, sides: '32', aspect: 1.4, smoothAngle } },
    ];
    const smooth = shaded(column(60), 2);
    expect(smoothed(smooth)).toBeGreaterThan(30);
    expect(smoothed(shaded(column(0), 2))).toBe(0);
    for (const normalY of capNormals(smooth)) expect(normalY).toBeCloseTo(1, 6);
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
