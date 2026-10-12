import type { Vector3 } from 'three';

/** How one derived face picks up an authored surface. */
export interface ModifierBevelFaceRecord {
  /** Authored face index the texture and selection follow. */
  parentSurfaceIndex: number;
  /** Derived face whose surface is smeared across the shared edge, or -1. */
  smearFromDerivedIndex: number;
  /** Set when this face is a generated chamfer strip. */
  chamferEdge: {
    pointA: Vector3;
    pointB: Vector3;
    destNormal: Vector3;
  } | null;
}
