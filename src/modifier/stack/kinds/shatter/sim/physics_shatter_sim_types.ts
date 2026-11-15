import type * as THREE from 'three';
import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import type { PhysicsShatterBlastSettings } from '@/modifier/stack/kinds/shatter/physics_shatter_settings.js';
import type { PhysicsShatterPieceTransform } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

/** What the simulation needs of one piece. */
export type PhysicsShatterSimPiece = Pick<PhysicsShatterPiece, 'index' | 'hull' | 'centroid' | 'isBrick'>;

/** Everything one simulation starts from. */
export interface PhysicsShatterSimSetup {
  /** Pieces in the modifier frame, in bake order. */
  pieces: readonly PhysicsShatterSimPiece[];
  /** Modifier frame to world matrix. */
  frameToWorld: THREE.Matrix4;
  /** Blast settings in the modifier frame. */
  blast: PhysicsShatterBlastSettings;
  /** Fracture seed, which also seeds the blast spin. */
  seed: number;
  /** Fixed world geometry the pieces land on, as flat world-space hull points. */
  staticHulls: readonly Float32Array[];
  /** World height of the top of an endless floor, or null for none. */
  floorHeight: number | null;
}

/** Outcome of one simulation. */
export interface PhysicsShatterSimResult {
  /** Transform per piece in the modifier frame; identity for stuck pieces. */
  transforms: PhysicsShatterPieceTransform[];
  /** True per piece that stayed where it was cut. */
  stuck: boolean[];
  /** Fixed steps taken. */
  steps: number;
}
