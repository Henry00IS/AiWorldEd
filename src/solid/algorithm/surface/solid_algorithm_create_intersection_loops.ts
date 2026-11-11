import type * as THREE from 'three';
import { SolidAlgorithmBrushPairMemo } from '@/solid/algorithm/routing/solid_algorithm_brush_pair_memo.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import type { SolidAlgorithmBrushPairIntersection } from './solid_algorithm_brush_pair_intersection_info.js';
import { SolidAlgorithmCreateIntersectionLoopsFindInside } from './solid_algorithm_create_intersection_loops_find_inside.js';
import { SolidAlgorithmCreateIntersectionLoopsFindIntersection } from './solid_algorithm_create_intersection_loops_find_intersection.js';
import { SolidAlgorithmCreateIntersectionLoopsGenerate } from './solid_algorithm_create_intersection_loops_generate.js';
import type { SolidAlgorithmPlaneVertexIndexPair } from './solid_algorithm_plane_vertex_index_pair.js';
import { SolidAlgorithmPrepareBrushPair } from './solid_algorithm_prepare_brush_pair.js';
import type { SolidAlgorithmSurfaceLoop } from './solid_algorithm_surface_loop.js';

/** Epsilon settings that a pair loop computation depends on. */
interface SolidAlgorithmPairLoopSettings {
  boundsPad: number;
  membershipEpsilon: number;
  fatPlaneEpsilon: number;
}

/** Stored subject-owned loops of one ordered brush pair. */
interface SolidAlgorithmPairLoopMemoEntry {
  subjectIndex: number;
  peerIndex: number;
  subjectBounds: THREE.Box3;
  peerBounds: THREE.Box3;
  settings: SolidAlgorithmPairLoopSettings;
  subjectLoops: readonly SolidAlgorithmSurfaceLoop[];
}

/** Builds bounded surface intersection loops for Intersection pairs. */
export class SolidAlgorithmCreateIntersectionLoops {
  private static readonly pairLoopMemo = new SolidAlgorithmBrushPairMemo<SolidAlgorithmPairLoopMemoEntry>();

  /**
   * Creates all intersection loops for one subject against its peers.
   *
   * @param prepared All prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param peerIndices Peers to pair with the subject (typically Intersection).
   * @param boundsPad Bounds pad for pair classification.
   * @param membershipEpsilon Membership epsilon for pair classification.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns All loops where the subject owns the base face (indexOrder0).
   */
  static createForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndices: readonly number[],
    boundsPad: number = SOLID_BOUNDS_EPSILON,
    membershipEpsilon: number = SOLID_FAT_PLANE_EPSILON,
    fatPlaneEpsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidAlgorithmSurfaceLoop[] {
    const output: SolidAlgorithmSurfaceLoop[] = [];
    for (const peerIndex of peerIndices) {
      if (peerIndex === subjectIndex) {
        continue;
      }
      this.appendPairLoops(prepared, subjectIndex, peerIndex, boundsPad, membershipEpsilon, fatPlaneEpsilon, output);
    }
    return output;
  }

  /**
   * Prepares and executes one brush pair, appending subject-owned loops.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @param peerIndex Peer index.
   * @param boundsPad Bounds pad.
   * @param membershipEpsilon Membership epsilon.
   * @param fatPlaneEpsilon Fat-plane width.
   * @param output Loop accumulator.
   */
  private static appendPairLoops(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndex: number,
    boundsPad: number,
    membershipEpsilon: number,
    fatPlaneEpsilon: number,
    output: SolidAlgorithmSurfaceLoop[],
  ): void {
    const subject = prepared[subjectIndex];
    const peer = prepared[peerIndex];
    if (!subject || !peer) {
      return;
    }
    const settings: SolidAlgorithmPairLoopSettings = { boundsPad, membershipEpsilon, fatPlaneEpsilon };
    const remembered = this.pairLoopMemo.get(subject.brush, peer.brush);
    if (remembered && this.pairLoopEntryMatches(remembered, subject, subjectIndex, peer, peerIndex, settings)) {
      this.appendAll(remembered.subjectLoops, output);
      return;
    }
    const subjectLoops = this.computeSubjectPairLoops(prepared, subjectIndex, peerIndex, settings);
    this.pairLoopMemo.set(subject.brush, peer.brush, {
      subjectIndex,
      peerIndex,
      subjectBounds: subject.bounds,
      peerBounds: peer.bounds,
      settings,
      subjectLoops,
    });
    this.appendAll(subjectLoops, output);
  }

  /**
   * Returns whether a stored pair entry was computed for exactly this pair
   * placement, bounds, and epsilon settings.
   *
   * @param entry Stored pair entry.
   * @param subject Subject prepared brush.
   * @param subjectIndex Subject prepared index.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer prepared index.
   * @param settings Epsilon settings of this request.
   * @returns True when the stored loops can be reused verbatim.
   */
  private static pairLoopEntryMatches(
    entry: SolidAlgorithmPairLoopMemoEntry,
    subject: PreparedBrush,
    subjectIndex: number,
    peer: PreparedBrush,
    peerIndex: number,
    settings: SolidAlgorithmPairLoopSettings,
  ): boolean {
    return (
      entry.subjectIndex === subjectIndex &&
      entry.peerIndex === peerIndex &&
      entry.subjectBounds === subject.bounds &&
      entry.peerBounds === peer.bounds &&
      entry.settings.boundsPad === settings.boundsPad &&
      entry.settings.membershipEpsilon === settings.membershipEpsilon &&
      entry.settings.fatPlaneEpsilon === settings.fatPlaneEpsilon
    );
  }

  /**
   * Appends every loop of a list to the output.
   *
   * @param loops Loops to append.
   * @param output Loop accumulator.
   */
  private static appendAll(loops: readonly SolidAlgorithmSurfaceLoop[], output: SolidAlgorithmSurfaceLoop[]): void {
    for (const loop of loops) {
      output.push(loop);
    }
  }

  /**
   * Computes the subject-owned loops of one pair from scratch.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @param peerIndex Peer index.
   * @param settings Epsilon settings.
   * @returns Loops whose base face belongs to the subject.
   */
  private static computeSubjectPairLoops(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndex: number,
    settings: SolidAlgorithmPairLoopSettings,
  ): SolidAlgorithmSurfaceLoop[] {
    const subject = prepared[subjectIndex];
    const peer = prepared[peerIndex];
    const subjectLoops: SolidAlgorithmSurfaceLoop[] = [];
    if (!subject || !peer || this.boundsNearlyEqual(subject.bounds, peer.bounds, settings.fatPlaneEpsilon)) {
      return subjectLoops;
    }
    const pair = SolidAlgorithmPrepareBrushPair.prepare(
      prepared,
      subjectIndex,
      peerIndex,
      settings.boundsPad,
      settings.membershipEpsilon,
      settings.fatPlaneEpsilon,
    );
    if (!pair || pair.type !== SolidAlgorithmIntersectionType.Intersection) {
      return subjectLoops;
    }
    for (const loop of this.executePair(prepared, pair)) {
      if (loop.subjectBrushIndex === subjectIndex) {
        subjectLoops.push(loop);
      }
    }
    return subjectLoops;
  }

  /**
   * Returns whether two AABBs match within epsilon (co-located identical shells
   * need no geometric surface loops; routing handles category only).
   *
   * @param a First bounds.
   * @param b Second bounds.
   * @param epsilon Max corner delta.
   * @returns True when bounds are nearly equal.
   */
  private static boundsNearlyEqual(
    a: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
    b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
    epsilon: number,
  ): boolean {
    return (
      Math.abs(a.min.x - b.min.x) <= epsilon &&
      Math.abs(a.min.y - b.min.y) <= epsilon &&
      Math.abs(a.min.z - b.min.z) <= epsilon &&
      Math.abs(a.max.x - b.max.x) <= epsilon &&
      Math.abs(a.max.y - b.max.y) <= epsilon &&
      Math.abs(a.max.z - b.max.z) <= epsilon
    );
  }

  /**
   * Executes CreateIntersectionLoops for one prepared pair.
   *
   * @param prepared Prepared brushes (for tree-space planes / vertices).
   * @param pair Prepared pair intersection.
   * @returns Loops for both sides of the pair.
   */
  static executePair(
    prepared: readonly PreparedBrush[],
    pair: SolidAlgorithmBrushPairIntersection,
  ): SolidAlgorithmSurfaceLoop[] {
    const foundIndices0: SolidAlgorithmPlaneVertexIndexPair[] = [];
    const foundIndices1: SolidAlgorithmPlaneVertexIndexPair[] = [];
    const hashedTreeSpaceVertices = new HashedVertexTable();
    const snapHashedVertices = this.buildSnapTable(prepared, pair);
    this.findAllIntersectionVertices(pair, hashedTreeSpaceVertices, snapHashedVertices, foundIndices0, foundIndices1);
    this.findAllInsideVertices(pair, hashedTreeSpaceVertices, snapHashedVertices, foundIndices0, foundIndices1);
    return this.generateBothSides(prepared, pair, foundIndices0, foundIndices1, hashedTreeSpaceVertices);
  }

  /**
   * Preloads snap table with both brushes' vertices (lower node order first).
   *
   * @param prepared Prepared brushes.
   * @param pair Pair data.
   * @returns Snap welder.
   */
  private static buildSnapTable(
    prepared: readonly PreparedBrush[],
    pair: SolidAlgorithmBrushPairIntersection,
  ): HashedVertexTable {
    const snap = new HashedVertexTable();
    const first = pair.brush0.brushIndex < pair.brush1.brushIndex ? pair.brush0.brushIndex : pair.brush1.brushIndex;
    const second = pair.brush0.brushIndex < pair.brush1.brushIndex ? pair.brush1.brushIndex : pair.brush0.brushIndex;
    this.addBrushVertices(snap, prepared[first]);
    this.addBrushVertices(snap, prepared[second]);
    return snap;
  }

  /**
   * Adds all vertices of a prepared brush into a welder.
   *
   * @param table Vertex table.
   * @param prepared Prepared brush, if present.
   */
  private static addBrushVertices(table: HashedVertexTable, prepared: PreparedBrush | undefined): void {
    if (!prepared) {
      return;
    }
    for (const vertex of prepared.brush.vertices) {
      table.add(vertex);
    }
  }

  /**
   * Runs FindIntersectionVertices for both plane-pair directions.
   *
   * @param pair Pair data.
   * @param hashedTreeSpaceVertices Output welder.
   * @param snapHashedVertices Snap welder.
   * @param foundIndices0 Brush0 pairs.
   * @param foundIndices1 Brush1 pairs.
   */
  private static findAllIntersectionVertices(
    pair: SolidAlgorithmBrushPairIntersection,
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
    foundIndices1: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    if (pair.type !== SolidAlgorithmIntersectionType.Intersection) {
      return;
    }
    if (pair.brush1.usedPlanePairs.length > 0) {
      SolidAlgorithmCreateIntersectionLoopsFindIntersection.find(
        pair.brush0.localSpacePlanes,
        pair.brush0.localSpacePlanesLength,
        pair.brush0.localSpacePlanes.length,
        pair.brush1.localSpacePlanes,
        pair.brush1.localSpacePlanesLength,
        pair.brush1.localSpacePlanes.length,
        pair.brush1.usedPlanePairs,
        pair.brush0.localSpacePlaneIndices,
        hashedTreeSpaceVertices,
        snapHashedVertices,
        foundIndices0,
        foundIndices1,
      );
    }
    if (pair.brush0.usedPlanePairs.length > 0) {
      SolidAlgorithmCreateIntersectionLoopsFindIntersection.find(
        pair.brush1.localSpacePlanes,
        pair.brush1.localSpacePlanesLength,
        pair.brush1.localSpacePlanes.length,
        pair.brush0.localSpacePlanes,
        pair.brush0.localSpacePlanesLength,
        pair.brush0.localSpacePlanes.length,
        pair.brush0.usedPlanePairs,
        pair.brush1.localSpacePlaneIndices,
        hashedTreeSpaceVertices,
        snapHashedVertices,
        foundIndices1,
        foundIndices0,
      );
    }
  }

  /**
   * Runs FindInsideVertices for both brushes when intersections were found.
   *
   * @param pair Pair data.
   * @param hashedTreeSpaceVertices Output welder.
   * @param snapHashedVertices Snap welder.
   * @param foundIndices0 Brush0 pairs.
   * @param foundIndices1 Brush1 pairs.
   */
  private static findAllInsideVertices(
    pair: SolidAlgorithmBrushPairIntersection,
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
    foundIndices1: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    if (foundIndices0.length > 0 && pair.brush0.usedVertices.length > 0) {
      SolidAlgorithmCreateIntersectionLoopsFindInside.find(
        pair.brush0.usedVertices,
        pair.brush0.vertexIntersectionPlanes,
        pair.brush0.vertexIntersectionSegments,
        pair.brush1.localSpacePlanes,
        pair.brush1.localSpacePlanes.length,
        hashedTreeSpaceVertices,
        snapHashedVertices,
        foundIndices0,
      );
    }
    if (foundIndices1.length > 0 && pair.brush1.usedVertices.length > 0) {
      SolidAlgorithmCreateIntersectionLoopsFindInside.find(
        pair.brush1.usedVertices,
        pair.brush1.vertexIntersectionPlanes,
        pair.brush1.vertexIntersectionSegments,
        pair.brush0.localSpacePlanes,
        pair.brush0.localSpacePlanes.length,
        hashedTreeSpaceVertices,
        snapHashedVertices,
        foundIndices1,
      );
    }
  }

  /**
   * Generates loops for both sides when enough vertices exist.
   *
   * @param prepared Prepared brushes.
   * @param pair Pair data.
   * @param foundIndices0 Brush0 pairs.
   * @param foundIndices1 Brush1 pairs.
   * @param hashedTreeSpaceVertices Vertex table.
   * @returns All generated loops.
   */
  private static generateBothSides(
    prepared: readonly PreparedBrush[],
    pair: SolidAlgorithmBrushPairIntersection,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
    foundIndices1: SolidAlgorithmPlaneVertexIndexPair[],
    hashedTreeSpaceVertices: HashedVertexTable,
  ): SolidAlgorithmSurfaceLoop[] {
    const output: SolidAlgorithmSurfaceLoop[] = [];
    const brush0 = prepared[pair.brush0.brushIndex];
    const brush1 = prepared[pair.brush1.brushIndex];
    if (foundIndices0.length >= 3 && brush0) {
      SolidAlgorithmCreateIntersectionLoopsGenerate.generate(
        pair.brush0.brushIndex,
        pair.brush1.brushIndex,
        false,
        pair.brush0.surfaceInfos,
        brush0.brush.planes,
        foundIndices0,
        hashedTreeSpaceVertices,
        output,
      );
    }
    if (foundIndices1.length >= 3 && brush1) {
      SolidAlgorithmCreateIntersectionLoopsGenerate.generate(
        pair.brush1.brushIndex,
        pair.brush0.brushIndex,
        false,
        pair.brush1.surfaceInfos,
        brush1.brush.planes,
        foundIndices1,
        hashedTreeSpaceVertices,
        output,
      );
    }
    return output;
  }
}
