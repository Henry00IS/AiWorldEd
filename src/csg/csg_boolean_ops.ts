import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';
import { CsgMeshBuilder } from './csg_mesh_builder.js';
import { CsgBspNode } from './csg_bsp_node.js';

/**
 * Supported CSG boolean operation kinds.
 */
export enum CsgOperation {
  UNION = 'union',
  SUBTRACT = 'subtract',
  INTERSECT = 'intersect'
}

/**
 * Performs BSP-based CSG boolean operations on mesh pairs.
 * Suitable for brush-style level design solids.
 */
export class CsgBooleanOps {
  private meshBuilder: CsgMeshBuilder;

  /**
   * Creates a new CSG boolean operator.
   */
  constructor() {
    this.meshBuilder = new CsgMeshBuilder();
  }

  /**
   * Executes a boolean operation between two meshes.
   * @param meshA The primary mesh (kept for subtract).
   * @param meshB The secondary mesh (cutter for subtract).
   * @param operation The boolean operation to apply.
   * @param resultName The name for the resulting mesh.
   * @returns The resulting mesh, or null if empty.
   */
  operate(
    meshA: THREE.Mesh,
    meshB: THREE.Mesh,
    operation: CsgOperation,
    resultName: string
  ): THREE.Mesh | null {
    meshA.updateMatrixWorld(true);
    meshB.updateMatrixWorld(true);
    const polygonsA = this.meshBuilder.meshToPolygons(meshA);
    const polygonsB = this.meshBuilder.meshToPolygons(meshB);
    if (polygonsA.length === 0 || polygonsB.length === 0) return null;
    const resultPolygons = this.computeResultPolygons(
      polygonsA,
      polygonsB,
      operation
    );
    if (resultPolygons.length === 0) return null;
    const color = this.extractMeshColor(meshA);
    return this.meshBuilder.polygonsToMesh(resultPolygons, color, resultName);
  }

  /**
   * Computes the polygon soup for a boolean operation using BSP trees.
   * @param polygonsA Polygons from mesh A.
   * @param polygonsB Polygons from mesh B.
   * @param operation The boolean operation.
   * @returns Resulting polygons.
   */
  private computeResultPolygons(
    polygonsA: CsgPolygon[],
    polygonsB: CsgPolygon[],
    operation: CsgOperation
  ): CsgPolygon[] {
    const a = new CsgBspNode(polygonsA.map((polygon) => polygon.clone()));
    const b = new CsgBspNode(polygonsB.map((polygon) => polygon.clone()));
    if (operation === CsgOperation.UNION) {
      return this.computeUnion(a, b);
    }
    if (operation === CsgOperation.SUBTRACT) {
      return this.computeSubtract(a, b);
    }
    return this.computeIntersect(a, b);
  }

  /**
   * Computes A ∪ B.
   * @param a BSP for mesh A.
   * @param b BSP for mesh B.
   * @returns Union polygons.
   */
  private computeUnion(a: CsgBspNode, b: CsgBspNode): CsgPolygon[] {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return a.allPolygons();
  }

  /**
   * Computes A − B.
   * @param a BSP for mesh A.
   * @param b BSP for mesh B.
   * @returns Difference polygons.
   */
  private computeSubtract(a: CsgBspNode, b: CsgBspNode): CsgPolygon[] {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return a.allPolygons();
  }

  /**
   * Computes A ∩ B.
   * @param a BSP for mesh A.
   * @param b BSP for mesh B.
   * @returns Intersection polygons.
   */
  private computeIntersect(a: CsgBspNode, b: CsgBspNode): CsgPolygon[] {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return a.allPolygons();
  }

  /**
   * Extracts a mesh material color hex value.
   * @param mesh The mesh to inspect.
   * @returns The color hex, or white when unavailable.
   */
  private extractMeshColor(mesh: THREE.Mesh): number {
    const material = mesh.material;
    if (material && !Array.isArray(material) && 'color' in material) {
      const color = (material as THREE.MeshStandardMaterial).color;
      if (color) return color.getHex();
    }
    return 0xffffff;
  }
}
