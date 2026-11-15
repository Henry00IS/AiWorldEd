import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/** Measured worst case of a brush against Henry's CSG bounds. */
export interface BlastHoleBrushQuality {
  /** Shortest edge. */
  minEdge: number;
  /** Smallest distance between a face plane and the farthest vertex. */
  thickness: number;
  /** Smallest corner angle of any face, in degrees. */
  minAngle: number;
  /** Smallest face area. */
  minFaceArea: number;
}

/**
 * Measures a convex brush: edges, thickness, corner angles and face areas.
 *
 * @param brush Convex brush.
 * @returns Its worst values.
 */
export function blastHoleBrushQuality(brush: SolidBrush): BlastHoleBrushQuality {
  const quality = { minEdge: Infinity, thickness: Infinity, minAngle: Infinity, minFaceArea: Infinity };
  brush.faces.forEach((face, index) => {
    const loop = brush.getFaceVertices(face);
    const normal = brush.planes[index]?.normal ?? new THREE.Vector3();
    const depth = Math.max(...brush.vertices.map((vertex) => loop[0]!.clone().sub(vertex).dot(normal)));
    quality.thickness = Math.min(quality.thickness, Math.abs(depth));
    let area = 0;
    loop.forEach((point, at) => {
      const next = loop[(at + 1) % loop.length]!;
      const previous = loop[(at + loop.length - 1) % loop.length]!;
      quality.minEdge = Math.min(quality.minEdge, point.distanceTo(next));
      const angle = next.clone().sub(point).angleTo(previous.clone().sub(point));
      quality.minAngle = Math.min(quality.minAngle, THREE.MathUtils.radToDeg(angle));
      area += point.clone().sub(loop[0]!).cross(next.clone().sub(loop[0]!)).length() / 2;
    });
    quality.minFaceArea = Math.min(quality.minFaceArea, area);
  });
  return quality;
}
