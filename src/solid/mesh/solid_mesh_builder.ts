import * as THREE from 'three';
import { SolidCompiledPolygon } from '../algorithm/solid_csg_compiler.js';
import { SurfaceTriangulator } from '../algorithm/surface_triangulator.js';
import { createContentMaterial } from '../../materials/content_material_factory.js';
import {
  DECORATIVE_EDGE_USERDATA_KEY,
  enableFlatShadingOnMesh
} from '../../utils/mesh_edge_sync.js';
import { Theme } from '../../theme.js';

/**
 * Builds Three.js meshes from compiled solid surface polygons.
 */
export class SolidMeshBuilder {
  /**
   * Creates a render mesh from compiled solid polygons.
   * @param polygons Compiled surface polygons.
   * @param name Mesh name.
   * @param color Optional mesh color.
   * @returns Mesh, or null when there is no geometry.
   */
  static buildMesh(
    polygons: SolidCompiledPolygon[],
    name: string,
    color: number = Theme.boxColor
  ): THREE.Mesh | null {
    if (polygons.length === 0) return null;
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    if (arrays.triangleCount === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(arrays.positions, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(arrays.normals, 3)
    );
    const material = createContentMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    enableFlatShadingOnMesh(mesh);
    this.attachWireframe(mesh);
    return mesh;
  }

  /**
   * Creates a wireframe-only preview mesh for a single brush hull.
   * @param points Unique vertices of the brush hull.
   * @param edgePairs Pairs of vertex indices forming edges.
   * @param name Mesh name.
   * @param color Line color.
   * @returns LineSegments preview object.
   */
  static buildBrushWireframe(
    points: THREE.Vector3[],
    edgePairs: Array<[number, number]>,
    name: string,
    color: number
  ): THREE.LineSegments {
    const positions: number[] = [];
    for (const [a, b] of edgePairs) {
      const pa = points[a];
      const pb = points[b];
      positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const material = new THREE.LineBasicMaterial({
      color,
      depthTest: true
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = name;
    lines.userData.isSolidBrushPreview = true;
    return lines;
  }

  /**
   * Attaches decorative edge wireframe to a content mesh.
   * @param mesh Target mesh.
   */
  private static attachWireframe(mesh: THREE.Mesh): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: Theme.boxEdgeColor,
      depthTest: true
    });
    const lineSegments = new THREE.LineSegments(edges, lineMaterial);
    lineSegments.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    mesh.add(lineSegments);
  }
}
