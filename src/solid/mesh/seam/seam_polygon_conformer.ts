import * as THREE from 'three';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SeamEdgeCornerCollector } from './seam_edge_corner_collector.js';
import { SeamPolygonTriangulator } from './seam_polygon_triangulator.js';

/** Outline and triangle order of one polygon after corner insertion. */
export interface SeamConformedOutline {
  /** Polygon vertices with the inserted corners in place. */
  vertices: THREE.Vector3[];
  /** Flat local triangle corner indices into vertices. */
  triangleCorners: number[];
}

/**
 * Inserts the corners other polygons have on a polygon's edges into its outline
 * and triangulates the result, so neighbouring triangles share every vertex
 * along a seam.
 */
export class SeamPolygonConformer {
  private readonly triangulator = new SeamPolygonTriangulator();

  /**
   * Creates a conformer reading corners through a collector.
   *
   * @param collector Finds corners lying inside an edge.
   */
  constructor(private readonly collector: SeamEdgeCornerCollector) {}

  /**
   * Conforms every polygon of one brush.
   *
   * @param polygons Brush polygons.
   * @returns One entry per polygon: null when nothing was inserted.
   */
  conformBrush(polygons: readonly SolidCompiledPolygon[]): Array<SeamConformedOutline | null> {
    const outlines: Array<SeamConformedOutline | null> = [];
    for (const polygon of polygons) outlines.push(this.conformPolygon(polygon.vertices));
    return outlines;
  }

  /**
   * Conforms one outline.
   *
   * @param vertices Polygon vertices.
   * @returns Conformed outline, or null when no edge gained a corner.
   */
  conformPolygon(vertices: readonly THREE.Vector3[]): SeamConformedOutline | null {
    if (vertices.length < 3) return null;
    let conformed: THREE.Vector3[] | null = null;
    for (let index = 0; index < vertices.length; index++) {
      const start = vertices[index]!;
      const corners = this.collector.collect(start, vertices[(index + 1) % vertices.length]!, vertices);
      if (corners.length === 0 && !conformed) continue;
      conformed ??= vertices.slice(0, index);
      conformed.push(start, ...corners);
    }
    if (!conformed || !this.triangulator.outlineHasArea(vertices)) return null;
    return { vertices: conformed, triangleCorners: this.triangulator.triangulate(conformed) };
  }
}

/**
 * Whether two conform results of one brush insert exactly the same corners.
 *
 * @param previous Earlier result.
 * @param next New result.
 * @returns True when both are equal vertex for vertex.
 */
export function seamOutlinesEqual(
  previous: ReadonlyArray<SeamConformedOutline | null> | undefined,
  next: ReadonlyArray<SeamConformedOutline | null>,
): boolean {
  if (!previous || previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index++) {
    if (!seamOutlineEqual(previous[index]!, next[index]!)) return false;
  }
  return true;
}

/**
 * Whether two single polygon conform results are equal.
 *
 * @param left First result.
 * @param right Second result.
 * @returns True when both are null or have identical vertices.
 */
function seamOutlineEqual(left: SeamConformedOutline | null, right: SeamConformedOutline | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.vertices.length !== right.vertices.length) return false;
  for (let index = 0; index < left.vertices.length; index++) {
    if (!left.vertices[index]!.equals(right.vertices[index]!)) return false;
  }
  return true;
}
