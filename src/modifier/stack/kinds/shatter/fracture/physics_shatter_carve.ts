import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { PhysicsShatterFaceOrigin, PhysicsShatterInput } from './physics_shatter_types.js';
import { PhysicsShatterPolytope } from './physics_shatter_polytope.js';

/** First polytope face origin that names a face of another input. */
const PHYSICS_SHATTER_FOREIGN_ORIGIN = 1 << 24;

/** Face origins reserved per input above the foreign offset. */
const PHYSICS_SHATTER_FOREIGN_STRIDE = 1 << 12;

/** A later input that removes volume from the cells of an earlier one. */
export interface PhysicsShatterCutter {
  /** Input index of the cutter. */
  index: number;
  /** Outward planes of the cutter, in face order. */
  planes: readonly SolidPlane[];
  /** Bounds of the cutter. */
  box: THREE.Box3;
  /** True when its faces show as hole walls; false when they are hidden joins. */
  subtractive: boolean;
}

/**
 * Builds a cutter per input. Every input carves the earlier inputs it overlaps:
 * a later additive brush owns the shared volume, a subtractive one empties it.
 *
 * @param inputs Fracture inputs in CSG order.
 * @returns Cutter per input index.
 */
export function physicsShatterCutters(inputs: readonly PhysicsShatterInput[]): PhysicsShatterCutter[] {
  return inputs.map((input, index) => ({
    index,
    planes: input.brush.planes,
    box: new THREE.Box3().setFromPoints(input.brush.vertices),
    subtractive: input.operation === SolidOperation.Subtractive,
  }));
}

/**
 * Returns whether an input makes pieces. Only additive inputs do.
 *
 * @param input Fracture input.
 * @returns True for an additive input.
 */
export function physicsShatterInputMakesPieces(input: PhysicsShatterInput): boolean {
  return (input.operation ?? SolidOperation.Additive) === SolidOperation.Additive;
}

/**
 * Removes every overlapping cutter from a cell. The part outside each cutter
 * plane in turn is kept as a convex fragment, and the rest goes on to the next
 * plane until only the inside of the cutter is left, which is dropped.
 * Fragments keep the hole's faces where a subtractive cutter cut them.
 *
 * @param cell Cell geometry.
 * @param origins Face origin per cell face.
 * @param cutters Later inputs that overlap the cell's input.
 * @returns Fragments in deterministic order; the whole cell when nothing cuts
 *   it.
 */
export function physicsShatterCarve(
  cell: SolidBrush,
  origins: readonly number[],
  cutters: readonly PhysicsShatterCutter[],
): PhysicsShatterPolytope[] {
  let fragments = [physicsShatterPolytopeWithOrigins(cell, origins)];
  for (const cutter of cutters) fragments = fragments.flatMap((fragment) => physicsShatterSubtract(fragment, cutter));
  return fragments;
}

/**
 * Subtracts one convex cutter from a convex polytope.
 *
 * @param polytope Polytope to carve.
 * @param cutter Cutter.
 * @returns Convex fragments outside the cutter.
 */
function physicsShatterSubtract(
  polytope: PhysicsShatterPolytope,
  cutter: PhysicsShatterCutter,
): PhysicsShatterPolytope[] {
  if (!cutter.box.intersectsBox(new THREE.Box3().setFromPoints(polytope.vertices))) return [polytope];
  const fragments: PhysicsShatterPolytope[] = [];
  let rest: PhysicsShatterPolytope | null = polytope;
  for (let face = 0; face < cutter.planes.length && rest; face++) {
    const plane = cutter.planes[face];
    if (!plane) continue;
    const capOrigin = cutter.subtractive ? physicsShatterForeignOrigin(cutter.index, face) : -1;
    const outside = rest.clip(physicsShatterPlaneFlipped(plane), capOrigin);
    if (outside) fragments.push(outside);
    rest = rest.clip(plane);
  }
  return fragments;
}

/**
 * Reads a cell brush as a polytope whose faces carry the cell's origins.
 *
 * @param cell Cell brush.
 * @param origins Face origin per cell face.
 * @returns Polytope.
 */
function physicsShatterPolytopeWithOrigins(cell: SolidBrush, origins: readonly number[]): PhysicsShatterPolytope {
  const read = PhysicsShatterPolytope.fromBrush(cell);
  const faces = read.faces.map((face, index) => ({ loop: face.loop, origin: origins[index] ?? -1 }));
  return new PhysicsShatterPolytope(read.vertices, faces);
}

/**
 * Returns the opposite plane.
 *
 * @param plane Plane.
 * @returns Plane with negated normal and offset.
 */
function physicsShatterPlaneFlipped(plane: SolidPlane): SolidPlane {
  return new SolidPlane(plane.normal.clone().negate(), -plane.offset);
}

/**
 * Encodes a face of another input as a polytope face origin.
 *
 * @param inputIndex Input the face lies on.
 * @param faceIndex Face index on that input.
 * @returns Face origin.
 */
function physicsShatterForeignOrigin(inputIndex: number, faceIndex: number): number {
  return PHYSICS_SHATTER_FOREIGN_ORIGIN + inputIndex * PHYSICS_SHATTER_FOREIGN_STRIDE + faceIndex;
}

/**
 * Decodes a polytope face origin: a face of the cell's own input, a face of
 * another input, or a crack face.
 *
 * @param origin Polytope face origin.
 * @returns Face origin of the piece.
 */
export function physicsShatterFaceOriginOf(origin: number): PhysicsShatterFaceOrigin {
  if (origin < 0) return { kind: 'crack', sourceFaceIndex: -1 };
  if (origin < PHYSICS_SHATTER_FOREIGN_ORIGIN) return { kind: 'original', sourceFaceIndex: origin };
  const foreign = origin - PHYSICS_SHATTER_FOREIGN_ORIGIN;
  const sourceInputIndex = Math.floor(foreign / PHYSICS_SHATTER_FOREIGN_STRIDE);
  return { kind: 'original', sourceFaceIndex: foreign % PHYSICS_SHATTER_FOREIGN_STRIDE, sourceInputIndex };
}
