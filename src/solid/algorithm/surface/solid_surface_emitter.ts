import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidFragmentFinalizer } from '@/solid/algorithm/compile/solid_fragment_finalizer.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SolidAlgorithmRoutingPeers } from '@/solid/algorithm/routing/solid_algorithm_routing_peers.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmCreateIntersectionLoops } from './solid_algorithm_create_intersection_loops.js';
import { SolidSurfaceReplayFaceEmitter } from './replay/solid_surface_replay_face_emitter.js';
import { SolidSurfaceReplayStore } from './replay/solid_surface_replay_store.js';
import type { SolidAlgorithmSurfaceLoop } from './solid_algorithm_surface_loop.js';

/**
 * Emits compiled surface polygons by cutting faces with bounded intersection
 * loops, then finalizing fragments through the routing table.
 */
export class SolidSurfaceEmitter {
  private readonly finalizer: SolidFragmentFinalizer;
  private readonly membershipEpsilon: number;
  private invertedWorld = false;
  private hierarchicalCsg = false;
  private readonly brushVertexTable = new HashedVertexTable();
  private readonly replayStore = new SolidSurfaceReplayStore();
  private readonly replayFaceEmitter: SolidSurfaceReplayFaceEmitter;

  /**
   * Creates a surface emitter.
   *
   * @param finalizer Fragment finalizer for classification and polygon build.
   * @param membershipEpsilon Fat-plane epsilon for pair preparation.
   */
  constructor(finalizer: SolidFragmentFinalizer, membershipEpsilon: number) {
    this.finalizer = finalizer;
    this.membershipEpsilon = membershipEpsilon;
    this.replayFaceEmitter = new SolidSurfaceReplayFaceEmitter(finalizer);
  }

  /**
   * Kept for call-site compatibility.
   *
   * @param _value Unused.
   */
  setHasIntersectingOperations(_value: boolean): void {
    void _value;
  }

  /**
   * Sets inverted-world mode for isolated surface emission.
   *
   * @param value True when the world begins full.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Sets whether hierarchical branch/leaf CSG is active.
   *
   * @param value True when the CSG tree is not flat.
   */
  setHierarchicalCsg(value: boolean): void {
    this.hierarchicalCsg = value;
  }

  /**
   * Compiles all faces of one brush into the output list.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the subject brush.
   * @param output Accumulator for compiled polygons.
   */
  compileBrushSurfaces(prepared: PreparedBrush[], brushIndex: number, output: SolidCompiledPolygon[]): void {
    const subject = prepared[brushIndex];
    if (!subject) {
      return;
    }
    if (subject.overlappingPeerIndices.length === 0) {
      this.emitIsolatedBrushSurfaces(subject, prepared, brushIndex, output);
      return;
    }
    this.brushVertexTable.clear();
    const intersectionPeers = this.collectIntersectionPeerIndices(prepared, brushIndex);
    const subjectLoops = SolidAlgorithmCreateIntersectionLoops.createForSubject(
      prepared,
      brushIndex,
      intersectionPeers,
      SOLID_BOUNDS_EPSILON,
      this.membershipEpsilon,
      SOLID_FAT_PLANE_EPSILON,
    );
    this.compileFacesWithReplay(prepared, brushIndex, subject, subjectLoops, output);
  }

  /**
   * Compiles every face of an overlapping subject through the replaying face
   * emitter and stores the new replay record.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Subject index.
   * @param subject Subject prepared brush.
   * @param subjectLoops All subject-owned intersection loops.
   * @param output Polygon accumulator.
   */
  private compileFacesWithReplay(
    prepared: PreparedBrush[],
    brushIndex: number,
    subject: PreparedBrush,
    subjectLoops: readonly SolidAlgorithmSurfaceLoop[],
    output: SolidCompiledPolygon[],
  ): void {
    const record = SolidSurfaceReplayStore.createRecord(prepared, brushIndex);
    if (!record) {
      return;
    }
    const previous = this.replayStore.matching(subject, brushIndex);
    const changedPeerIndices = previous ? SolidSurfaceReplayStore.changedPeerIndices(previous, record) : [];
    this.replayFaceEmitter.compileAllFaces({
      prepared,
      subjectIndex: brushIndex,
      subject,
      subjectLoops,
      previous,
      changedPeerIndices,
      record,
      vertexTable: this.brushVertexTable,
      output,
    });
    this.replayStore.store(subject.instance.id, record);
  }

  /** Forgets every face replay record. */
  clearReplayRecords(): void {
    this.replayStore.clear();
  }

  /**
   * Drops face replay records of brushes that are no longer compiled.
   *
   * @param keptBrushIds Brush ids that remain.
   */
  pruneReplayRecords(keptBrushIds: ReadonlySet<string>): void {
    this.replayStore.pruneToIds(keptBrushIds);
  }

  /**
   * Collects peer indices classified as Intersection for loop creation.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Intersection peer indices.
   */
  private collectIntersectionPeerIndices(prepared: readonly PreparedBrush[], subjectIndex: number): number[] {
    const subject = prepared[subjectIndex];
    if (!subject) {
      return [];
    }
    const peers: number[] = [];
    for (const peerIndex of subject.overlappingPeerIndices) {
      if (!SolidAlgorithmRoutingPeers.peerBelongsInSubjectTable(prepared, subjectIndex, peerIndex)) {
        continue;
      }
      const type = SolidAlgorithmBrushIntersection.classify(
        subject,
        peerIndex,
        prepared,
        SOLID_BOUNDS_EPSILON,
        this.membershipEpsilon,
      );
      if (type === SolidAlgorithmIntersectionType.Intersection) {
        peers.push(peerIndex);
      }
    }
    return peers;
  }

  /**
   * Fast path for a brush that does not overlap any peer volume.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes.
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  emitIsolatedBrushSurfaces(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    if (!this.invertedWorld && this.operationContributesNoIsolatedSolid(subject.operation)) {
      return;
    }
    if (!this.invertedWorld && !this.hierarchicalCsg) {
      if (subject.operation === SolidOperation.Additive) {
        this.emitIsolatedAdditiveSurfacesDirect(subject, output);
      }
      return;
    }
    this.emitIsolatedSurfacesWithMembership(subject, prepared, brushIndex, output);
  }

  /**
   * Returns whether an operation emits no solid when isolated.
   *
   * @param operation Brush CSG operation.
   * @returns True for subtractive and intersecting.
   */
  private operationContributesNoIsolatedSolid(operation: SolidOperation): boolean {
    return operation === SolidOperation.Subtractive || operation === SolidOperation.Intersecting;
  }

  /**
   * Emits isolated faces using full membership classification.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes.
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  emitIsolatedSurfacesWithMembership(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex];
      const facePlane = subject.brush.planes[faceIndex];
      if (!face || !facePlane) {
        continue;
      }
      const compiled = this.finalizer.finalizeFragment(
        subject.brush.getFaceVertices(face),
        facePlane,
        face.surfaceIndex,
        subject,
        prepared,
        brushIndex,
      );
      if (compiled) {
        output.push(compiled);
      }
    }
  }

  /**
   * Emits exterior faces of an isolated additive brush without membership
   * tests.
   *
   * @param subject Isolated additive brush.
   * @param output Polygon accumulator.
   */
  emitIsolatedAdditiveSurfacesDirect(subject: PreparedBrush, output: SolidCompiledPolygon[]): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      this.emitOneIsolatedAdditiveFace(subject, faceIndex, output);
    }
  }

  /**
   * Emits one isolated additive face when it has enough vertices.
   *
   * @param subject Isolated additive brush.
   * @param faceIndex Face index.
   * @param output Polygon accumulator.
   */
  private emitOneIsolatedAdditiveFace(subject: PreparedBrush, faceIndex: number, output: SolidCompiledPolygon[]): void {
    const face = subject.brush.faces[faceIndex];
    const facePlane = subject.brush.planes[faceIndex];
    if (!face || !facePlane) {
      return;
    }
    const faceVertices = subject.brush.getFaceVertices(face);
    if (faceVertices.length < 3) {
      return;
    }
    output.push({
      vertices: faceVertices,
      normal: facePlane.normal.clone(),
      surfaceIndex: face.surfaceIndex,
      brushId: subject.instance.id,
      textureId: subject.instance.getSurfaceTextureId(face.surfaceIndex),
      category: SurfaceCategory.SelfAligned,
    });
  }
}
