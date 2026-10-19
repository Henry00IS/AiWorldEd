import * as THREE from 'three';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelProfileChain } from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  type ModifierBevelUvLayout,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  PlacedLayout,
  boxAndVolume,
  brushMesh,
  chainSpanV,
  derive,
  firstFacePoint,
  layoutSegments,
  seamsAgree,
  stripIndex,
  uvBounds,
} from './modifier_bevel_uv_layout_fixture.js';

/**
 * Returns whether a short bevel still uses one copy of trim and stretch.
 *
 * @param segments Profile segment count.
 * @returns True when both layouts cover the curve once.
 */
export function lowSegmentCoversOnce(segments: number): boolean {
  return (
    curveCoversOnce(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, segments) &&
    curveCoversOnce(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH, segments)
  );
}

/**
 * Returns whether one layout covers a short curve once.
 *
 * @param layout Trim or stretch.
 * @param segments Profile segment count.
 * @returns True when the curve spans one texture and the faces share edges.
 */
function curveCoversOnce(layout: ModifierBevelUvLayout, segments: number): boolean {
  const placed = layoutSegments(layout, segments);
  const chain = modifierBevelProfileChain(placed.derived, placed.index);
  const span = chainSpanV(placed, chain);
  const face = uvBounds(placed.surface, placed.derived, placed.index);
  return chain.length > 1 && span > 0.99 && span < 1.01 && face.maxV - face.minV < 0.75 && seamsAgree(placed, chain);
}

/**
 * Returns whether Axis follows the dominant normal of generated faces.
 *
 * @returns True when a vertical face matches overhead and a depth face matches
 *   front.
 */
export function axisMatchesDominantNormal(): boolean {
  const placed = layoutSegments(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS, 2);
  return axisFaceMatches(placed, 'y') && axisFaceMatches(placed, 'z');
}

/**
 * Returns whether one dominant-axis face uses the matching projection.
 *
 * @param placed Resolved strip.
 * @param axis Dominant normal axis.
 * @returns True when a matching face was found.
 */
function axisFaceMatches(placed: PlacedLayout, axis: 'y' | 'z'): boolean {
  for (let index = 0; index < placed.derived.faces.length; index += 1) {
    if (dominantFaceMatches(placed, index, axis)) return true;
  }
  return false;
}

/**
 * Returns whether one face's normal and UV match an axis projection.
 *
 * @param placed Resolved strip.
 * @param faceIndex Face index.
 * @param axis Dominant normal axis.
 * @returns True when this face is the requested projection.
 */
function dominantFaceMatches(placed: PlacedLayout, faceIndex: number, axis: 'y' | 'z'): boolean {
  const normal = placed.derived.localBrush.planes[faceIndex]?.normal;
  if (!normal || !placed.derived.faces[faceIndex]?.chamferEdge || !normalLeads(normal, axis)) return false;
  const point = firstFacePoint(placed.derived, faceIndex);
  const uv = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, faceIndex).uv.project(point);
  const expectedV = axis === 'y' ? point.z : point.y;
  return Math.abs(uv.u - point.x) < 1e-3 && Math.abs(uv.v - expectedV) < 1e-3;
}

/**
 * Returns whether a normal's largest component is one axis.
 *
 * @param normal Face normal.
 * @param axis Axis to test.
 * @returns True when that component is strictly the largest.
 */
function normalLeads(normal: THREE.Vector3, axis: 'y' | 'z'): boolean {
  const value = Math.abs(normal[axis]);
  return value > Math.abs(normal.x) && value > Math.abs(axis === 'y' ? normal.z : normal.y);
}

/**
 * Returns whether a brush-space view is unchanged by a yaw.
 *
 * @param layout Overhead, front, or side.
 * @returns True when a fixed local point keeps its UV.
 */
export function localViewSticks(layout: ModifierBevelUvLayout): boolean {
  const flat = viewSample(
    layout,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  const turned = viewSample(
    layout,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    Math.PI / 2,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  return uvClose(flat, turned);
}

/**
 * Returns whether a map-space view changes when the brush yaws.
 *
 * @param layout Overhead, front, or side.
 * @returns True when a fixed local point moves in UV.
 */
export function worldViewMoves(layout: ModifierBevelUvLayout): boolean {
  const flat = viewSample(
    layout,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  const turned = viewSample(
    layout,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    Math.PI / 2,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  return !uvClose(flat, turned);
}

/**
 * Returns whether brush scale changes the world length of a local view.
 *
 * @returns True when doubling X doubles overhead U after a yaw.
 */
export function localViewFollowsScale(): boolean {
  const flat = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  const wide = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    Math.PI / 2,
    new THREE.Vector3(2, 1, 1),
    new THREE.Vector3(),
  );
  return Math.abs(wide.u - flat.u * 2) < 1e-3 && Math.abs(wide.v - flat.v) < 1e-3;
}

/**
 * Returns whether moving the brush leaves a local view in place.
 *
 * @returns True when the UV of a local point is unchanged.
 */
export function localViewIgnoresMove(): boolean {
  const home = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  const moved = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(0.4, -0.2, 0.3),
  );
  return uvClose(home, moved);
}

/**
 * Returns whether moving the brush shifts a map-space view.
 *
 * @returns True when the UV of a local point changes.
 */
export function worldViewFollowsMove(): boolean {
  const home = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(),
  );
  const moved = viewSample(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    0,
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(0.4, -0.2, 0.3),
  );
  return !uvClose(home, moved);
}

/**
 * Returns whether local Axis follows the brush normal after a roll.
 *
 * @returns True when the UV matches that normal and the map view does not.
 */
export function localAxisKeepsOverhead(): boolean {
  const local = axisSample(MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL);
  const world = axisSample(MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD);
  if (!local || !world) return false;
  return uvClose(local.uv, expectedAxisUv(local.normal)) && !uvClose(local.uv, world.uv);
}

/**
 * Projects one local point through a posed view layout.
 *
 * @param layout Overhead, front, or side.
 * @param space Map axes or brush axes.
 * @param yaw Rotation about Y in radians.
 * @param scale Brush scale.
 * @param position Brush position.
 * @returns UV of a fixed local point.
 */
function viewSample(
  layout: ModifierBevelUvLayout,
  space: ModifierBevelUvSpace,
  yaw: number,
  scale: THREE.Vector3,
  position: THREE.Vector3,
): { u: number; v: number } {
  const { instance, volume } = boxAndVolume();
  poseViewBrush(instance, yaw, scale, position);
  return projectView(instance, volume, layout, space);
}

/**
 * Moves, turns, and scales a brush.
 *
 * @param instance Authored brush.
 * @param yaw Rotation about Y in radians.
 * @param scale Brush scale.
 * @param position Brush position.
 */
function poseViewBrush(instance: SolidBrushInstance, yaw: number, scale: THREE.Vector3, position: THREE.Vector3): void {
  const mesh = brushMesh(instance);
  mesh.rotation.y = yaw;
  mesh.scale.copy(scale);
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
}

/**
 * Resolves one strip and projects a fixed local point.
 *
 * @param instance Authored brush.
 * @param volume Bevel volume.
 * @param layout UV layout.
 * @param space Map axes or brush axes.
 * @returns UV.
 */
function projectView(
  instance: SolidBrushInstance,
  volume: THREE.Object3D,
  layout: ModifierBevelUvLayout,
  space: ModifierBevelUvSpace,
): { u: number; v: number } {
  writeView(volume, layout, space);
  const derived = derive(instance, volume);
  const uv = modifierBevelResolveDerivedSurface(instance, derived, stripIndex(derived)).uv;
  return uv.project(new THREE.Vector3(0.2, 0.3, 0.4));
}

/**
 * Stores a layout and a UV space.
 *
 * @param volume Bevel volume.
 * @param layout UV layout.
 * @param space Map axes or brush axes.
 */
function writeView(volume: THREE.Object3D, layout: ModifierBevelUvLayout, space: ModifierBevelUvSpace): void {
  const settings = ModifierVolumeBevel.readSettings(volume);
  ModifierVolumeBevel.writeSettings(volume, { ...settings, uvLayout: layout, uvSpace: space });
}

/**
 * Projects a rolled up-and-depth face through Axis.
 *
 * @param space Map axes or brush axes.
 * @returns UV and the local normal, or null when that face is missing.
 */
function axisSample(space: ModifierBevelUvSpace): { uv: { u: number; v: number }; normal: THREE.Vector3 } | null {
  const { instance, volume } = boxAndVolume();
  const mesh = brushMesh(instance);
  mesh.rotation.z = Math.PI / 2;
  mesh.updateMatrixWorld(true);
  writeView(volume, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS, space);
  const derived = derive(instance, volume);
  const face = upwardDepthFace(derived);
  const normal = derived.localBrush.planes[face]?.normal;
  if (face < 0 || !normal) return null;
  const uv = modifierBevelResolveDerivedSurface(instance, derived, face).uv;
  return { uv: uv.project(new THREE.Vector3(0.2, 0.3, 0.4)), normal };
}

/**
 * Returns the brush-space Axis UV of a fixed local point.
 *
 * @param normal Local face normal.
 * @returns UV from the dominant brush axis.
 */
function expectedAxisUv(normal: THREE.Vector3): { u: number; v: number } {
  if (Math.abs(normal.y) >= Math.abs(normal.x) && Math.abs(normal.y) >= Math.abs(normal.z)) {
    return { u: 0.2, v: 0.4 };
  }
  if (Math.abs(normal.z) >= Math.abs(normal.x)) return { u: 0.2, v: 0.3 };
  return { u: 0.4, v: 0.3 };
}

/**
 * Finds a generated face whose local normal rises and faces depth.
 *
 * @param derived Derived brush.
 * @returns Face index, or -1.
 */
function upwardDepthFace(derived: ModifierBevelDerivedBrush): number {
  for (let index = 0; index < derived.faces.length; index += 1) {
    const normal = derived.localBrush.planes[index]?.normal;
    if (!normal || !derived.faces[index]?.chamferEdge) continue;
    if (normal.y > 0.4 && normal.z > 0.4 && Math.abs(normal.x) < 0.2) return index;
  }
  return -1;
}

/**
 * Returns whether two UV samples agree.
 *
 * @param left First sample.
 * @param right Second sample.
 * @returns True when both axes agree.
 */
function uvClose(left: { u: number; v: number }, right: { u: number; v: number }): boolean {
  return Math.abs(left.u - right.u) < 1e-3 && Math.abs(left.v - right.v) < 1e-3;
}
