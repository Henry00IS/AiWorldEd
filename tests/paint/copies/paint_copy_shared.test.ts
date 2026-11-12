import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { paintCopyTargets } from '@/paint/scene/paint_copy_targets.js';
import { PaintSceneSystem, paintCopyKey } from '@/paint/scene/paint_scene_system.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { paintExportBake } from '@/paint/export/paint_export_bake.js';
import { paintStrokeTargets } from '@/paint/tool/paint_stroke_targets.js';
import { PaintStrokeBuilder } from '@/paint/tool/paint_stroke_builder.js';
import { CommandPaintStrokes } from '@/paint/commands/command_paint_strokes.js';
import { PaintStrokeLayer } from '@/paint/stroke/paint_stroke_layer.js';
import { TEST_PAINT_STYLE, testFloorStroke } from '../paint_test_strokes.js';
import { paintCopyDecal, paintCopyFixture } from './paint_copy_fixture.js';
import type { StackFixtureStep } from '../../modifier/stack/modifier_stack_fixture.js';

/** Brush-local point on the top of the 1 m source box, off its center. */
const DAB = new THREE.Vector3(0.25, 0.5, -0.2);

/**
 * Builds a copy fixture whose source brush has one red dab on its top.
 *
 * @param steps Modifier steps.
 * @returns Fixture, scene and paint system.
 */
function paintedCopies(steps: readonly StackFixtureStep[]) {
  const fixture = paintCopyFixture(steps);
  fixture.source.paint.add(testFloorStroke('dab', 1, [[DAB.x, DAB.y, DAB.z]], { radius: 0.12 }));
  const scene = new THREE.Scene();
  scene.add(fixture.world);
  const system = new PaintSceneSystem(scene, () => fixture.world, PAINT_IMAGE_SOURCE_NONE);
  system.setLayerProvider(new PaintDecalProvider(() => fixture.world, PAINT_IMAGE_SOURCE_NONE));
  const update = () => {
    system.update();
    scene.updateMatrixWorld(true);
  };
  update();
  return { ...fixture, scene, system, update };
}

/**
 * Lists overlay vertex positions in world space.
 *
 * @param scene Scene.
 * @returns Points.
 */
function overlayPoints(scene: THREE.Scene): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  scene.getObjectByName('paint_overlays')?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    if (position === undefined || object.name !== '') return;
    for (let index = 0; index < position.count; index++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld));
    }
  });
  return points;
}

/**
 * Expects an overlay triangle to cover a world point: the overlay only exists
 * over painted tiles, so a covered point is a painted one.
 *
 * @param points Overlay points, three per triangle.
 * @param at World point.
 */
function expectPaintNear(points: readonly THREE.Vector3[], at: THREE.Vector3): void {
  const triangle = new THREE.Triangle();
  const closest = new THREE.Vector3();
  let covered = false;
  for (let index = 0; index + 2 < points.length && !covered; index += 3) {
    triangle.set(points[index]!, points[index + 1]!, points[index + 2]!);
    covered = triangle.closestPointToPoint(at, closest).distanceTo(at) < 1e-3;
  }
  expect(covered).toBe(true);
}

/**
 * Returns where the dab lands on every copy of a model.
 *
 * @param model Model.
 * @returns World points.
 */
function dabOnCopies(model: Parameters<typeof paintCopyTargets>[0]): THREE.Vector3[] {
  return paintCopyTargets(model).map((copy) => DAB.clone().applyMatrix4(copy.sourceToModel));
}

describe('Shared paint on modifier copies', () => {
  it('shows the paint of the authored brush on every array copy without extra tiles', () => {
    const { model, scene, system, source } = paintedCopies([{ kind: 'linear', parameters: { count: 3 } }]);
    const points = overlayPoints(scene);
    expectPaintNear(points, DAB.clone().add(source.mesh!.position));
    const copies = dabOnCopies(model);
    expect(copies).toHaveLength(2);
    for (const at of copies) expectPaintNear(points, at);
    for (const copy of paintCopyTargets(model)) expect(system.atlas.hasBrush(paintCopyKey(model, copy))).toBe(false);
    system.dispose();
  });

  it('shows the paint mirrored on mirror copies', () => {
    const { model, scene, system } = paintedCopies(['mirror']);
    const [mirrored] = dabOnCopies(model);
    expect(mirrored).toBeDefined();
    expectPaintNear(overlayPoints(scene), mirrored!);
    const copy = paintCopyTargets(model)[0]!;
    expect(copy.sourceToModel.determinant()).toBeLessThan(0);
    const top = copy.source.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
    const authored = new Float32Array(6);
    const sourceWorld = DAB.clone().applyMatrix4(copy.source.mesh!.matrixWorld);
    expect(system.sampleAt(model, copy.source, top, sourceWorld, authored)).toBe(true);
    const blank = new Float32Array(6);
    system.sampleAt(model, copy.source, top, sourceWorld.clone().setX(sourceWorld.x - 0.4), blank);
    expect(Array.from(authored)).not.toEqual(Array.from(blank));
    const sample = new Float32Array(6);
    system.sampleAt(model, copy.source, top, mirrored!, sample, copy);
    expect(Array.from(sample)).toEqual(Array.from(authored));
    // Where the dab would land if the copy were not reflected along x or z.
    for (const wrong of [new THREE.Vector3(-DAB.x, DAB.y, DAB.z), new THREE.Vector3(DAB.x, DAB.y, -DAB.z)]) {
      const there = new Float32Array(6);
      system.sampleAt(model, copy.source, top, wrong.applyMatrix4(copy.sourceToModel), there, copy);
      expect(Array.from(there)).toEqual(Array.from(blank));
    }
    system.dispose();
  });

  it('follows changes of the copy count', () => {
    const fixture = paintedCopies([{ kind: 'linear', parameters: { count: 2 } }]);
    expect(dabOnCopies(fixture.model)).toHaveLength(1);
    const settings = ModifierVolume.read(fixture.volume);
    ModifierVolume.write(fixture.volume, {
      ...settings,
      modifiers: settings.modifiers.map((step) => ({ ...step, parameters: { ...step.parameters, count: 4 } })),
    });
    fixture.rebuild();
    fixture.update();
    const copies = dabOnCopies(fixture.model);
    expect(copies).toHaveLength(3);
    const points = overlayPoints(fixture.scene);
    for (const at of copies) expectPaintNear(points, at);
    fixture.system.dispose();
  });

  it('gives a copy its own tiles when a decal reaches it, keeping the shared paint', () => {
    const { world, model, scene, system, update } = paintedCopies([{ kind: 'linear', parameters: { count: 3 } }]);
    const [first, second] = paintCopyTargets(model);
    const center = new THREE.Vector3(0, 0.5, 0.2).applyMatrix4(second!.sourceToModel);
    paintCopyDecal(world, center);
    update();
    expect(system.atlas.hasBrush(paintCopyKey(model, second!))).toBe(true);
    expect(system.atlas.hasBrush(paintCopyKey(model, first!))).toBe(false);
    const points = overlayPoints(scene);
    for (const at of dabOnCopies(model)) expectPaintNear(points, at);
    expectPaintNear(points, center);
    system.dispose();
  });

  it('moves the own tiles of copies with a decal that moves between copies and away, like a fresh bake', () => {
    const { world, model, scene, system, update } = paintedCopies([{ kind: 'linear', parameters: { count: 3 } }]);
    const [first, second] = paintCopyTargets(model);
    const decal = paintCopyDecal(world, new THREE.Vector3(0, 0.5, 0.2).applyMatrix4(second!.sourceToModel));
    update();
    decal.position.copy(new THREE.Vector3(0, 0.5, 0.2).applyMatrix4(first!.sourceToModel));
    world.updateMatrixWorld(true);
    update();
    expect(system.atlas.hasBrush(paintCopyKey(model, first!))).toBe(true);
    expect(system.atlas.hasBrush(paintCopyKey(model, second!))).toBe(false);
    const fresh = new PaintSceneSystem(new THREE.Scene(), () => world, PAINT_IMAGE_SOURCE_NONE);
    fresh.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
    fresh.update();
    expect(system.atlas.tileCount).toBe(fresh.atlas.tileCount);
    decal.position.set(0, 40, 0);
    world.updateMatrixWorld(true);
    update();
    expect(system.atlas.hasBrush(paintCopyKey(model, first!))).toBe(false);
    const points = overlayPoints(scene);
    for (const at of dabOnCopies(model)) expectPaintNear(points, at);
    fresh.update();
    expect(system.atlas.tileCount).toBe(fresh.atlas.tileCount);
    fresh.dispose();
    system.dispose();
  });

  it('turns a stroke drawn on a copy into dabs in the authored brush space', () => {
    const { model, source, world } = paintCopyFixture([{ kind: 'linear', parameters: { count: 3 } }]);
    const targets = paintStrokeTargets(world);
    const copy = paintCopyTargets(model)[1]!;
    const target = targets.find((entry) => entry.key === paintCopyKey(model, copy));
    expect(target).toBeDefined();
    expect(target?.brush).toBe(source);
    const worldPoint = DAB.clone().applyMatrix4(copy.sourceToModel);
    expect(target!.worldBounds.containsPoint(worldPoint)).toBe(true);
    expect(worldPoint.applyMatrix4(target!.worldToLocal).distanceTo(DAB)).toBeLessThan(1e-5);
  });

  it('commits a stroke drawn on a mirror copy to the authored brush, mirrored back, with undo', () => {
    const { model, source, world, rebuild } = paintCopyFixture(['mirror']);
    const copy = paintCopyTargets(model)[0]!;
    const copyTarget = paintStrokeTargets(world).find((entry) => entry.key === paintCopyKey(model, copy))!;
    const builder = new PaintStrokeBuilder({ ...TEST_PAINT_STYLE, radius: 0.05 }, [copyTarget], () => 'drawn');
    const up = new THREE.Vector3(0, 1, 0);
    const viewUp = new THREE.Vector3(0, 0, -1);
    builder.addPoint(DAB.clone().applyMatrix4(copy.sourceToModel), up, viewUp);
    builder.finish();
    const [record] = builder.records();
    expect(record?.target.key).toBe(paintCopyKey(model, copy));
    const dabs = record!.stroke.dabs;
    expect(new THREE.Vector3(dabs[0], dabs[1], dabs[2]).distanceTo(DAB)).toBeLessThan(1e-5);
    const command = new CommandPaintStrokes([{ model, brushId: copyTarget.brush.id, stroke: record!.stroke }]);
    command.execute();
    expect(source.paint.get('drawn')).toBe(record!.stroke);
    rebuild();
    const decoded = PaintStrokeLayer.decode(source.paint.encode());
    expect(decoded.get('drawn')?.dabs).toEqual(record!.stroke.dabs);
    command.undo();
    expect(source.paint.isEmpty()).toBe(true);
  });

  it('bakes the shared paint onto every exported copy', () => {
    const { model, source } = paintCopyFixture([{ kind: 'linear', parameters: { count: 3 } }]);
    source.paint.add(testFloorStroke('dab', 1, [[DAB.x, DAB.y, DAB.z]], { radius: 0.12 }));
    const result = model.getResultMesh();
    const exported = new THREE.Mesh(result.geometry, new THREE.MeshPhysicalMaterial({ color: 0x808080 }));
    const baked = paintExportBake(model, result, exported, {
      images: PAINT_IMAGE_SOURCE_NONE,
      layers: null,
      baseImage: () => null,
    });
    expect(baked).toBe(true);
    const group = exported.geometry.groups.find((entry) => entry.materialIndex === 1);
    const position = exported.geometry.getAttribute('position');
    const tops = new Set<number>();
    for (let vertex = group!.start; vertex < group!.start + group!.count; vertex++) {
      tops.add(Math.round(position.getX(vertex) * 10) / 10);
    }
    const centers = [DAB.clone().add(source.mesh!.position), ...dabOnCopies(model)];
    for (const at of centers) {
      expect([...tops].some((x) => Math.abs(x - at.x) < 0.8)).toBe(true);
    }
    const materials = exported.material as unknown as THREE.MeshPhysicalMaterial[];
    expect(materials).toHaveLength(2);
  });
});
