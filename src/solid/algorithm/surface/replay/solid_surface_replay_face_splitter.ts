import type * as THREE from 'three';
import type { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmLoopFaceSplitter } from '@/solid/algorithm/surface/solid_algorithm_loop_face_splitter.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';

/** Split state of a face after its first loops, used to resume splitting. */
export interface SolidSurfaceReplayCheckpoint {
  /** Number of leading loops already applied. */
  loopCount: number;
  /** Fragments after those loops (never mutated). */
  fragments: readonly THREE.Vector3[][];
  /** Vertices the face added to the weld table up to this point, in order. */
  insertedVertices: readonly THREE.Vector3[];
  /** Stored vertex every weld query up to this point resolved to. */
  weldQueries: readonly THREE.Vector3[];
}

/** Result of splitting one face, with the weld bookkeeping replay needs. */
export interface SolidSurfaceReplaySplit {
  /** Final fragments with at least three vertices. */
  pieces: THREE.Vector3[][];
  /** Vertices the face added to the weld table, in order. */
  insertedVertices: THREE.Vector3[];
  /** Stored vertex every weld query of the face resolved to. */
  weldQueries: THREE.Vector3[];
  /** Snapshot taken before the requested loop, or null. */
  checkpoint: SolidSurfaceReplayCheckpoint | null;
}

/** Mutable state threaded through one checkpointed split. */
interface SolidSurfaceReplaySplitState {
  fragments: THREE.Vector3[][];
  weldQueries: THREE.Vector3[];
  firstVertexIndex: number;
  checkpoint: SolidSurfaceReplayCheckpoint | null;
}

/**
 * Splits a face by its loops exactly like the plain loop splitter while
 * optionally resuming from a checkpoint of an earlier compile and recording a
 * new checkpoint before a chosen loop.
 */
export class SolidSurfaceReplayFaceSplitter {
  /**
   * Splits a face by its loops.
   *
   * @param faceVertices Ordered face polygon.
   * @param faceLoops Loops of the face, in split order.
   * @param vertexTable Subject weld table shared across faces.
   * @param resumeFrom Checkpoint whose leading loops equal this face's, whose
   *   weld queries are unaffected by table differences, or null.
   * @param checkpointAt Loop index to snapshot before, or -1 for none.
   * @returns Fragments and weld bookkeeping.
   */
  static split(
    faceVertices: readonly THREE.Vector3[],
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
    vertexTable: HashedVertexTable,
    resumeFrom: SolidSurfaceReplayCheckpoint | null,
    checkpointAt: number,
  ): SolidSurfaceReplaySplit {
    if (faceVertices.length < 3) {
      return { pieces: [], insertedVertices: [], weldQueries: [], checkpoint: null };
    }
    const state = this.startState(faceVertices, vertexTable, resumeFrom);
    vertexTable.setQueryLog(state.weldQueries);
    for (let loopIndex = resumeFrom?.loopCount ?? 0; loopIndex <= faceLoops.length; loopIndex++) {
      if (loopIndex === checkpointAt) this.snapshot(state, loopIndex, vertexTable, resumeFrom);
      const loop = faceLoops[loopIndex];
      if (loop) this.applyLoop(state, loop, vertexTable);
    }
    vertexTable.setQueryLog(null);
    return {
      pieces: state.fragments.filter((fragment) => fragment.length >= 3),
      insertedVertices: vertexTable.verticesFrom(state.firstVertexIndex),
      weldQueries: state.weldQueries,
      checkpoint: state.checkpoint,
    };
  }

  /**
   * Builds the starting state, either from a checkpoint (re-adding its weld
   * vertices) or from the welded face polygon.
   *
   * @param faceVertices Ordered face polygon.
   * @param vertexTable Subject weld table.
   * @param resumeFrom Checkpoint to resume from, or null.
   * @returns Initial split state.
   */
  private static startState(
    faceVertices: readonly THREE.Vector3[],
    vertexTable: HashedVertexTable,
    resumeFrom: SolidSurfaceReplayCheckpoint | null,
  ): SolidSurfaceReplaySplitState {
    const firstVertexIndex = vertexTable.count;
    if (resumeFrom) {
      vertexTable.appendUnwelded(resumeFrom.insertedVertices);
      return {
        fragments: resumeFrom.fragments.slice(),
        weldQueries: resumeFrom.weldQueries.slice(),
        firstVertexIndex,
        checkpoint: null,
      };
    }
    const weldQueries: THREE.Vector3[] = [];
    vertexTable.setQueryLog(weldQueries);
    const seed = SolidAlgorithmLoopFaceSplitter.weldPolygon(faceVertices, vertexTable);
    return { fragments: [seed], weldQueries, firstVertexIndex, checkpoint: null };
  }

  /**
   * Splits the current fragments by one loop, skipping degenerate loops.
   *
   * @param state Split state, updated in place.
   * @param loop Loop to apply.
   * @param vertexTable Subject weld table.
   */
  private static applyLoop(
    state: SolidSurfaceReplaySplitState,
    loop: SolidAlgorithmSurfaceLoop,
    vertexTable: HashedVertexTable,
  ): void {
    if (loop.loopVertices.length < 3) {
      return;
    }
    const weldedLoop = SolidAlgorithmLoopFaceSplitter.weldPolygon(loop.loopVertices, vertexTable);
    state.fragments = SolidAlgorithmLoopFaceSplitter.splitFragmentsByOneLoop(state.fragments, weldedLoop, vertexTable);
  }

  /**
   * Records the checkpoint before a loop, reusing the resumed checkpoint when
   * it describes the same point.
   *
   * @param state Split state, updated in place.
   * @param loopCount Number of loops applied so far.
   * @param vertexTable Subject weld table.
   * @param resumeFrom Checkpoint the split resumed from, or null.
   */
  private static snapshot(
    state: SolidSurfaceReplaySplitState,
    loopCount: number,
    vertexTable: HashedVertexTable,
    resumeFrom: SolidSurfaceReplayCheckpoint | null,
  ): void {
    if (resumeFrom && resumeFrom.loopCount === loopCount) {
      state.checkpoint = resumeFrom;
      return;
    }
    state.checkpoint = {
      loopCount,
      fragments: state.fragments.slice(),
      insertedVertices: vertexTable.verticesFrom(state.firstVertexIndex),
      weldQueries: state.weldQueries.slice(),
    };
  }
}
