import { Matrix4, Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  type ModifierBevelUvFlow,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import { modifierBevelPreferParent, modifierBevelUnifyCornerParents } from './modifier_bevel_corner_parent.js';
import {
  modifierBevelParentScores,
  modifierBevelSpacedNormalDot,
  modifierBevelSpacedPlaneDistance,
  modifierBevelRankParents,
  modifierBevelRemainderPrefers,
  type ModifierBevelParentScore,
} from './modifier_bevel_inherit_score.js';

/** Choice state shared while generated faces pick a parent. */
interface ModifierBevelInheritContext {
  /** Chamfered brush. */
  derived: SolidBrush;
  /** Authored planes in the same space as the chamfer. */
  sourcePlanes: readonly (SolidPlane | undefined)[];
  /** UV flow. */
  mode: ModifierBevelUvFlow;
  /** Authored face scores in face order. */
  scores: readonly ModifierBevelParentScore[];
  /** Map axes or brush axes. */
  space: ModifierBevelUvSpace;
  /** Brush mesh world matrix. */
  matrix: Matrix4;
}

/**
 * Maps each derived face to the authored face it inherits, and records chamfer
 * edges for UV smear.
 *
 * @param sourceBrush Authored brush in local space.
 * @param derivedBrush Chamfered brush in the same local space.
 * @param worldMatrix Brush mesh world matrix.
 * @param mode UV flow used when several authored faces could win.
 * @param space Map axes or brush axes.
 * @param scores Authored face scores in face order.
 * @returns One record per derived face.
 */
export function modifierBevelInheritFaces(
  sourceBrush: SolidBrush,
  derivedBrush: SolidBrush,
  worldMatrix: Matrix4,
  mode: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace = MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  scores: readonly ModifierBevelParentScore[] = modifierBevelParentScores(sourceBrush, worldMatrix),
): ModifierBevelFaceRecord[] {
  const context = modifierBevelInheritContext(derivedBrush, worldMatrix, sourceBrush, mode, space, scores);
  const parents = derivedBrush.faces.map((_, index) =>
    modifierBevelMatchingSourceFace(sourceBrush, derivedBrush.planes[index]),
  );
  const records = modifierBevelSeedMatchedFaces(parents);
  modifierBevelSpreadSmear(context, records);
  return records.map((record) => record ?? modifierBevelFallbackRecord(parents));
}

/**
 * Builds the shared choice state.
 *
 * @param derived Chamfered brush.
 * @param worldMatrix Brush mesh world matrix.
 * @param source Authored brush.
 * @param mode UV flow.
 * @param space Map axes or brush axes.
 * @param scores Authored face scores in face order.
 * @returns Choice state.
 */
function modifierBevelInheritContext(
  derived: SolidBrush,
  worldMatrix: Matrix4,
  source: SolidBrush,
  mode: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  scores: readonly ModifierBevelParentScore[],
): ModifierBevelInheritContext {
  return {
    derived,
    sourcePlanes: source.planes,
    mode,
    scores,
    space,
    matrix: worldMatrix,
  };
}

/**
 * Finds an authored face on the same plane as a derived face.
 *
 * @param sourceBrush Authored brush.
 * @param plane Derived face plane.
 * @returns Source face index, or -1.
 */
function modifierBevelMatchingSourceFace(sourceBrush: SolidBrush, plane: SolidPlane | undefined): number {
  if (!plane) return -1;
  for (let index = 0; index < sourceBrush.planes.length; index++) {
    const sourcePlane = sourceBrush.planes[index];
    if (sourcePlane && sourcePlane.isAlignedWith(plane)) return index;
  }
  return -1;
}

/**
 * Seeds records for faces that still match an authored plane.
 *
 * @param derivedBrush Chamfered brush.
 * @param parents Authored face index per derived face, or -1.
 * @returns Sparse records.
 */
function modifierBevelSeedMatchedFaces(parents: number[]): (ModifierBevelFaceRecord | undefined)[] {
  return parents.map((parent) => {
    if (parent < 0) return undefined;
    return { parentSurfaceIndex: parent, smearFromDerivedIndex: -1, chamferEdge: null, cornerFace: false };
  });
}

/**
 * Spreads smear links from matched faces across generated neighbors.
 *
 * @param context Choice state.
 * @param records Sparse records, filled in place.
 */
function modifierBevelSpreadSmear(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
): void {
  const visited = new Set<number>();
  for (const start of modifierBevelChainStarts(context, records)) {
    if (visited.has(start.face)) continue;
    modifierBevelWalkChain(context, records, visited, start.face, start.source);
  }
  modifierBevelAssignRemainders(context, records);
}

/**
 * Lists generated faces that share a long edge with an authored face.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @returns Chain starts, preferred authored face first.
 */
function modifierBevelChainStarts(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
): { face: number; source: number; original: number }[] {
  const starts: { face: number; source: number; original: number }[] = [];
  records.forEach((record, face) => modifierBevelCollectChainStart(context, records, starts, record, face));
  starts.sort((left, right) => modifierBevelOrderChainStarts(context, left, right));
  return starts;
}

/**
 * Appends one chain start when the face is an unclaimed strip.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param starts Accumulator.
 * @param record Existing record, if any.
 * @param face Derived face index.
 */
function modifierBevelCollectChainStart(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  starts: { face: number; source: number; original: number }[],
  record: ModifierBevelFaceRecord | undefined,
  face: number,
): void {
  if (record) return;
  const source = modifierBevelPreferredOriginal(context, records, face);
  if (!source || !modifierBevelFaceIsStrip(context.derived, face)) return;
  starts.push({ face, source: source.face, original: source.parent });
}

/**
 * Orders two chain starts by the UV flow.
 *
 * @param context Choice state.
 * @param left First start.
 * @param right Second start.
 * @returns Sort comparison.
 */
function modifierBevelOrderChainStarts(
  context: ModifierBevelInheritContext,
  left: { face: number; source: number; original: number },
  right: { face: number; source: number; original: number },
): number {
  const ranked = modifierBevelCompareChainStarts(context, left, right);
  if (ranked !== 0) return ranked;
  return left.face - right.face;
}

/**
 * Compares two chain starts by the UV flow.
 *
 * @param context Choice state.
 * @param left First start.
 * @param right Second start.
 * @returns Negative when left wins.
 */
function modifierBevelCompareChainStarts(
  context: ModifierBevelInheritContext,
  left: { face: number; source: number; original: number },
  right: { face: number; source: number; original: number },
): number {
  if (context.mode === MODIFIER_VOLUME_BEVEL_UV_NEAREST)
    return modifierBevelStartGap(context, left) - modifierBevelStartGap(context, right);
  if (context.mode === MODIFIER_VOLUME_BEVEL_UV_ALIGNED) {
    return modifierBevelStartAlignment(context, right) - modifierBevelStartAlignment(context, left);
  }
  if (context.mode === MODIFIER_VOLUME_BEVEL_UV_MAJORITY) {
    return modifierBevelStartBorder(context, right) - modifierBevelStartBorder(context, left);
  }
  return modifierBevelRankedParents(context, left.original, right.original);
}

/**
 * Ranks two authored parents with the active space.
 *
 * @param context Choice state.
 * @param left Parent index.
 * @param right Parent index.
 * @returns Negative when left wins.
 */
function modifierBevelRankedParents(context: ModifierBevelInheritContext, left: number, right: number): number {
  return modifierBevelRankParents(context.mode, context.scores, left, right, context.space, context.matrix);
}

/**
 * Returns the distance from a start face to its authored plane.
 *
 * @param context Choice state.
 * @param start Chain start.
 * @returns Distance. Smaller is closer.
 */
function modifierBevelStartGap(
  context: ModifierBevelInheritContext,
  start: { face: number; original: number },
): number {
  const center = modifierBevelFaceSample(context.derived, start.face);
  return modifierBevelSpacedPlaneDistance(context.sourcePlanes[start.original], center, context.space, context.matrix);
}

/**
 * Returns how aligned a start face is with its authored normal.
 *
 * @param context Choice state.
 * @param start Chain start.
 * @returns Dot product. Larger is closer.
 */
function modifierBevelStartAlignment(
  context: ModifierBevelInheritContext,
  start: { face: number; original: number },
): number {
  return modifierBevelSpacedNormalDot(
    context.sourcePlanes[start.original]?.normal,
    context.derived.planes[start.face]?.normal,
    context.space,
    context.matrix,
  );
}

/**
 * Returns the shared edge between a start and its authored neighbor.
 *
 * @param context Choice state.
 * @param start Chain start.
 * @returns Edge length.
 */
function modifierBevelStartBorder(
  context: ModifierBevelInheritContext,
  start: { face: number; source: number },
): number {
  return modifierBevelSharedEdgeLength(context.derived, start.face, start.source);
}

/**
 * Returns the center of one face.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Centroid.
 */
function modifierBevelFaceSample(brush: SolidBrush, faceIndex: number): Vector3 {
  const face = brush.faces[faceIndex];
  const points = face ? brush.getFaceVertices(face) : [];
  const center = new Vector3();
  if (points.length === 0) return center;
  for (const point of points) center.add(point);
  return center.multiplyScalar(1 / points.length);
}

/**
 * Picks the authored profile neighbor preferred by the UV flow.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param faceIndex Generated face.
 * @returns Neighbor, or null when this face is a middle segment.
 */
function modifierBevelPreferredOriginal(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
): { face: number; parent: number } | null {
  let best: { face: number; parent: number } | null = null;
  for (const neighbor of modifierBevelProfileNeighbors(context.derived, faceIndex)) {
    best = modifierBevelConsiderOriginal(context, records, faceIndex, neighbor, best);
  }
  return best;
}

/**
 * Keeps the better authored neighbor.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param neighbor Candidate neighbor.
 * @param best Neighbor chosen so far.
 * @returns Updated choice.
 */
function modifierBevelConsiderOriginal(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
  neighbor: number,
  best: { face: number; parent: number } | null,
): { face: number; parent: number } | null {
  const record = records[neighbor];
  if (!record || record.chamferEdge) return best;
  const next = { face: neighbor, parent: record.parentSurfaceIndex };
  if (!best || modifierBevelPreferParent(context, faceIndex, next, best) < 0) return next;
  return best;
}

/**
 * Assigns one strip from an authored face through each following segment.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param visited Faces already claimed by a chain.
 * @param faceIndex First generated face.
 * @param sourceIndex Face to smear from.
 */
function modifierBevelWalkChain(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  sourceIndex: number,
): void {
  const mine = records[sourceIndex]?.parentSurfaceIndex;
  if (mine === undefined) return;
  const other = modifierBevelFarChainParent(context, records, visited, faceIndex, mine);
  modifierBevelClaimChain(context, records, visited, faceIndex, sourceIndex, mine, other);
}

/**
 * Claims profile segments while they still prefer this chain's parent.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex First generated face.
 * @param sourceIndex Face to smear from.
 * @param mine Parent at this end of the strip.
 * @param other Parent at the far end, or -1.
 */
function modifierBevelClaimChain(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  sourceIndex: number,
  mine: number,
  other: number,
): void {
  let current = faceIndex;
  let source = sourceIndex;
  while (!visited.has(current)) {
    if (!modifierBevelClaimChainFace(context, records, visited, current, source, mine, other)) return;
    const next = modifierBevelNextGenerated(context.derived, records, visited, current);
    if (next === null) return;
    source = current;
    current = next;
  }
}

/**
 * Claims one segment when it still belongs to this end of the strip.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex Segment to claim.
 * @param sourceIndex Face to smear from.
 * @param mine Parent at this end.
 * @param other Parent at the far end, or -1.
 * @returns True when the segment was claimed.
 */
function modifierBevelClaimChainFace(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  sourceIndex: number,
  mine: number,
  other: number,
): boolean {
  if (!modifierBevelFaceKeepsChain(context, faceIndex, mine, other)) return false;
  const sourceRecord = records[sourceIndex];
  if (!sourceRecord) return false;
  modifierBevelStoreChainFace(context, records, faceIndex, sourceIndex, sourceRecord.parentSurfaceIndex);
  visited.add(faceIndex);
  return true;
}

/**
 * Stores one claimed profile segment.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param faceIndex Segment to claim.
 * @param sourceIndex Face to smear from.
 * @param parent Authored parent.
 */
function modifierBevelStoreChainFace(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
  sourceIndex: number,
  parent: number,
): void {
  records[faceIndex] = modifierBevelChamferRecord(context.derived, faceIndex, sourceIndex, parent);
}

/**
 * Returns whether nearest or aligned still wants this end's parent.
 *
 * @param context Choice state.
 * @param faceIndex Segment being claimed.
 * @param mine Parent at this end.
 * @param other Parent at the far end, or -1.
 * @returns True when the segment stays on this chain.
 */
function modifierBevelFaceKeepsChain(
  context: ModifierBevelInheritContext,
  faceIndex: number,
  mine: number,
  other: number,
): boolean {
  if (other < 0 || !modifierBevelChainSplits(context.mode)) return true;
  const kept = { face: faceIndex, parent: mine };
  const far = { face: faceIndex, parent: other };
  return modifierBevelPreferParent(context, faceIndex, kept, far) <= 0;
}

/**
 * Returns whether a flow may split one profile between its two ends.
 *
 * @param mode UV flow.
 * @returns True for nearest and aligned.
 */
function modifierBevelChainSplits(mode: ModifierBevelUvFlow): boolean {
  return mode === MODIFIER_VOLUME_BEVEL_UV_NEAREST || mode === MODIFIER_VOLUME_BEVEL_UV_ALIGNED;
}

/**
 * Finds the authored parent at the other end of a profile.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex Start of this chain.
 * @param mine Parent at this end.
 * @returns Far parent, or -1 when this strip has one end.
 */
function modifierBevelFarChainParent(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  mine: number,
): number {
  let current = faceIndex;
  const seen = new Set<number>([current]);
  for (let guard = 0; guard < 64; guard += 1) {
    const next = modifierBevelNextGenerated(context.derived, records, visited, current);
    if (next === null || seen.has(next)) return -1;
    const preferred = modifierBevelPreferredOriginal(context, records, next);
    if (preferred && preferred.parent !== mine) return preferred.parent;
    seen.add(next);
    current = next;
  }
  return -1;
}

/**
 * Returns the next unclaimed segment along the long profile edges.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex Current segment.
 * @returns Next face, or null at the end of the strip.
 */
function modifierBevelNextGenerated(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
): number | null {
  for (const neighbor of modifierBevelProfileNeighbors(derivedBrush, faceIndex)) {
    if (modifierBevelChainStep(derivedBrush, records, visited, faceIndex, neighbor)) return neighbor;
  }
  return null;
}

const MODIFIER_BEVEL_CHAIN_DOT = Math.cos((25 * Math.PI) / 180);

/**
 * Returns whether a neighbor continues the profile strip.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex Current segment.
 * @param neighbor Candidate neighbor.
 * @returns True when the step stays on the strip.
 */
function modifierBevelChainStep(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  neighbor: number,
): boolean {
  if (records[neighbor] || visited.has(neighbor)) return false;
  if (!modifierBevelFaceIsStrip(derivedBrush, neighbor)) return false;
  return modifierBevelNormalsContinue(derivedBrush, faceIndex, neighbor);
}

/**
 * Returns whether two faces turn by at most 25 degrees.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Current face.
 * @param neighbor Neighbor face.
 * @returns True when the normals stay close.
 */
function modifierBevelNormalsContinue(brush: SolidBrush, faceIndex: number, neighbor: number): boolean {
  const current = brush.planes[faceIndex]?.normal;
  const next = brush.planes[neighbor]?.normal;
  if (!current || !next) return false;
  return current.dot(next) >= MODIFIER_BEVEL_CHAIN_DOT;
}

/**
 * Returns whether a face has a long direction, like a profile strip.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns True when two long edges are nearly parallel.
 */
function modifierBevelFaceIsStrip(brush: SolidBrush, faceIndex: number): boolean {
  const lengths = modifierBevelNeighborFaces(brush, faceIndex).map((neighbor) =>
    modifierBevelSharedEdgeLength(brush, faceIndex, neighbor),
  );
  if (!modifierBevelLengthsAreStrip(lengths)) return false;
  return modifierBevelLongEdgesParallel(brush, faceIndex);
}

/**
 * Returns whether the two longest edges point along the same line.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns True when those edges are nearly parallel.
 */
function modifierBevelLongEdgesParallel(brush: SolidBrush, faceIndex: number): boolean {
  const ranked = modifierBevelFaceEdgeDirections(brush, faceIndex);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second || second.length < first.length * 0.5) return false;
  return Math.abs(first.direction.dot(second.direction)) >= 0.9;
}

/**
 * Lists face edges from longest to shortest.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Edge directions.
 */
function modifierBevelFaceEdgeDirections(
  brush: SolidBrush,
  faceIndex: number,
): { length: number; direction: Vector3 }[] {
  const face = brush.faces[faceIndex];
  if (!face) return [];
  const edges: { length: number; direction: Vector3 }[] = [];
  const last = face.firstEdge + face.edgeCount;
  for (let edgeIndex = face.firstEdge; edgeIndex < last; edgeIndex += 1) {
    const direction = modifierBevelEdgeDirection(brush, edgeIndex);
    if (direction) edges.push(direction);
  }
  edges.sort((left, right) => right.length - left.length);
  return edges;
}

/**
 * Returns the length and unit direction of one wing edge.
 *
 * @param brush Chamfered brush.
 * @param edgeIndex Wing edge index.
 * @returns Direction, or null when the edge is missing.
 */
function modifierBevelEdgeDirection(
  brush: SolidBrush,
  edgeIndex: number,
): { length: number; direction: Vector3 } | null {
  const edge = brush.wingEdges[edgeIndex];
  const twin = edge ? brush.wingEdges[edge.twinIndex] : undefined;
  const pointA = twin ? brush.vertices[twin.vertexIndex] : undefined;
  const pointB = edge ? brush.vertices[edge.vertexIndex] : undefined;
  if (!pointA || !pointB) return null;
  const direction = pointB.clone().sub(pointA);
  const length = direction.length();
  if (length <= 1e-8) return null;
  return { length, direction: direction.multiplyScalar(1 / length) };
}

/**
 * Returns whether edge lengths belong to a strip rather than a cap.
 *
 * @param lengths Shared edge lengths.
 * @returns True when two long edges sit beside a short edge.
 */
function modifierBevelLengthsAreStrip(lengths: readonly number[]): boolean {
  const longest = modifierBevelLongestLength(lengths);
  if (longest <= 1e-8) return false;
  return modifierBevelLongEdgeCount(lengths, longest) >= 2 && modifierBevelHasShortEdge(lengths, longest);
}

/**
 * Returns the longest shared edge.
 *
 * @param lengths Shared edge lengths.
 * @returns Longest length.
 */
function modifierBevelLongestLength(lengths: readonly number[]): number {
  let longest = 0;
  for (const length of lengths) longest = Math.max(longest, length);
  return longest;
}

/**
 * Counts edges that are close to the longest edge.
 *
 * @param lengths Shared edge lengths.
 * @param longest Longest edge.
 * @returns Long-edge count.
 */
function modifierBevelLongEdgeCount(lengths: readonly number[], longest: number): number {
  let count = 0;
  for (const length of lengths) if (length >= longest * 0.5) count += 1;
  return count;
}

/**
 * Returns whether a face has a short edge beside its long edges.
 *
 * @param lengths Shared edge lengths.
 * @param longest Longest edge.
 * @returns True when some edge is at most half the longest.
 */
function modifierBevelHasShortEdge(lengths: readonly number[], longest: number): boolean {
  for (const length of lengths) if (length * 2 <= longest) return true;
  return false;
}

/**
 * Gives any leftover generated face its preferred already-textured neighbor.
 *
 * @param context Choice state.
 * @param records Sparse records.
 */
function modifierBevelAssignRemainders(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
): void {
  while (modifierBevelClaimRemainder(context, records) >= 0) {
    continue;
  }
  modifierBevelUnifyCornerParents(context, records);
}

/**
 * Assigns the lowest leftover face that already touches a textured neighbor.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @returns Assigned face index, or -1 when none are ready.
 */
function modifierBevelClaimRemainder(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
): number {
  for (let faceIndex = 0; faceIndex < records.length; faceIndex += 1) {
    if (records[faceIndex]) continue;
    const source = modifierBevelPreferredAssigned(context, records, faceIndex);
    if (!source) continue;
    records[faceIndex] = modifierBevelAsCorner(
      modifierBevelChamferRecord(context.derived, faceIndex, source.face, source.parent),
    );
    return faceIndex;
  }
  return -1;
}

/**
 * Marks a smear record as a corner cap.
 *
 * @param record Smear record.
 * @returns Corner record.
 */
function modifierBevelAsCorner(record: ModifierBevelFaceRecord): ModifierBevelFaceRecord {
  return {
    parentSurfaceIndex: record.parentSurfaceIndex,
    smearFromDerivedIndex: record.smearFromDerivedIndex,
    chamferEdge: record.chamferEdge,
    cornerFace: true,
  };
}

/**
 * Picks the assigned neighbor preferred by the UV flow.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param faceIndex Face still missing a surface.
 * @returns Neighbor, or null when none are assigned.
 */
function modifierBevelPreferredAssigned(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
): { face: number; parent: number } | null {
  let best: { face: number; parent: number; length: number } | null = null;
  for (const neighbor of modifierBevelNeighborFaces(context.derived, faceIndex)) {
    best = modifierBevelConsiderAssigned(context, records, faceIndex, neighbor, best);
  }
  return best ? { face: best.face, parent: best.parent } : null;
}

/**
 * Keeps the better assigned neighbor.
 *
 * @param context Choice state.
 * @param records Sparse records.
 * @param faceIndex Face still missing a surface.
 * @param neighbor Candidate neighbor.
 * @param best Neighbor chosen so far.
 * @returns Updated choice.
 */
function modifierBevelConsiderAssigned(
  context: ModifierBevelInheritContext,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
  neighbor: number,
  best: { face: number; parent: number; length: number } | null,
): { face: number; parent: number; length: number } | null {
  const record = records[neighbor];
  if (!record) return best;
  const next = modifierBevelAssignedChoice(context.derived, faceIndex, neighbor, record.parentSurfaceIndex);
  if (!best || modifierBevelRemainderPrefers(context.mode, context.scores, best, next, context.space, context.matrix))
    return next;
  return best;
}

/**
 * Measures one assigned neighbor.
 *
 * @param derived Chamfered brush.
 * @param faceIndex Face still missing a surface.
 * @param neighbor Assigned neighbor.
 * @param parent Authored parent of that neighbor.
 * @returns Choice record.
 */
function modifierBevelAssignedChoice(
  derived: SolidBrush,
  faceIndex: number,
  neighbor: number,
  parent: number,
): { face: number; parent: number; length: number } {
  return { face: neighbor, parent, length: modifierBevelSharedEdgeLength(derived, faceIndex, neighbor) };
}

/**
 * Lists neighbors across this face's long edges, ignoring the short end caps.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Neighbor face indices.
 */
function modifierBevelProfileNeighbors(brush: SolidBrush, faceIndex: number): number[] {
  const measured = modifierBevelNeighborFaces(brush, faceIndex).map((neighbor) => ({
    neighbor,
    length: modifierBevelSharedEdgeLength(brush, faceIndex, neighbor),
  }));
  const longest = measured.reduce((best, entry) => Math.max(best, entry.length), 0);
  return measured.filter((entry) => entry.length >= longest * 0.5).map((entry) => entry.neighbor);
}

/**
 * Builds a smear record for a generated face.
 *
 * @param derivedBrush Chamfered brush.
 * @param faceIndex Generated face.
 * @param sourceIndex Face to smear from.
 * @param parentSurfaceIndex Authored face the texture follows.
 * @returns Face record.
 */
function modifierBevelChamferRecord(
  derivedBrush: SolidBrush,
  faceIndex: number,
  sourceIndex: number,
  parentSurfaceIndex: number,
): ModifierBevelFaceRecord {
  const edge = modifierBevelSharedEdge(derivedBrush, faceIndex, sourceIndex);
  const normal = derivedBrush.planes[faceIndex]?.normal.clone();
  return {
    parentSurfaceIndex,
    smearFromDerivedIndex: sourceIndex,
    chamferEdge: edge && normal ? { pointA: edge.pointA, pointB: edge.pointB, destNormal: normal } : null,
    cornerFace: false,
  };
}

/**
 * Builds a record when a generated face never met a matched face.
 *
 * @param parents Authored indices.
 * @param faceIndex Derived face index.
 * @returns Fallback record.
 */
function modifierBevelFallbackRecord(parents: number[]): ModifierBevelFaceRecord {
  const parent = parents.find((value) => value >= 0) ?? 0;
  return { parentSurfaceIndex: parent, smearFromDerivedIndex: -1, chamferEdge: null, cornerFace: false };
}
