import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

describe('bevel girder chart', () => {
  it('keeps the trim profile at one half on the angle bisector for every segment count', () => {
    for (const segments of [1, 2, 4, 8]) {
      expect(bisectorGap(segments)).toBeLessThan(0.08);
    }
  });

  it('measures length in world meters and keeps that zero when the segment count changes', () => {
    expect(lengthMatchesEdge(1)).toBe(true);
    expect(lengthMatchesEdge(8)).toBe(true);
    expect(lengthRowsMatch(2, 8)).toBe(true);
    expect(stretchMatchesTrim()).toBe(true);
    expect(tileKeepsLength()).toBe(true);
  });

  it('keeps world length after the brush is moved, turned, and scaled', () => {
    expect(posedLengthMatches()).toBe(true);
  });
});

/**
 * Returns how far the nearest profile sample is from one half.
 *
 * @param segments Profile segment count.
 * @returns Absolute gap.
 */
function bisectorGap(segments: number): number {
  const placed = deriveKind(segments, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, poseIdentity());
  return nearestHalf(placed.instance, placed.derived);
}

/**
 * Returns whether two samples along an edge differ by their world distance.
 *
 * @param segments Profile segment count.
 * @returns True when length matches.
 */
function lengthMatchesEdge(segments: number): boolean {
  const placed = deriveKind(segments, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, poseIdentity());
  return samplesMatchLength(placed.instance, placed.derived);
}

/**
 * Returns whether stretch uses the trim profile.
 *
 * @returns True when the sample profile matches.
 */
function stretchMatchesTrim(): boolean {
  return (
    Math.abs(
      sampleProfile(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM) - sampleProfile(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH),
    ) < 1e-3
  );
}

/**
 * Returns whether tile keeps the trim's length axis.
 *
 * @returns True when U matches trim.
 */
function tileKeepsLength(): boolean {
  const trim = sampleLength(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
  const tile = sampleLength(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE);
  return Math.abs(trim - tile) < 1e-3;
}

/**
 * Returns the profile of the sample-face centroid.
 *
 * @param layout UV layout.
 * @returns V.
 */
function sampleProfile(layout: ModifierBevelUvLayout): number {
  return sampleCoordinate(layout, 'v');
}

/**
 * Returns the length of the sample-face centroid.
 *
 * @param layout UV layout.
 * @returns U.
 */
function sampleLength(layout: ModifierBevelUvLayout): number {
  return sampleCoordinate(layout, 'u');
}

/**
 * Projects the sample-face centroid.
 *
 * @param layout UV layout.
 * @param axis Length or profile.
 * @returns Coordinate.
 */
function sampleCoordinate(layout: ModifierBevelUvLayout, axis: 'u' | 'v'): number {
  const placed = deriveKind(4, layout, poseIdentity());
  const face = sampleFaces(placed.derived)[0] ?? -1;
  const uv = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, face).uv;
  return uv.project(faceCentroid(placed.derived, face))[axis];
}

/**
 * Returns whether two segment counts share a length row.
 *
 * @param left First segment count.
 * @param right Second segment count.
 * @returns True when the rows agree.
 */
function lengthRowsMatch(left: number, right: number): boolean {
  const first = lengthRow(left);
  const second = lengthRow(right);
  return first.every((value, index) => Math.abs(value - (second[index] ?? 0)) < 1e-3);
}

/**
 * Returns the length row of the sample edge.
 *
 * @param segments Profile segment count.
 * @returns U row.
 */
function lengthRow(segments: number): number[] {
  const placed = deriveKind(segments, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, poseIdentity());
  const face = sampleFaces(placed.derived)[0] ?? -1;
  const row = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, face).uv.u;
  return [row.x, row.y, row.z, row.w];
}

/**
 * Returns whether a posed edge still measures world length.
 *
 * @returns True when the samples match.
 */
function posedLengthMatches(): boolean {
  const placed = deriveKind(4, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, {
    position: new THREE.Vector3(0.4, -0.2, 0.3),
    rotation: new THREE.Euler(0.4, 0.7, -0.25),
    scale: new THREE.Vector3(1.4, 0.8, 1.7),
  });
  return samplesMatchLength(placed.instance, placed.derived);
}

/** Brush pose used while deriving. */
interface GirderPose {
  /** World position. */
  position: THREE.Vector3;
  /** Euler rotation. */
  rotation: THREE.Euler;
  /** Scale. */
  scale: THREE.Vector3;
}

/**
 * Returns an unmoved pose.
 *
 * @returns Identity pose.
 */
function poseIdentity(): GirderPose {
  return { position: new THREE.Vector3(), rotation: new THREE.Euler(), scale: new THREE.Vector3(1, 1, 1) };
}

/**
 * Derives a bevel covered by one volume.
 *
 * @param segments Profile segment count.
 * @param layout UV layout.
 * @param pose Brush pose.
 * @returns Instance and derived brush.
 */
function deriveKind(
  segments: number,
  layout: ModifierBevelUvLayout,
  pose: GirderPose,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  const instance = posedBox(pose);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(8, 8, 8);
  ModifierVolumeBevel.writeSegments(volume, segments);
  ModifierVolumeBevel.writeUvLayout(volume, layout);
  volume.updateMatrixWorld(true);
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived bevel');
  return { instance, derived };
}

/**
 * Builds a unit box at a pose.
 *
 * @param pose Brush pose.
 * @returns Instance.
 */
function posedBox(pose: GirderPose): SolidBrushInstance {
  const instance = new SolidBrushInstance('brush-girder', 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.position.copy(pose.position);
  instance.mesh.rotation.copy(pose.rotation);
  instance.mesh.scale.copy(pose.scale);
  instance.mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Returns the gap from one half across the sample edge.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @returns Absolute gap.
 */
function nearestHalf(instance: SolidBrushInstance, derived: ModifierBevelDerivedBrush): number {
  let best = Number.POSITIVE_INFINITY;
  for (const face of sampleFaces(derived)) best = Math.min(best, halfGap(instance, derived, face));
  return best;
}

/**
 * Returns how close one face comes to profile one half.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Absolute gap.
 */
function halfGap(instance: SolidBrushInstance, derived: ModifierBevelDerivedBrush, faceIndex: number): number {
  const uv = modifierBevelResolveDerivedSurface(instance, derived, faceIndex).uv;
  let best = Math.abs(uv.project(faceCentroid(derived, faceIndex)).v - 0.5);
  for (const point of facePoints(derived, faceIndex)) best = Math.min(best, Math.abs(uv.project(point).v - 0.5));
  return best;
}

/**
 * Returns whether two vertices agree with world length along the edge.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @returns True when the difference matches.
 */
function samplesMatchLength(instance: SolidBrushInstance, derived: ModifierBevelDerivedBrush): boolean {
  const face = sampleFaces(derived)[0] ?? -1;
  const points = facePoints(derived, face);
  const first = points[0];
  const second = points.find((point) => first && point.distanceTo(first) > 0.05);
  if (face < 0 || !first || !second) return false;
  return lengthDeltaMatches(instance, derived, face, first, second);
}

/**
 * Compares one UV length delta with the world edge delta.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param first First local point.
 * @param second Second local point.
 * @returns True when they agree.
 */
function lengthDeltaMatches(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  first: THREE.Vector3,
  second: THREE.Vector3,
): boolean {
  const uv = modifierBevelResolveDerivedSurface(instance, derived, faceIndex).uv;
  const delta = Math.abs(uv.project(first).u - uv.project(second).u);
  return Math.abs(delta - worldAlong(instance, derived, faceIndex, first, second)) < 1e-3;
}

/**
 * Returns the world distance along the face's length gradient.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param first First local point.
 * @param second Second local point.
 * @returns Meters.
 */
function worldAlong(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  first: THREE.Vector3,
  second: THREE.Vector3,
): number {
  const mesh = instance.mesh;
  const girder = derived.girders[derived.girderOfFace[faceIndex] ?? -1];
  if (!mesh || !girder) return 0;
  const direction = girder.direction.clone().transformDirection(mesh.matrixWorld);
  const delta = second.clone().applyMatrix4(mesh.matrixWorld).sub(first.clone().applyMatrix4(mesh.matrixWorld));
  return Math.abs(delta.dot(direction));
}

/**
 * Lists strip faces on the edge between +Y and +Z.
 *
 * @param derived Derived brush.
 * @returns Face indices.
 */
function sampleFaces(derived: ModifierBevelDerivedBrush): number[] {
  const faces: number[] = [];
  for (let index = 0; index < derived.faces.length; index += 1) {
    if (onSampleEdge(derived, index)) faces.push(index);
  }
  return faces;
}

/**
 * Returns whether a face is a strip of the +Y/+Z edge.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns True when the normal rises and faces depth, and not a corner.
 */
function onSampleEdge(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  const normal = derived.localBrush.planes[faceIndex]?.normal;
  const record = derived.faces[faceIndex];
  if (!normal || !record?.chamferEdge || record.cornerFace) return false;
  return Math.abs(normal.x) < 0.25 && normal.y > 0.2 && normal.z > 0.2;
}

/**
 * Returns the centroid of one face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Centroid.
 */
function faceCentroid(derived: ModifierBevelDerivedBrush, faceIndex: number): THREE.Vector3 {
  const points = facePoints(derived, faceIndex);
  const sum = new THREE.Vector3();
  for (const point of points) sum.add(point);
  return points.length === 0 ? sum : sum.multiplyScalar(1 / points.length);
}

/**
 * Returns the vertices of one face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Local vertices.
 */
function facePoints(derived: ModifierBevelDerivedBrush, faceIndex: number): THREE.Vector3[] {
  const face = derived.localBrush.faces[faceIndex];
  return face ? derived.localBrush.getFaceVertices(face) : [];
}
