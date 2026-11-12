import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { paintDecalFit, paintDecalVolumeCreate } from '@/paint/decal/paint_decal_fit.js';
import { paintCopyKey, PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { paintBrushKey } from '@/paint/scene/paint_brush_key.js';
import { paintCopyTargets } from '@/paint/scene/paint_copy_targets.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { paintCopyDerived, paintCopyFixture } from '../copies/paint_copy_fixture.js';

/**
 * Returns the face of a brush whose normal points along an axis.
 *
 * @param brush Brush shape.
 * @param axis Outward direction.
 * @returns Face index.
 */
function faceAlong(brush: SolidBrush, axis: THREE.Vector3): number {
  return brush.planes.findIndex((plane) => plane.normal.dot(axis) > 0.99);
}

/**
 * Maps points into the unit box space of a fitted decal.
 *
 * @param fit Fitted world matrix.
 * @param points World points.
 * @returns Points in the box, where the box spans -0.5..0.5.
 */
function inBox(fit: THREE.Matrix4, points: readonly THREE.Vector3[]): THREE.Vector3[] {
  const toBox = fit.clone().invert();
  return points.map((point) => point.clone().applyMatrix4(toBox));
}

const UP = new THREE.Vector3(0, 1, 0);

describe('Fitting decal volumes to surfaces', () => {
  it('covers exactly the face under the cursor and projects into it', () => {
    const { source } = paintCopyFixture(['mirror']);
    const top = faceAlong(source.brush, UP);
    const toWorld = source.mesh!.matrixWorld;
    const fit = paintDecalFit({ brush: source.brush, surfaceIndex: top, toWorld }, 'surface');
    expect(fit).not.toBeNull();
    const up = new THREE.Vector3().setFromMatrixColumn(fit!, 1).normalize();
    expect(up.dot(UP)).toBeGreaterThan(0.999);
    const face = source.brush.getFaceVertices(source.brush.faces[top]!).map((point) => point.applyMatrix4(toWorld));
    for (const point of inBox(fit!, face)) {
      expect(Math.abs(point.x)).toBeCloseTo(0.5, 4);
      expect(Math.abs(point.z)).toBeCloseTo(0.5, 4);
      expect(Math.abs(point.y)).toBeLessThan(0.5);
    }
    const bottom = source.brush.getFaceVertices(source.brush.faces[faceAlong(source.brush, UP.clone().negate())]!);
    for (const point of inBox(
      fit!,
      bottom.map((entry) => entry.applyMatrix4(toWorld)),
    )) {
      expect(point.y).toBeLessThan(-0.5);
    }
  });

  it('keeps images upright on walls', () => {
    const { source } = paintCopyFixture(['mirror']);
    const side = faceAlong(source.brush, new THREE.Vector3(1, 0, 0));
    const fit = paintDecalFit(
      { brush: source.brush, surfaceIndex: side, toWorld: source.mesh!.matrixWorld },
      'surface',
    );
    // Images run up the volume's -Z (see the decal layer), so -Z must be world up.
    expect(new THREE.Vector3().setFromMatrixColumn(fit!, 2).normalize().y).toBeLessThan(-0.999);
    expect(fit!.determinant()).toBeGreaterThan(0);
    // An image whose top half is opaque lands on the top half of the wall.
    const { world, model } = paintCopyFixture(['mirror']);
    const wall = model.findBrush(source.id) ?? model.getBrushes()[0]!;
    const wallFace = faceAlong(wall.brush, new THREE.Vector3(1, 0, 0));
    const wallFit = paintDecalFit(
      { brush: wall.brush, surfaceIndex: wallFace, toWorld: wall.mesh!.matrixWorld },
      'surface',
    );
    const volume = paintDecalVolumeCreate(wallFit!, world, 0xff0000);
    const settings = ModifierVolume.read(volume);
    ModifierVolume.write(volume, {
      ...settings,
      modifiers: settings.modifiers.map((step) => ({ ...step, parameters: { ...step.parameters, texture: 'half' } })),
    });
    world.add(volume);
    world.updateMatrixWorld(true);
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 8; index++) data.set([255, 0, 0, 255], index * 4);
    const images = { image: (id: string) => (id === 'half' ? { width: 4, height: 4, data } : null) };
    const scene = new THREE.Scene();
    scene.add(world);
    const system = new PaintSceneSystem(scene, () => world, images);
    system.setLayerProvider(new PaintDecalProvider(() => world, images));
    system.update();
    const center = new THREE.Vector3(0.5, 0, 0).applyMatrix4(wall.mesh!.matrixWorld);
    const upper = new Float32Array(6);
    const lower = new Float32Array(6);
    expect(system.sampleAt(model, wall, wallFace, center.clone().setY(center.y + 0.25), upper)).toBe(true);
    system.sampleAt(model, wall, wallFace, center.clone().setY(center.y - 0.25), lower);
    expect(Array.from(upper)).not.toEqual(Array.from(lower));
    expect(upper[3]).toBeGreaterThan(0.5);
    expect(lower[3]).toBeLessThan(0.5);
    system.dispose();
  });

  it('can enclose the whole brush, projecting into the face under the cursor', () => {
    const { source } = paintCopyFixture(['mirror']);
    const side = faceAlong(source.brush, new THREE.Vector3(1, 0, 0));
    const toWorld = source.mesh!.matrixWorld;
    const fit = paintDecalFit({ brush: source.brush, surfaceIndex: side, toWorld }, 'object');
    expect(fit).not.toBeNull();
    expect(new THREE.Vector3().setFromMatrixColumn(fit!, 1).normalize().x).toBeGreaterThan(0.999);
    const corners = source.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(toWorld));
    for (const point of inBox(fit!, corners)) {
      expect(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))).toBeLessThan(0.5 + 1e-6);
    }
  });

  it('creates a decal volume in the paint color that ends up at the fitted place', () => {
    const parent = new THREE.Group();
    parent.position.set(1, 2, 3);
    parent.rotation.y = 0.4;
    parent.updateMatrixWorld(true);
    const fit = new THREE.Matrix4().compose(
      new THREE.Vector3(4, 1, -2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, 0.1)),
      new THREE.Vector3(2, 0.2, 1.5),
    );
    const volume = paintDecalVolumeCreate(fit, parent, 0x2060ff);
    parent.add(volume);
    parent.updateMatrixWorld(true);
    expect(volume.matrixWorld.elements.every((value, index) => Math.abs(value - fit.elements[index]!) < 1e-5)).toBe(
      true,
    );
    const [step] = ModifierVolume.read(volume).modifiers;
    expect(step?.kind).toBe('decal');
    expect(step?.parameters['color']).toBe('#2060ff');
    expect(step?.parameters['edgeFade']).toBe(0);
  });

  it('makes one array copy look different without reaching its neighbours', () => {
    const { world, model, source } = paintCopyFixture([{ kind: 'linear', parameters: { count: 3 } }]);
    const copies = paintCopyTargets(model);
    const middle = copies[0]!;
    const derived = paintCopyDerived(model.root).find((brush) => brush.id === middle.id)!;
    model.root.updateWorldMatrix(true, false);
    const fit = paintDecalFit(
      { brush: derived.brush, surfaceIndex: faceAlong(derived.brush, UP), toWorld: model.root.matrixWorld },
      'surface',
    );
    world.add(paintDecalVolumeCreate(fit!, world, 0x2060ff));
    world.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    scene.add(world);
    const system = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
    system.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
    system.update();
    expect(system.atlas.hasBrush(paintCopyKey(model, middle))).toBe(true);
    for (const other of copies.slice(1)) expect(system.atlas.hasBrush(paintCopyKey(model, other))).toBe(false);
    expect(system.atlas.hasBrush(paintBrushKey(model, source))).toBe(false);
    system.dispose();
  });
});
