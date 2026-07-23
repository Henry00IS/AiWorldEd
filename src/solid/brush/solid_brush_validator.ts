import { SolidBrush } from './solid_brush.js';
import { SOLID_FAT_PLANE_EPSILON } from '../algorithm/solid_math_constants.js';

/**
 * Validation result for a solid brush manifold.
 */
export interface SolidBrushValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates wing-edge topology and convexity assumptions for a solid brush.
 */
export class SolidBrushValidator {
  /**
   * Validates topology, twin links, plane coverage, and vertex half-spaces.
   * @param brush Brush to validate.
   * @returns Validation result with zero or more error messages.
   */
  static validate(brush: SolidBrush): SolidBrushValidation {
    const errors: string[] = [];
    this.checkArrayConsistency(brush, errors);
    if (errors.length > 0) return { valid: false, errors };
    this.checkTwinPairs(brush, errors);
    this.checkFaceRanges(brush, errors);
    this.checkVertexInsidePlanes(brush, errors);
    this.checkMinimumFaceSize(brush, errors);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Ensures core arrays have matching lengths and non-empty topology.
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkArrayConsistency(
    brush: SolidBrush,
    errors: string[]
  ): void {
    if (brush.vertices.length < 4) {
      errors.push('Brush must have at least 4 vertices');
    }
    if (brush.faces.length < 4) {
      errors.push('Brush must have at least 4 faces');
    }
    if (brush.wingEdges.length !== brush.edgeFaceIndices.length) {
      errors.push('Wing edge count must match edge-face index count');
    }
    if (brush.planes.length !== brush.faces.length) {
      errors.push('Plane count must match face count');
    }
  }

  /**
   * Ensures every wing edge has a mutual twin.
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkTwinPairs(brush: SolidBrush, errors: string[]): void {
    for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
      const twinIndex = brush.wingEdges[edgeIndex].twinIndex;
      if (twinIndex < 0 || twinIndex >= brush.wingEdges.length) {
        errors.push(`Edge ${edgeIndex} has invalid twin index`);
        continue;
      }
      if (brush.wingEdges[twinIndex].twinIndex !== edgeIndex) {
        errors.push(`Edge ${edgeIndex} twin is not mutual`);
      }
      if (twinIndex === edgeIndex) {
        errors.push(`Edge ${edgeIndex} is twin of itself`);
      }
    }
  }

  /**
   * Ensures face edge ranges stay within the wing-edge array.
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkFaceRanges(brush: SolidBrush, errors: string[]): void {
    for (let faceIndex = 0; faceIndex < brush.faces.length; faceIndex++) {
      const face = brush.faces[faceIndex];
      if (face.edgeCount < 3) {
        errors.push(`Face ${faceIndex} has fewer than 3 edges`);
      }
      const last = face.firstEdge + face.edgeCount;
      if (face.firstEdge < 0 || last > brush.wingEdges.length) {
        errors.push(`Face ${faceIndex} edge range is out of bounds`);
      }
    }
  }

  /**
   * Ensures every vertex lies on the inside of every face plane (convex solid).
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkVertexInsidePlanes(
    brush: SolidBrush,
    errors: string[]
  ): void {
    for (let vertexIndex = 0; vertexIndex < brush.vertices.length; vertexIndex++) {
      const vertex = brush.vertices[vertexIndex];
      for (let planeIndex = 0; planeIndex < brush.planes.length; planeIndex++) {
        const distance = brush.planes[planeIndex].signedDistance(vertex);
        if (distance > SOLID_FAT_PLANE_EPSILON) {
          errors.push(
            `Vertex ${vertexIndex} is outside plane ${planeIndex}`
          );
        }
      }
    }
  }

  /**
   * Ensures faces are at least triangles.
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkMinimumFaceSize(
    brush: SolidBrush,
    errors: string[]
  ): void {
    for (const face of brush.faces) {
      if (face.edgeCount < 3) {
        errors.push('Face edge count must be at least 3');
      }
    }
  }
}
