import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';

/**
 * Vertex classification codes for plane splitting.
 */
const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

/**
 * Binary space partitioning node used for CSG boolean operations.
 * Adapted from the classic open-source CSG.js algorithm for convex brush work.
 */
export class CsgBspNode {
  private planeNormal: THREE.Vector3 | null;
  private planeConstant: number;
  private front: CsgBspNode | null;
  private back: CsgBspNode | null;
  private polygons: CsgPolygon[];
  private epsilon: number;

  /**
   * Creates a BSP node optionally built from polygons.
   * @param polygons Optional initial polygons for this subtree.
   * @param epsilon Plane thickness epsilon.
   */
  constructor(polygons: CsgPolygon[] = [], epsilon: number = 1e-5) {
    this.planeNormal = null;
    this.planeConstant = 0;
    this.front = null;
    this.back = null;
    this.polygons = [];
    this.epsilon = epsilon;
    if (polygons.length > 0) {
      this.build(polygons);
    }
  }

  /**
   * Returns a deep clone of this BSP subtree.
   * @returns A cloned BSP node.
   */
  clone(): CsgBspNode {
    const node = new CsgBspNode([], this.epsilon);
    if (this.planeNormal) {
      node.planeNormal = this.planeNormal.clone();
      node.planeConstant = this.planeConstant;
    }
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map((polygon) => polygon.clone());
    return node;
  }

  /**
   * Inverts the solid by flipping all planes and polygons and swapping sides.
   */
  invert(): void {
    this.polygons.forEach((polygon) => polygon.flip());
    if (this.planeNormal) {
      this.planeNormal.negate();
      this.planeConstant = -this.planeConstant;
    }
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const swap = this.front;
    this.front = this.back;
    this.back = swap;
  }

  /**
   * Recursively removes all polygons in this solid that are inside the other solid.
   * @param bsp The clipping BSP solid.
   */
  clipTo(bsp: CsgBspNode): void {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }

  /**
   * Collects all polygons in this BSP tree.
   * @returns All polygons stored in the tree.
   */
  allPolygons(): CsgPolygon[] {
    let list = this.polygons.slice();
    if (this.front) list = list.concat(this.front.allPolygons());
    if (this.back) list = list.concat(this.back.allPolygons());
    return list;
  }

  /**
   * Builds this node from a list of polygons.
   * @param polygons The polygons to insert.
   */
  build(polygons: CsgPolygon[]): void {
    if (polygons.length === 0) return;
    if (!this.planeNormal) {
      const first = polygons[0];
      this.planeNormal = first.getPlaneNormal().clone();
      this.planeConstant = first.getPlaneConstant();
    }
    const frontList: CsgPolygon[] = [];
    const backList: CsgPolygon[] = [];
    polygons.forEach((polygon) => {
      this.splitPolygon(
        polygon,
        this.polygons,
        this.polygons,
        frontList,
        backList
      );
    });
    if (frontList.length > 0) {
      if (!this.front) this.front = new CsgBspNode([], this.epsilon);
      this.front.build(frontList);
    }
    if (backList.length > 0) {
      if (!this.back) this.back = new CsgBspNode([], this.epsilon);
      this.back.build(backList);
    }
  }

  /**
   * Clips a list of polygons against this BSP solid, keeping exterior pieces.
   * @param polygons The polygons to clip.
   * @returns Polygons remaining outside this solid.
   */
  clipPolygons(polygons: CsgPolygon[]): CsgPolygon[] {
    if (!this.planeNormal) return polygons.slice();
    const frontList: CsgPolygon[] = [];
    const backList: CsgPolygon[] = [];
    polygons.forEach((polygon) => {
      this.splitPolygon(polygon, frontList, backList, frontList, backList);
    });
    const clippedFront = this.front
      ? this.front.clipPolygons(frontList)
      : frontList;
    const clippedBack = this.back ? this.back.clipPolygons(backList) : [];
    return clippedFront.concat(clippedBack);
  }

  /**
   * Splits a polygon by this node's plane into coplanar/front/back lists.
   * @param polygon The polygon to split.
   * @param coplanarFront Destination for coplanar front-facing polygons.
   * @param coplanarBack Destination for coplanar back-facing polygons.
   * @param front Destination for front fragments.
   * @param back Destination for back fragments.
   */
  private splitPolygon(
    polygon: CsgPolygon,
    coplanarFront: CsgPolygon[],
    coplanarBack: CsgPolygon[],
    front: CsgPolygon[],
    back: CsgPolygon[]
  ): void {
    if (!this.planeNormal) return;
    const vertices = polygon.getVertices();
    const types = vertices.map((vertex) => {
      const distance = this.planeNormal!.dot(vertex) - this.planeConstant;
      if (distance > this.epsilon) return FRONT;
      if (distance < -this.epsilon) return BACK;
      return COPLANAR;
    });
    let polygonType = 0;
    types.forEach((type) => {
      polygonType |= type;
    });
    if (polygonType === COPLANAR) {
      if (this.planeNormal.dot(polygon.getPlaneNormal()) > 0) {
        coplanarFront.push(polygon);
      } else {
        coplanarBack.push(polygon);
      }
      return;
    }
    if (polygonType === FRONT) {
      front.push(polygon);
      return;
    }
    if (polygonType === BACK) {
      back.push(polygon);
      return;
    }
    this.pushSpanningFragments(polygon, types, front, back);
  }

  /**
   * Splits a spanning polygon into front and back fragments.
   * @param polygon The spanning polygon.
   * @param types Per-vertex classifications.
   * @param front Front fragment destination.
   * @param back Back fragment destination.
   */
  private pushSpanningFragments(
    polygon: CsgPolygon,
    types: number[],
    front: CsgPolygon[],
    back: CsgPolygon[]
  ): void {
    const vertices = polygon.getVertices();
    const frontVertices: THREE.Vector3[] = [];
    const backVertices: THREE.Vector3[] = [];
    for (let index = 0; index < vertices.length; index++) {
      const nextIndex = (index + 1) % vertices.length;
      const type = types[index];
      const nextType = types[nextIndex];
      const vertex = vertices[index];
      const nextVertex = vertices[nextIndex];
      if (type !== BACK) frontVertices.push(vertex.clone());
      if (type !== FRONT) backVertices.push(vertex.clone());
      if ((type | nextType) === SPANNING) {
        const intersection = this.intersectEdge(vertex, nextVertex);
        frontVertices.push(intersection.clone());
        backVertices.push(intersection.clone());
      }
    }
    const surface = polygon.getSurfaceMapping();
    if (frontVertices.length >= 3) {
      front.push(new CsgPolygon(frontVertices, surface));
    }
    if (backVertices.length >= 3) {
      back.push(new CsgPolygon(backVertices, surface));
    }
  }

  /**
   * Intersects an edge with this node's plane.
   * @param start Edge start.
   * @param end Edge end.
   * @returns Intersection point.
   */
  private intersectEdge(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3 {
    const startDistance = this.planeNormal!.dot(start) - this.planeConstant;
    const endDistance = this.planeNormal!.dot(end) - this.planeConstant;
    const t = startDistance / (startDistance - endDistance);
    return start.clone().lerp(end, t);
  }
}
