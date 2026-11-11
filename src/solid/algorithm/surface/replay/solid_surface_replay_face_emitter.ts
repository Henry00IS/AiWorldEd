import * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidAlgorithmFaceRoutePlan } from '@/solid/algorithm/routing/solid_algorithm_face_route_plan.js';
import { SolidFragmentClassificationMemo } from '@/solid/algorithm/compile/solid_fragment_classification_memo.js';
import type { SolidFragmentFinalizer } from '@/solid/algorithm/compile/solid_fragment_finalizer.js';
import { SOLID_SQR_VERTEX_EQUAL_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import type { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { shouldKeepSurfaceCategory } from '@/solid/types/surface_category.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';
import type {
  SolidSurfaceReplayBrush,
  SolidSurfaceReplayFace,
  SolidSurfaceReplayFragment,
} from './solid_surface_replay_records.js';
import { SolidSurfaceReplayVertexDifference } from './solid_surface_replay_vertex_difference.js';
import {
  SolidSurfaceReplayFaceSplitter,
  type SolidSurfaceReplayCheckpoint,
} from './solid_surface_replay_face_splitter.js';

/** Inputs shared by every face of one subject brush compile. */
export interface SolidSurfaceReplayBrushContext {
  prepared: PreparedBrush[];
  subjectIndex: number;
  subject: PreparedBrush;
  subjectLoops: readonly SolidAlgorithmSurfaceLoop[];
  previous: SolidSurfaceReplayBrush | null;
  changedPeerIndices: readonly number[];
  record: SolidSurfaceReplayBrush;
  vertexTable: HashedVertexTable;
  output: SolidCompiledPolygon[];
}

/** Weld reach used to grow face query bounds, with a safety factor. */
const SOLID_SURFACE_REPLAY_WELD_REACH = Math.sqrt(SOLID_SQR_VERTEX_EQUAL_EPSILON) * 2;

/**
 * Compiles subject faces by splitting and routing them, replaying the previous
 * result of a face whenever its loops, weld neighbourhood, and consulted peers
 * are unchanged so the output is identical to recomputing it.
 */
export class SolidSurfaceReplayFaceEmitter {
  private readonly finalizer: SolidFragmentFinalizer;
  private readonly vertexDifference = new SolidSurfaceReplayVertexDifference();

  /**
   * Creates a face emitter.
   *
   * @param finalizer Fragment finalizer used for routing and polygon building.
   */
  constructor(finalizer: SolidFragmentFinalizer) {
    this.finalizer = finalizer;
  }

  /**
   * Compiles every face of the subject described by the context.
   *
   * @param context Subject compile context.
   */
  compileAllFaces(context: SolidSurfaceReplayBrushContext): void {
    this.vertexDifference.clear();
    const faceCount = context.subject.brush.faces.length;
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
      this.compileOneFace(context, faceIndex);
    }
  }

  /**
   * Compiles one face, replaying it when that is provably identical.
   *
   * @param context Subject compile context.
   * @param faceIndex Face index.
   */
  private compileOneFace(context: SolidSurfaceReplayBrushContext, faceIndex: number): void {
    const facePlane = context.subject.brush.planes[faceIndex];
    if (!facePlane) {
      return;
    }
    const faceLoops = context.subjectLoops.filter((loop) => loop.basePlaneIndex === faceIndex);
    const previousFace = context.previous?.faces[faceIndex];
    const face =
      previousFace && this.faceReplayAllowed(previousFace, faceLoops)
        ? this.replayFace(context, faceIndex, facePlane, previousFace)
        : this.computeFace(context, faceIndex, facePlane, faceLoops, previousFace);
    if (face) {
      context.record.faces[faceIndex] = face;
    }
  }

  /**
   * Returns whether a previous face result may be replayed.
   *
   * @param previousFace Previous face record.
   * @param faceLoops Loops of the face in this compile.
   * @returns True when loops are the same objects and no weld difference is
   *   near.
   */
  private faceReplayAllowed(
    previousFace: SolidSurfaceReplayFace,
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
  ): boolean {
    if (!this.sameLoopObjects(previousFace.loops, faceLoops)) {
      return false;
    }
    if (!this.vertexDifference.intersectsBounds(previousFace.reachBounds)) {
      return true;
    }
    return !this.vertexDifference.touchesQueries(previousFace.weldQueries, SOLID_SURFACE_REPLAY_WELD_REACH);
  }

  /**
   * Returns the index of the first loop that differs between two loop lists, or
   * the shorter length when one is a prefix of the other.
   *
   * @param previousLoops Loops of the previous compile.
   * @param faceLoops Loops of this compile.
   * @returns First differing loop index.
   */
  private firstChangedLoopIndex(
    previousLoops: readonly SolidAlgorithmSurfaceLoop[],
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
  ): number {
    const limit = Math.min(previousLoops.length, faceLoops.length);
    let index = 0;
    while (index < limit && previousLoops[index] === faceLoops[index]) index++;
    return index;
  }

  /**
   * Returns the previous checkpoint of a face when splitting may resume from
   * it: it lies before the first changed loop and none of its weld queries is
   * near a weld-table difference.
   *
   * @param previousFace Previous face record, when one exists.
   * @param checkpointAt First changed loop index, or -1.
   * @returns Usable checkpoint, or null.
   */
  private usableCheckpoint(
    previousFace: SolidSurfaceReplayFace | undefined,
    checkpointAt: number,
  ): SolidSurfaceReplayCheckpoint | null {
    const checkpoint = previousFace?.checkpoint;
    if (!checkpoint || checkpoint.loopCount > checkpointAt) {
      return null;
    }
    const touched = this.vertexDifference.touchesQueries(checkpoint.weldQueries, SOLID_SURFACE_REPLAY_WELD_REACH);
    return touched ? null : checkpoint;
  }

  /**
   * Returns whether two loop lists contain the same loop objects in order.
   *
   * @param first First loop list.
   * @param second Second loop list.
   * @returns True when both lists are element-wise identical.
   */
  private sameLoopObjects(
    first: readonly SolidAlgorithmSurfaceLoop[],
    second: readonly SolidAlgorithmSurfaceLoop[],
  ): boolean {
    if (first.length !== second.length) {
      return false;
    }
    for (let index = 0; index < first.length; index++) {
      if (first[index] !== second[index]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Replays a previous face: re-adds its weld vertices and re-routes only the
   * fragments whose routing inputs changed.
   *
   * @param context Subject compile context.
   * @param faceIndex Face index.
   * @param facePlane Face plane.
   * @param previousFace Previous face record.
   * @returns The reused face record.
   */
  private replayFace(
    context: SolidSurfaceReplayBrushContext,
    faceIndex: number,
    facePlane: SolidPlane,
    previousFace: SolidSurfaceReplayFace,
  ): SolidSurfaceReplayFace {
    context.vertexTable.appendUnwelded(previousFace.insertedVertices);
    const surfaceIndex = this.surfaceIndexOf(context, faceIndex);
    const planHolds = this.planStillHolds(context, previousFace.routePlan);
    if (!planHolds) {
      previousFace.routePlan = this.buildRoutePlan(context, previousFace.routePlan.bounds);
    }
    for (const fragment of previousFace.fragments) {
      this.replayFragment(context, facePlane, surfaceIndex, previousFace, fragment, planHolds);
    }
    return previousFace;
  }

  /**
   * Re-routes one remembered fragment when needed and emits its polygon.
   *
   * @param context Subject compile context.
   * @param facePlane Face plane.
   * @param surfaceIndex Face surface index.
   * @param face Face record owning the fragment.
   * @param fragment Fragment record, updated in place.
   * @param planHolds Whether the plan the fragment was routed with still holds.
   */
  private replayFragment(
    context: SolidSurfaceReplayBrushContext,
    facePlane: SolidPlane,
    surfaceIndex: number,
    face: SolidSurfaceReplayFace,
    fragment: SolidSurfaceReplayFragment,
    planHolds: boolean,
  ): void {
    const routingTable = face.routePlan.table;
    const routingUnchanged =
      planHolds &&
      fragment.routingTable === routingTable &&
      !fragment.classificationMemo.consultedAny(context.changedPeerIndices);
    if (!routingUnchanged) {
      this.rerouteFragment(context, facePlane, surfaceIndex, face, fragment);
    }
    this.emitFragmentPolygon(context, surfaceIndex, fragment);
  }

  /**
   * Routes a remembered fragment again and rebuilds its polygon when the
   * category changed.
   *
   * @param context Subject compile context.
   * @param facePlane Face plane.
   * @param surfaceIndex Face surface index.
   * @param face Face record owning the fragment.
   * @param fragment Fragment record, updated in place.
   */
  private rerouteFragment(
    context: SolidSurfaceReplayBrushContext,
    facePlane: SolidPlane,
    surfaceIndex: number,
    face: SolidSurfaceReplayFace,
    fragment: SolidSurfaceReplayFragment,
  ): void {
    const category = this.finalizer
      .getRouter()
      .routeFragmentWithPlan(
        fragment.vertices,
        facePlane.normal,
        context.prepared,
        face.routePlan,
        fragment.classificationMemo,
      );
    fragment.routingTable = face.routePlan.table;
    if (category !== fragment.category) {
      fragment.category = category;
      fragment.compiled = this.buildPolygonForCategory(context, fragment.vertices, facePlane, surfaceIndex, category);
    }
  }

  /**
   * Pushes the polygon of a fragment, refreshing its texture id.
   *
   * @param context Subject compile context.
   * @param surfaceIndex Face surface index.
   * @param fragment Fragment record.
   */
  private emitFragmentPolygon(
    context: SolidSurfaceReplayBrushContext,
    surfaceIndex: number,
    fragment: SolidSurfaceReplayFragment,
  ): void {
    const compiled = fragment.compiled;
    if (!compiled) {
      return;
    }
    compiled.textureId = context.subject.instance.getSurfaceTextureId(surfaceIndex);
    context.output.push(compiled);
  }

  /**
   * Splits and routes a face from scratch, recording weld changes against the
   * previous result of the face.
   *
   * @param context Subject compile context.
   * @param faceIndex Face index.
   * @param facePlane Face plane.
   * @param faceLoops Loops of the face.
   * @param previousFace Previous face record, when one exists.
   * @returns New face record, or null when the face has no polygon.
   */
  private computeFace(
    context: SolidSurfaceReplayBrushContext,
    faceIndex: number,
    facePlane: SolidPlane,
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
    previousFace: SolidSurfaceReplayFace | undefined,
  ): SolidSurfaceReplayFace | null {
    const face = context.subject.brush.faces[faceIndex];
    if (!face) {
      return null;
    }
    const faceVertices = context.subject.brush.getFaceVertices(face);
    const checkpointAt = previousFace ? this.firstChangedLoopIndex(previousFace.loops, faceLoops) : -1;
    const resumeFrom = this.usableCheckpoint(previousFace, checkpointAt);
    const split = SolidSurfaceReplayFaceSplitter.split(
      faceVertices,
      faceLoops,
      context.vertexTable,
      resumeFrom,
      checkpointAt,
    );
    if (previousFace) {
      this.vertexDifference.recordReplacement(previousFace.insertedVertices, split.insertedVertices);
    }
    const record: SolidSurfaceReplayFace = {
      loops: faceLoops,
      insertedVertices: split.insertedVertices,
      reachBounds: this.faceReachBounds(faceVertices, faceLoops),
      weldQueries: split.weldQueries,
      checkpoint: split.checkpoint,
      routePlan: this.buildRoutePlan(context, this.piecesBounds(split.pieces)),
      fragments: [],
    };
    this.routeNewFragments(context, facePlane, face.surfaceIndex, record, split.pieces, previousFace);
    return record;
  }

  /**
   * Routes split fragments and emits the kept ones. A fragment that is the same
   * polygon object as a fragment of the previous face result keeps its routing
   * state and is only re-routed when its routing inputs changed.
   *
   * @param context Subject compile context.
   * @param facePlane Face plane.
   * @param surfaceIndex Face surface index.
   * @param record Face record receiving fragment records.
   * @param pieces Split fragments.
   * @param previousFace Previous face record, when one exists.
   */
  private routeNewFragments(
    context: SolidSurfaceReplayBrushContext,
    facePlane: SolidPlane,
    surfaceIndex: number,
    record: SolidSurfaceReplayFace,
    pieces: readonly THREE.Vector3[][],
    previousFace: SolidSurfaceReplayFace | undefined,
  ): void {
    const previousByVertices = this.reusableFragments(previousFace);
    const planHolds = previousFace ? this.planStillHolds(context, previousFace.routePlan) : false;
    for (const vertices of pieces) {
      const previous = previousByVertices?.get(vertices);
      if (previous) {
        record.fragments.push(previous);
        this.replayFragment(context, facePlane, surfaceIndex, record, previous, planHolds);
      } else {
        this.routeFreshFragment(context, facePlane, surfaceIndex, record, vertices);
      }
    }
  }

  /**
   * Indexes the previous fragments of a face by polygon object.
   *
   * @param previousFace Previous face record, when one exists.
   * @returns Previous fragments by polygon, or null without a previous face.
   */
  private reusableFragments(
    previousFace: SolidSurfaceReplayFace | undefined,
  ): Map<THREE.Vector3[], SolidSurfaceReplayFragment> | null {
    if (!previousFace) {
      return null;
    }
    return new Map(previousFace.fragments.map((fragment) => [fragment.vertices, fragment]));
  }

  /**
   * Returns whether a previous face plan still describes every changed peer of
   * this compile.
   *
   * @param context Subject compile context.
   * @param plan Previous face plan.
   * @returns True when routes made with the plan stay valid.
   */
  private planStillHolds(context: SolidSurfaceReplayBrushContext, plan: SolidAlgorithmFaceRoutePlan): boolean {
    const table = this.finalizer.getRouter().resolveTable(context.prepared, context.subjectIndex);
    return plan.constantsStillHold(table, context.prepared, context.changedPeerIndices);
  }

  /**
   * Builds the routing plan of a face for this compile.
   *
   * @param context Subject compile context.
   * @param bounds Bounds of every fragment vertex of the face.
   * @returns Face routing plan.
   */
  private buildRoutePlan(context: SolidSurfaceReplayBrushContext, bounds: THREE.Box3): SolidAlgorithmFaceRoutePlan {
    const table = this.finalizer.getRouter().resolveTable(context.prepared, context.subjectIndex);
    return new SolidAlgorithmFaceRoutePlan(table, context.prepared, context.subjectIndex, bounds);
  }

  /**
   * Returns the bounds of every vertex of a fragment list.
   *
   * @param pieces Fragments.
   * @returns Bounds, empty when there are no vertices.
   */
  private piecesBounds(pieces: readonly THREE.Vector3[][]): THREE.Box3 {
    const bounds = new THREE.Box3();
    for (const piece of pieces) {
      for (const vertex of piece) bounds.expandByPoint(vertex);
    }
    return bounds;
  }

  /**
   * Routes one new fragment, records it, and emits its polygon when kept.
   *
   * @param context Subject compile context.
   * @param facePlane Face plane.
   * @param surfaceIndex Face surface index.
   * @param record Face record receiving the fragment record.
   * @param vertices Fragment polygon.
   */
  private routeFreshFragment(
    context: SolidSurfaceReplayBrushContext,
    facePlane: SolidPlane,
    surfaceIndex: number,
    record: SolidSurfaceReplayFace,
    vertices: THREE.Vector3[],
  ): void {
    const classificationMemo = new SolidFragmentClassificationMemo();
    const category = this.finalizer
      .getRouter()
      .routeFragmentWithPlan(vertices, facePlane.normal, context.prepared, record.routePlan, classificationMemo);
    classificationMemo.seal();
    const routingTable = record.routePlan.table;
    const compiled = this.buildPolygonForCategory(context, vertices, facePlane, surfaceIndex, category);
    record.fragments.push({ vertices, classificationMemo, routingTable, category, compiled });
    if (compiled) {
      context.output.push(compiled);
    }
  }

  /**
   * Builds the emitted polygon of a fragment when its category is kept.
   *
   * @param context Subject compile context.
   * @param vertices Fragment polygon.
   * @param facePlane Face plane.
   * @param surfaceIndex Face surface index.
   * @param category Routed category.
   * @returns Emitted polygon, or null when the category is discarded.
   */
  private buildPolygonForCategory(
    context: SolidSurfaceReplayBrushContext,
    vertices: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    category: SolidSurfaceReplayFragment['category'],
  ): SolidCompiledPolygon | null {
    if (!shouldKeepSurfaceCategory(category)) {
      return null;
    }
    return this.finalizer.buildCompiledPolygon(vertices, facePlane, surfaceIndex, context.subject, category);
  }

  /**
   * Returns the surface index of a subject face.
   *
   * @param context Subject compile context.
   * @param faceIndex Face index.
   * @returns Surface index, or zero when the face is missing.
   */
  private surfaceIndexOf(context: SolidSurfaceReplayBrushContext, faceIndex: number): number {
    return context.subject.brush.faces[faceIndex]?.surfaceIndex ?? 0;
  }

  /**
   * Computes bounds that contain every weld query a face can make, grown by the
   * weld reach.
   *
   * @param faceVertices Face polygon.
   * @param faceLoops Loops of the face.
   * @returns Grown bounds.
   */
  private faceReachBounds(
    faceVertices: readonly THREE.Vector3[],
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
  ): THREE.Box3 {
    const bounds = new THREE.Box3();
    for (const vertex of faceVertices) {
      bounds.expandByPoint(vertex);
    }
    for (const loop of faceLoops) {
      for (const vertex of loop.loopVertices) {
        bounds.expandByPoint(vertex);
      }
    }
    return bounds.expandByScalar(SOLID_SURFACE_REPLAY_WELD_REACH);
  }
}
