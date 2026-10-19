import * as THREE from 'three';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import {
  modifierBevelProfileChain,
  modifierBevelProfileStrip,
} from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { modifierBevelApplyUvPlacement } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvFlow,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { deriveVolume } from './modifier_bevel_uv_owner_fixture.js';
import {
  boundsCenter,
  faceAgrees,
  curveKeepsMetric,
  curveMatches,
  curveStaysContinuous,
  curveTurnsAsOne,
  neutralPlacement,
  ownedSegments,
  ownedTurn,
  pivotedSurface,
  pointForUv,
  rolledFlow,
  sharesParent,
  stripAgrees,
  stripOwnedByTop,
  turnedParent,
} from './modifier_bevel_uv_owner_expect.js';

/**
 * Returns whether single ownership uses the lower parent of a split curve.
 *
 * @param segments Profile segment count.
 * @returns True when every segment shares that parent.
 */
export function singleOwnsLowerWall(segments: number): boolean {
  const split = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT, MODIFIER_VOLUME_BEVEL_UV_WINDING);
  const parent = Math.min(...endpointParents(split.derived, splitChain(split.derived)));
  const single = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE, MODIFIER_VOLUME_BEVEL_UV_WINDING);
  return sharesParent(single.derived, firstStripChain(single.derived), parent);
}

/**
 * Returns whether reverse single ownership uses the other wall.
 *
 * @param segments Profile segment count.
 * @returns True when every segment shares the higher split parent.
 */
export function reverseOwnsUpperWall(segments: number): boolean {
  const split = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT, MODIFIER_VOLUME_BEVEL_UV_WINDING);
  const chain = splitChain(split.derived);
  const reversed = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE, MODIFIER_VOLUME_BEVEL_UV_REVERSE);
  return sharesParent(reversed.derived, chain, Math.max(...endpointParents(split.derived, chain)));
}

/**
 * Returns whether an odd curve is divided at its halfway station.
 *
 * @param segments Profile segment count.
 * @returns True when each half keeps one endpoint wall.
 */
export function oddMiddleFollowsFlow(segments: number): boolean {
  const split = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT, MODIFIER_VOLUME_BEVEL_UV_WINDING);
  const chain = splitChain(split.derived);
  if (chain.length !== segments + 1) return false;
  return halvesKeepEnds(chainParents(split.derived, chain));
}

/**
 * Returns whether a curve's two halves each keep one parent.
 *
 * @param parents Parent of each face from one end to the other.
 * @returns True when the halves are uniform and different.
 */
function halvesKeepEnds(parents: readonly number[]): boolean {
  const half = Math.ceil(parents.length / 2);
  const first = parents[0] ?? -1;
  const last = parents[parents.length - 1] ?? -1;
  if (first < 0 || last < 0 || first === last) return false;
  const left = parents.slice(0, half);
  const right = parents.slice(half);
  return left.every((parent) => parent === first) && right.every((parent) => parent === last);
}

/**
 * Finds the first profile curve.
 *
 * @param derived Derived brush.
 * @returns Face indices, or empty when no curve exists.
 */
function firstStripChain(derived: ModifierBevelDerivedBrush): number[] {
  for (let face = 0; face < derived.faces.length; face += 1) {
    if (!modifierBevelProfileStrip(derived, face)) continue;
    const chain = modifierBevelProfileChain(derived, face);
    if (chain.length >= 2) return chain;
  }
  return [];
}

/**
 * Returns whether local +Y stays on the brush after it rolls.
 *
 * @returns True when local and world choose different walls.
 */
export function localUpFollowsBrush(): boolean {
  const local = rolledFlow(MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL);
  const world = rolledFlow(MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD);
  const top = local.instance.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  if (top < 0) return false;
  return local.derived.faces.some((face, index) => {
    if (!modifierBevelProfileStrip(local.derived, index) || face.parentSurfaceIndex !== top) return false;
    return world.derived.faces[index]?.parentSurfaceIndex !== top;
  });
}

/**
 * Returns whether split ownership keeps both walls.
 *
 * @param segments Profile segment count.
 * @returns True when the curve has two parents.
 */
export function splitKeepsBothWalls(segments: number): boolean {
  const split = ownedDerived(segments, MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT, MODIFIER_VOLUME_BEVEL_UV_WINDING);
  const chain = splitChain(split.derived);
  const parents = endpointParents(split.derived, chain);
  return parents.length === 2 && parents[0] !== parents[1];
}

/**
 * Returns whether one-segment single continue matches split continue.
 *
 * @param rotation Volume rotation in degrees.
 * @returns True when the strip UVs agree.
 */
export function singleMatchesSplit(rotation: number): boolean {
  const split = ownedTurn(MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT, rotation);
  const single = ownedTurn(MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE, rotation);
  return stripAgrees(split, single);
}

/**
 * Returns whether a rotated parent face continues onto single the same way as
 * split.
 *
 * @returns True when the bevel UVs agree and differ from an unrotated parent.
 */
export function parentTurnMatches(): boolean {
  const split = turnedParent(MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT);
  const single = turnedParent(MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE);
  const face = stripOwnedByTop(single.derived);
  const plain = ownedTurn(MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE, 0);
  return face >= 0 && faceAgrees(split, single, face) && !faceAgrees(single, plain, face);
}

/**
 * Returns whether a 90 degree volume rotation is one turn of the whole curve.
 *
 * @returns True when segments stay continuous, turn together, and keep their
 *   metric.
 */
export function segmentsRotateTogether(): boolean {
  const plain = ownedSegments(0);
  const turned = ownedSegments(90);
  const chain = plain.chain;
  return rotationHolds(plain, turned, chain) && curveMatches(plain, ownedSegments(0), chain);
}

/**
 * Returns whether a tiled curve turns as one chart.
 *
 * @returns True when tile segments stay continuous and turn together.
 */
export function tileTurnsTogether(): boolean {
  const plain = laidCurve(0);
  const turned = laidCurve(90);
  return rotationHolds(plain, turned, plain.chain);
}

/**
 * Derives a four-segment tiled curve.
 *
 * @param rotation Volume rotation in degrees.
 * @returns Instance, derived brush, and curve faces.
 */
function laidCurve(rotation: number): {
  instance: SolidBrushInstance;
  derived: ModifierBevelDerivedBrush;
  chain: number[];
} {
  const placed = deriveVolume(
    4,
    MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    1,
    rotation,
    MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  );
  return { ...placed, chain: firstStripChain(placed.derived) };
}

/**
 * Returns whether one rotated curve stays continuous and evenly turned.
 *
 * @param plain Unrotated derive.
 * @param turned Rotated derive.
 * @param chain Curve faces.
 * @returns True when the curve passes every rotation check.
 */
function rotationHolds(
  plain: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  turned: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  chain: readonly number[],
): boolean {
  return (
    curveStaysContinuous(turned, chain) &&
    curveTurnsAsOne(plain, turned, chain) &&
    curveKeepsMetric(plain, turned, chain)
  );
}

/**
 * Returns whether a 180 degree turn keeps one UV fixed.
 *
 * @param matrix Unrotated matrix.
 * @param placement Placement with a 180 degree rotation.
 * @param pivot Pivot passed to the placement.
 * @param label Pivot name, unused except to keep the call obvious at the
 *   assertion.
 * @returns True when the pivot UV is unchanged.
 */
export function holdsPivot(
  matrix: SurfaceUvMatrix,
  placement: ReturnType<typeof neutralPlacement>,
  pivot: { u: number; v: number },
): boolean {
  const placed = modifierBevelApplyUvPlacement(matrix, placement, pivot);
  const uv = placed.project(new THREE.Vector3(pivot.u, pivot.v, 0));
  return Math.abs(uv.u - pivot.u) < 1e-4 && Math.abs(uv.v - pivot.v) < 1e-4;
}

/**
 * Returns whether a sample away from the origin moves when the pivot is the
 * anchor.
 *
 * @param matrix Unrotated matrix.
 * @param placement Placement with a 180 degree rotation.
 * @returns True when the sample UV changes.
 */
export function anchorMovesSample(matrix: SurfaceUvMatrix, placement: ReturnType<typeof neutralPlacement>): boolean {
  const placed = modifierBevelApplyUvPlacement(matrix, placement, { u: 0, v: 0 });
  const uv = placed.project(new THREE.Vector3(0.2, 0.4, 0));
  return Math.hypot(uv.u - 0.2, uv.v - 0.4) > 0.05;
}

/**
 * Returns whether a curve midpoint stays fixed when rotating about center.
 *
 * @returns True when the midpoint UV is unchanged.
 */
export function curveCenterStays(): boolean {
  return Math.abs(pivotShift(MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER)) < 1e-3;
}

/**
 * Returns whether a curve midpoint moves when rotating about the anchor.
 *
 * @returns True when the midpoint UV changes.
 */
export function curveAnchorMoves(): boolean {
  return Math.abs(pivotShift(MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR)) > 0.05;
}

/**
 * Returns how far the unrotated midpoint moves after a 180 degree turn.
 *
 * @param pivot Rotation pivot.
 * @returns UV distance.
 */
function pivotShift(pivot: ModifierBevelUvPivot): number {
  const base = pivotedSurface(0, MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR);
  const turnedSurface = pivotedSurface(180, pivot);
  const center = boundsCenter(base.matrix, base.derived, base.chain);
  const point = pointForUv(base.matrix, base.origin, center);
  const uv = turnedSurface.matrix.project(point);
  return Math.hypot(uv.u - center.u, uv.v - center.v);
}

/**
 * Derives a beveled box with one owner and flow.
 *
 * @param segments Profile segment count.
 * @param owner Curve owner.
 * @param flow UV flow.
 * @returns Instance and derived brush.
 */
function ownedDerived(
  segments: number,
  owner: ModifierBevelUvOwner,
  flow: ModifierBevelUvFlow,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  return deriveVolume(segments, owner, flow, 1, 0, MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR);
}

/**
 * Finds a profile curve whose split parents differ.
 *
 * @param derived Derived brush.
 * @returns Face indices.
 */
function splitChain(derived: ModifierBevelDerivedBrush): number[] {
  for (let face = 0; face < derived.faces.length; face += 1) {
    if (!modifierBevelProfileStrip(derived, face)) continue;
    const chain = modifierBevelProfileChain(derived, face);
    if (new Set(chainParents(derived, chain)).size > 1) return chain;
  }
  return [];
}

/**
 * Lists the parents of a curve.
 *
 * @param derived Derived brush.
 * @param chain Face indices.
 * @returns Parent indices.
 */
function chainParents(derived: ModifierBevelDerivedBrush, chain: readonly number[]): number[] {
  return chain.map((face) => derived.faces[face]?.parentSurfaceIndex ?? -1);
}

/**
 * Lists the parents at the two ends of a curve.
 *
 * @param derived Derived brush.
 * @param chain Face indices.
 * @returns Parent indices of the endpoints.
 */
function endpointParents(derived: ModifierBevelDerivedBrush, chain: readonly number[]): number[] {
  const first = chain[0] ?? -1;
  const last = chain[chain.length - 1] ?? first;
  return [derived.faces[first]?.parentSurfaceIndex ?? -1, derived.faces[last]?.parentSurfaceIndex ?? -1];
}
