import * as THREE from 'three';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/** A finalized surface polygon produced by solid CSG compilation. */
export interface SolidCompiledPolygon {
  /** Ordered vertices in model space. */
  vertices: THREE.Vector3[];
  /** Outward (or cavity) normal after category resolution. */
  normal: THREE.Vector3;
  /** Surface index from the originating brush face. */
  surfaceIndex: number;
  /** Originating brush instance id. */
  brushId: string;
  /** Texture authored on the originating brush (baked into the result). */
  textureId: string;
  /** Final surface category (aligned or reverse-aligned). */
  category: SurfaceCategory;
  /**
   * Local triangle corner indices (three per triangle) to use instead of a fan
   * from the first vertex, set when seam corners were inserted.
   */
  triangleCorners?: readonly number[];
}
