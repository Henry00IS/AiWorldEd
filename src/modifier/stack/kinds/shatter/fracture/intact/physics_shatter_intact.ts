import * as THREE from 'three';
import type {
  PhysicsShatterInput,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import {
  physicsShatterPieceCreate,
  type PhysicsShatterPieceSource,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_piece.js';
import {
  physicsShatterCutters,
  physicsShatterInputMakesPieces,
  physicsShatterOverlaps,
  physicsShatterPolytopeWithOrigins,
  type PhysicsShatterCutter,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_carve.js';
import {
  physicsShatterPieceBoundsFor,
  physicsShatterPieceShape,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import { physicsShatterIntactPartsVolume, physicsShatterIntactSplitBest } from './physics_shatter_intact_split.js';

/** Piece size whose minimum thickness is the absolute floor, for split parts. */
const PHYSICS_SHATTER_INTACT_PIECE_SIZE = 0;

/**
 * Keeps every additive input brush whole, as one piece with its own faces, for
 * Shatter off. Inputs still combine in CSG order: a brush that later inputs
 * carve or overlap keeps only what stays visible, split into convex parts that
 * share a body id so they move as one body. A brush nothing cuts passes through
 * exactly as it came, without a body id.
 *
 * @param inputs Convex brushes in the modifier frame, in CSG order.
 * @param settings Fracture settings; only the seed is read.
 * @returns Pieces and bookkeeping.
 */
export function physicsShatterIntact(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
): PhysicsShatterResult {
  const result = physicsShatterIntactResultEmpty(inputs);
  const cutters = physicsShatterCutters(inputs).map((cutter) => ({ ...cutter, facesShow: true }));
  inputs.forEach((input, sourceIndex) => physicsShatterIntactInput(result, cutters, input, sourceIndex, settings.seed));
  result.pieces.forEach((piece, index) => (piece.index = index));
  return result;
}

/**
 * Returns a result with no pieces yet and the input bookkeeping filled in.
 *
 * @param inputs Inputs in CSG order.
 * @returns Empty result.
 */
function physicsShatterIntactResultEmpty(inputs: readonly PhysicsShatterInput[]): PhysicsShatterResult {
  const makers = inputs.filter(physicsShatterInputMakesPieces);
  return {
    pieces: [],
    inputVolume: makers.reduce((sum, input) => sum + physicsShatterBrushVolume(input.brush), 0),
    carvedVolume: 0,
    carvingInputs: inputs.length - makers.length,
    droppedVolume: 0,
    droppedPieces: 0,
    repairedPieces: 0,
    unsoundPieces: 0,
    limited: false,
  };
}

/**
 * Adds the piece or parts of one input.
 *
 * @param result Result to extend.
 * @param cutters Cutter per input, whose cut faces keep their texture.
 * @param input Input brush.
 * @param sourceIndex Input index.
 * @param seed Fracture seed stored on the pieces.
 */
function physicsShatterIntactInput(
  result: PhysicsShatterResult,
  cutters: readonly PhysicsShatterCutter[],
  input: PhysicsShatterInput,
  sourceIndex: number,
  seed: number,
): void {
  if (!physicsShatterInputMakesPieces(input)) return;
  const source = { sourceBrushId: input.sourceBrushId, sourceIndex, seed, isBrick: false };
  const origins = input.brush.faces.map((_face, faceIndex) => faceIndex);
  const overlapping = physicsShatterIntactCuttersOf(cutters, input, sourceIndex, origins);
  if (overlapping.length === 0) physicsShatterIntactWhole(result, input, origins, source);
  else physicsShatterIntactParts(result, input, origins, source, overlapping);
}

/**
 * Returns the later inputs that overlap an input with real volume.
 *
 * @param cutters Cutter per input.
 * @param input Input brush.
 * @param sourceIndex Input index.
 * @param origins Face origin per input face.
 * @returns Overlapping cutters in CSG order.
 */
function physicsShatterIntactCuttersOf(
  cutters: readonly PhysicsShatterCutter[],
  input: PhysicsShatterInput,
  sourceIndex: number,
  origins: readonly number[],
): PhysicsShatterCutter[] {
  const box = new THREE.Box3().setFromPoints(input.brush.vertices);
  const polytope = physicsShatterPolytopeWithOrigins(input.brush, origins);
  return cutters.filter(
    (cutter) => cutter.index > sourceIndex && cutter.box.intersectsBox(box) && physicsShatterOverlaps(polytope, cutter),
  );
}

/**
 * Adds an input nothing cuts as one piece: its own brush, untouched.
 *
 * @param result Result to extend.
 * @param input Input brush.
 * @param origins Face origin per input face.
 * @param source Input the piece comes from.
 */
function physicsShatterIntactWhole(
  result: PhysicsShatterResult,
  input: PhysicsShatterInput,
  origins: readonly number[],
  source: PhysicsShatterPieceSource,
): void {
  const piece = physicsShatterPieceCreate(input.brush, origins, 0, source, 0);
  if (piece) result.pieces.push(piece);
  else {
    result.droppedPieces++;
    result.droppedVolume += physicsShatterBrushVolume(input.brush);
  }
}

/**
 * Adds what later inputs leave of an input as convex parts sharing the input's
 * index as body id; a single part needs no body id.
 *
 * @param result Result to extend.
 * @param input Input brush.
 * @param origins Face origin per input face.
 * @param source Input the parts come from.
 * @param cutters Later inputs overlapping it.
 */
function physicsShatterIntactParts(
  result: PhysicsShatterResult,
  input: PhysicsShatterInput,
  origins: readonly number[],
  source: PhysicsShatterPieceSource,
  cutters: readonly PhysicsShatterCutter[],
): void {
  const bounds = physicsShatterPieceBoundsFor(PHYSICS_SHATTER_INTACT_PIECE_SIZE, physicsShatterPieceShape(input.brush));
  const split = physicsShatterIntactSplitBest(input.brush, origins, cutters, bounds);
  const kept = physicsShatterIntactPartsVolume(split.parts);
  result.carvedVolume += Math.max(0, physicsShatterBrushVolume(input.brush) - kept - split.failedVolume);
  result.droppedPieces += split.failedParts;
  result.droppedVolume += split.failedVolume;
  result.unsoundPieces += split.unsoundParts;
  split.parts.forEach((part, partIndex) => {
    const piece = physicsShatterPieceCreate(part.brush, part.origins, partIndex, source, 0);
    if (!piece) return;
    if (split.parts.length > 1) piece.bodyId = source.sourceIndex;
    result.pieces.push(piece);
  });
}
