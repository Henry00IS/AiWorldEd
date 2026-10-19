import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** Cached chamfer reuse while a brush stays inside a volume. */
describe('modifier bevel derived cache', () => {
  it('reuses the chamfer while a covered brush stays inside the volume', () => {
    const instance = containedBox();
    const volume = wideVolume();
    const first = modifierBevelDerivedFromCache(instance, [volume]);
    expect(first?.rebuilt).toBe(true);
    moveBrush(instance, 0.2, 0);
    const stayed = modifierBevelDerivedFromCache(instance, [volume]);
    expect(stayed?.rebuilt).toBe(false);
    expect(stayed?.derived).toBe(first?.derived);
    moveBrush(instance, 0.2, Math.PI / 5);
    const turned = modifierBevelDerivedFromCache(instance, [volume]);
    expect(turned?.rebuilt).toBe(false);
    moveBrush(instance, 1.2, 0);
    const left = modifierBevelDerivedFromCache(instance, [volume]);
    expect(left?.rebuilt).toBe(true);
  });

  it('recomputes a covered brush when a world-axis flow is rotated', () => {
    const instance = boxNamed('brush-axis-turn');
    const volume = wideVolume();
    ModifierVolumeBevel.writeUvFlow(volume, MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    ModifierVolumeBevel.writeSettings(volume, {
      ...ModifierVolumeBevel.readSettings(volume),
      uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    });
    const first = modifierBevelDerivedFromCache(instance, [volume]);
    moveBrush(instance, 0, Math.PI / 2);
    const turned = modifierBevelDerivedFromCache(instance, [volume]);
    expect(first?.rebuilt).toBe(true);
    expect(turned?.rebuilt).toBe(true);
    expect(turned?.derived).not.toBe(first?.derived);
  });

  it('recomputes when a volume scale covers an edge that was just outside', () => {
    const instance = boxNamed('brush-volume-scale');
    const volume = volumeJustAboveBrush();
    const before = modifierBevelDerivedFromCache(instance, [volume]);
    expect(before?.rebuilt).toBe(true);
    expect(bottomEdgesSelected(instance, volume)).toBe(false);
    coverBrushByScalingDown(volume);
    const after = modifierBevelDerivedFromCache(instance, [volume]);
    expect(after?.rebuilt).toBe(true);
    expect(after?.derived).not.toBe(before?.derived);
    expect(bottomEdgesSelected(instance, volume)).toBe(true);
  });
});

/**
 * Builds a unit box instance.
 *
 * @returns Instance with an identity mesh.
 */
function containedBox(): SolidBrushInstance {
  return boxNamed('brush-contained');
}

/**
 * Builds a unit box instance with a unique cache id.
 *
 * @param id Brush id.
 * @returns Instance with an identity mesh.
 */
function boxNamed(id: string): SolidBrushInstance {
  const instance = new SolidBrushInstance(id, 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Builds a unit volume whose bottom sits just above a unit brush bottom.
 *
 * @returns Bevel volume.
 */
function volumeJustAboveBrush(): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.position.y = 0.0001;
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Extends the volume downward the way a bottom-face resize does.
 *
 * @param volume Bevel volume.
 */
function coverBrushByScalingDown(volume: THREE.Mesh): void {
  volume.position.y = -0.2499;
  volume.scale.y = 1.5;
  volume.updateMatrixWorld(true);
}

/**
 * Returns whether a bottom edge of the unit box is selected.
 *
 * @param instance Unit box at the origin.
 * @param volume Bevel volume.
 * @returns True when an edge along the bottom is cut.
 */
function bottomEdgesSelected(instance: SolidBrushInstance, volume: THREE.Object3D): boolean {
  const mesh = instance.mesh;
  if (!mesh) return false;
  mesh.updateMatrixWorld(true);
  const worldBrush = instance.brush.clone();
  worldBrush.transformVertices(mesh.matrixWorld);
  const tracked = modifierBevelTrackedEdges(worldBrush, new THREE.Matrix4(), [volume]);
  return tracked.some((edge) => edge.start.y < -0.4 && edge.end.y < -0.4);
}

/**
 * Builds a volume large enough to hold the unit box near the origin.
 *
 * @returns Bevel volume.
 */
function wideVolume(): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(3, 3, 3);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Moves the brush mesh and refreshes its world matrix.
 *
 * @param instance Brush instance.
 * @param offsetX World translation along X.
 * @param rotationY Rotation about Y in radians.
 */
function moveBrush(instance: SolidBrushInstance, offsetX: number, rotationY: number): void {
  const mesh = instance.mesh;
  if (!mesh) return;
  mesh.position.x = offsetX;
  mesh.rotation.y = rotationY;
  mesh.updateMatrixWorld(true);
}
