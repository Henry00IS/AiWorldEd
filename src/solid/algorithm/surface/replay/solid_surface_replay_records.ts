import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SurfaceCategory } from '@/solid/types/surface_category.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import type { SolidFragmentClassificationMemo } from '@/solid/algorithm/compile/solid_fragment_classification_memo.js';
import type { SolidAlgorithmFaceRoutePlan } from '@/solid/algorithm/routing/solid_algorithm_face_route_plan.js';
import type { SolidAlgorithmRoutingTable } from '@/solid/algorithm/routing/solid_algorithm_routing_table.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';
import type { SolidSurfaceReplayCheckpoint } from './solid_surface_replay_face_splitter.js';

/** One face fragment together with how it was routed last time. */
export interface SolidSurfaceReplayFragment {
  /** Welded fragment polygon produced by loop splitting. */
  vertices: THREE.Vector3[];
  /** Peer classifications of the fragment centroid. */
  classificationMemo: SolidFragmentClassificationMemo;
  /** Routing table the category was produced with. */
  routingTable: SolidAlgorithmRoutingTable;
  /** Routed category. */
  category: SurfaceCategory;
  /** Emitted polygon, or null when the category is discarded. */
  compiled: SolidCompiledPolygon | null;
}

/** Everything needed to replay one compiled face of a subject brush. */
export interface SolidSurfaceReplayFace {
  /** Loops the face was split by, in split order. */
  loops: readonly SolidAlgorithmSurfaceLoop[];
  /** Vertices this face added to the subject weld table, in order. */
  insertedVertices: readonly THREE.Vector3[];
  /** Bounds of every weld query of this face, grown by the weld reach. */
  reachBounds: THREE.Box3;
  /** Stored vertex every weld query of the face resolved to. */
  weldQueries: readonly THREE.Vector3[];
  /** Split state before the first loop that changed in this compile, or null. */
  checkpoint: SolidSurfaceReplayCheckpoint | null;
  /** Routing plan the fragments were last routed with. */
  routePlan: SolidAlgorithmFaceRoutePlan;
  /** Fragments with their routing state. */
  fragments: SolidSurfaceReplayFragment[];
}

/** Replay state of one compiled subject brush. */
export interface SolidSurfaceReplayBrush {
  /** Subject geometry the record was built from. */
  geometry: SolidBrush;
  /** Prepared index of the subject when the record was built. */
  subjectIndex: number;
  /** Geometry of each overlapping peer, keyed by prepared index. */
  peerGeometryByIndex: Map<number, SolidBrush>;
  /** Per-face replay state, indexed by face index. */
  faces: SolidSurfaceReplayFace[];
}
