import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import {
  modifierBevelSpacedNormalDot,
  modifierBevelSpacedPlaneDistance,
} from '@/modifier/bevel/modifier_bevel_inherit_score.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

describe('bevel parent space', () => {
  it('measures local plane distance in brush units and world distance after scale', () => {
    const plane = new SolidPlane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3(0, 0, 2);
    const matrix = new THREE.Matrix4().makeScale(1, 1, 4);
    const local = modifierBevelSpacedPlaneDistance(plane, point, MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL, matrix);
    const world = modifierBevelSpacedPlaneDistance(plane, point, MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD, matrix);
    expect(local).toBeCloseTo(2, 5);
    expect(world).toBeCloseTo(8, 5);
  });

  it('changes a diagonal normal dot when scale is non-uniform', () => {
    const planeNormal = new THREE.Vector3(1, 1, 0).normalize();
    const faceNormal = new THREE.Vector3(1, 0, 0);
    const matrix = new THREE.Matrix4().makeScale(2, 1, 1);
    const local = modifierBevelSpacedNormalDot(planeNormal, faceNormal, MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL, matrix);
    const world = modifierBevelSpacedNormalDot(planeNormal, faceNormal, MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD, matrix);
    expect(world).not.toBeCloseTo(local, 4);
  });

  it('picks the unscaled large face in local space and the scaled large face in world space', () => {
    const instance = scaledBox();
    const localParent = sampleStripParent(instance, MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL);
    const worldParent = sampleStripParent(instance, MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD);
    expect(faceArea(instance, localParent)).toBeCloseTo(8, 4);
    expect(faceArea(instance, worldParent)).toBeCloseTo(4, 4);
  });
});

/**
 * Builds a 4 by 2 by 1 box stretched on Z inside a covering volume.
 *
 * @returns Brush instance.
 */
function scaledBox(): SolidBrushInstance {
  const instance = new SolidBrushInstance('brush-space', 'Box', SolidBrushFactory.createCenteredBox(4, 2, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.scale.set(1, 1, 4);
  instance.mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Returns the parent of the strip between the tall and deep faces.
 *
 * @param instance Authored brush.
 * @param space Map axes or brush axes.
 * @returns Authored parent index.
 */
function sampleStripParent(instance: SolidBrushInstance, space: 'local' | 'world'): number {
  const derived = modifierBevelDeriveBrush(instance, [coveringVolume(space)]);
  if (!derived) throw new Error('expected a derived brush');
  return parentOfSampleStrip(derived);
}

/**
 * Returns the parent of the strip that faces up and forward.
 *
 * @param derived Derived brush.
 * @returns Authored parent index.
 */
function parentOfSampleStrip(derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>): number {
  let bestParent = -1;
  let bestScore = -1;
  derived.localBrush.planes.forEach((plane, index) => {
    const record = derived.faces[index];
    if (!plane || !record?.chamferEdge || record.cornerFace) return;
    const score = sampleStripScore(plane.normal);
    if (score <= bestScore) return;
    bestScore = score;
    bestParent = record.parentSurfaceIndex;
  });
  return bestParent;
}

/**
 * Scores a strip normal that rises and faces depth.
 *
 * @param normal Face normal.
 * @returns Score, or -1 when the normal is not the sample strip.
 */
function sampleStripScore(normal: THREE.Vector3): number {
  if (Math.abs(normal.x) > 0.35 || normal.y <= 0 || normal.z <= 0) return -1;
  return normal.y + normal.z;
}

/**
 * Builds a bevel volume that covers the scaled box.
 *
 * @param space Map axes or brush axes.
 * @returns Bevel volume.
 */
function coveringVolume(space: 'local' | 'world'): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(8, 8, 8);
  volume.updateMatrixWorld(true);
  ModifierVolumeBevel.writeUvFlow(volume, MODIFIER_VOLUME_BEVEL_UV_LARGEST);
  ModifierVolumeBevel.writeSettings(volume, { ...ModifierVolumeBevel.readSettings(volume), uvSpace: space });
  return volume;
}

/**
 * Returns the local area of one authored face.
 *
 * @param instance Authored brush.
 * @param faceIndex Face index.
 * @returns Area.
 */
function faceArea(instance: SolidBrushInstance, faceIndex: number): number {
  const face = instance.brush.faces[faceIndex];
  const points = face ? instance.brush.getFaceVertices(face) : [];
  const origin = points[0];
  if (!origin || points.length < 3) return 0;
  const sum = new THREE.Vector3();
  for (let index = 1; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (!left || !right) continue;
    sum.add(new THREE.Vector3().crossVectors(left.clone().sub(origin), right.clone().sub(origin)));
  }
  return sum.length() * 0.5;
}
