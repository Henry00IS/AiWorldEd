import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';

/**
 * Classification of a vertex relative to a clipping plane.
 */
const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

/**
 * Clips polygons against planes for CSG boolean operations.
 */
export class CsgClipper {
  private epsilon: number;

  /**
   * Creates a clipper with a coplanar epsilon tolerance.
   * @param epsilon Distance treated as on-plane.
   */
  constructor(epsilon: number = 1e-5) {
    this.epsilon = epsilon;
  }

  /**
   * Clips a list of polygons by a clipping plane, keeping the front side.
   * @param polygons The polygons to clip.
   * @param planeNormal The clipping plane normal.
   * @param planeConstant The clipping plane constant.
   * @returns Polygons remaining on the front side of the plane.
   */
  clipPolygonsToFront(
    polygons: CsgPolygon[],
    planeNormal: THREE.Vector3,
    planeConstant: number
  ): CsgPolygon[] {
    const result: CsgPolygon[] = [];
    polygons.forEach((polygon) => {
      this.clipPolygonToFront(polygon, planeNormal, planeConstant, result);
    });
    return result;
  }

  /**
   * Clips a single polygon, appending front fragments into the result list.
   * @param polygon The polygon to clip.
   * @param planeNormal The clipping plane normal.
   * @param planeConstant The clipping plane constant.
   * @param result Accumulator for front polygons.
   */
  private clipPolygonToFront(
    polygon: CsgPolygon,
    planeNormal: THREE.Vector3,
    planeConstant: number,
    result: CsgPolygon[]
  ): void {
    const vertices = polygon.getVertices();
    const types = this.classifyVertices(vertices, planeNormal, planeConstant);
    const polygonType = this.combineVertexTypes(types);
    if (polygonType === COPLANAR || polygonType === FRONT) {
      result.push(polygon.clone());
      return;
    }
    if (polygonType === BACK) {
      return;
    }
    const frontVertices = this.buildSplitVertices(
      vertices,
      types,
      planeNormal,
      planeConstant
    );
    if (frontVertices.length >= 3) {
      result.push(
        new CsgPolygon(frontVertices, polygon.getSurfaceMapping())
      );
    }
  }

  /**
   * Classifies each vertex relative to a plane.
   * @param vertices The vertices to classify.
   * @param planeNormal The plane normal.
   * @param planeConstant The plane constant.
   * @returns Per-vertex classification codes.
   */
  private classifyVertices(
    vertices: THREE.Vector3[],
    planeNormal: THREE.Vector3,
    planeConstant: number
  ): number[] {
    return vertices.map((vertex) => {
      const distance = planeNormal.dot(vertex) - planeConstant;
      if (distance > this.epsilon) return FRONT;
      if (distance < -this.epsilon) return BACK;
      return COPLANAR;
    });
  }

  /**
   * Combines vertex classifications into a polygon classification.
   * @param types Per-vertex classification codes.
   * @returns Combined polygon classification.
   */
  private combineVertexTypes(types: number[]): number {
    let polygonType = 0;
    types.forEach((type) => {
      polygonType |= type;
    });
    return polygonType;
  }

  /**
   * Builds the front-side vertices for a spanning polygon.
   * @param vertices Original polygon vertices.
   * @param types Per-vertex classifications.
   * @param planeNormal Clipping plane normal.
   * @param planeConstant Clipping plane constant.
   * @returns Front-side vertex list.
   */
  private buildSplitVertices(
    vertices: THREE.Vector3[],
    types: number[],
    planeNormal: THREE.Vector3,
    planeConstant: number
  ): THREE.Vector3[] {
    const frontVertices: THREE.Vector3[] = [];
    for (let index = 0; index < vertices.length; index++) {
      const nextIndex = (index + 1) % vertices.length;
      const type = types[index];
      const nextType = types[nextIndex];
      const vertex = vertices[index];
      const nextVertex = vertices[nextIndex];
      if (type !== BACK) {
        frontVertices.push(vertex.clone());
      }
      if ((type | nextType) === SPANNING) {
        const intersection = this.intersectEdge(
          vertex,
          nextVertex,
          planeNormal,
          planeConstant
        );
        frontVertices.push(intersection);
      }
    }
    return frontVertices;
  }

  /**
   * Intersects an edge with a plane.
   * @param start Edge start vertex.
   * @param end Edge end vertex.
   * @param planeNormal Plane normal.
   * @param planeConstant Plane constant.
   * @returns The intersection point.
   */
  private intersectEdge(
    start: THREE.Vector3,
    end: THREE.Vector3,
    planeNormal: THREE.Vector3,
    planeConstant: number
  ): THREE.Vector3 {
    const startDistance = planeNormal.dot(start) - planeConstant;
    const endDistance = planeNormal.dot(end) - planeConstant;
    const t = startDistance / (startDistance - endDistance);
    return start.clone().lerp(end, t);
  }
}
