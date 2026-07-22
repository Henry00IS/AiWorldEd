import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';
import { CsgMeshBuilder } from './csg_mesh_builder.js';
import { CsgClipper } from './csg_clipper.js';
import { buildPlaneCapPolygon } from './csg_plane_cap.js';
import { planeToCsgForm } from './csg_plane_from_points.js';
import { rebuildDecorativeEdges } from '../utils/mesh_edge_sync.js';

/**
 * Result of splitting a mesh by a plane into two capped solids.
 */
export interface PlaneSplitResult {
  frontMesh: THREE.Mesh;
  backMesh: THREE.Mesh;
}

/**
 * Clips and splits convex brush meshes by an infinite plane, always capping
 * the cut so results stay closed solids.
 */
export class CsgPlaneSplit {
  private meshBuilder: CsgMeshBuilder;
  private clipper: CsgClipper;
  private resultCounter: number;

  /**
   * Creates a plane-split operator.
   */
  constructor() {
    this.meshBuilder = new CsgMeshBuilder();
    this.clipper = new CsgClipper();
    this.resultCounter = 0;
  }

  /**
   * Keeps one half of the mesh on the positive or negative side of the plane.
   * @param mesh Source mesh to clip.
   * @param plane Cutting plane (Three.js form).
   * @param keepFront When true, keeps the CSG front half-space (n·x > c).
   * @param resultName Optional mesh name.
   * @returns A new capped mesh, or null when the keep side is empty.
   */
  clipMeshToPlane(
    mesh: THREE.Mesh,
    plane: THREE.Plane,
    keepFront: boolean,
    resultName?: string
  ): THREE.Mesh | null {
    mesh.updateMatrixWorld(true);
    const sourcePolygons = this.meshBuilder.meshToPolygons(mesh);
    if (sourcePolygons.length === 0) return null;
    const capped = this.buildCappedHalf(
      sourcePolygons,
      plane,
      keepFront
    );
    if (!capped) return null;
    const name = resultName ?? this.nextName('Clip');
    return this.buildResultMesh(capped, mesh, name);
  }

  /**
   * Clips source polygons to one half-space and appends a closing cap.
   * @param sourcePolygons World-space source polygons.
   * @param plane Cutting plane.
   * @param keepFront Whether to keep the CSG front half-space.
   * @returns Capped polygons, or null when empty.
   */
  private buildCappedHalf(
    sourcePolygons: CsgPolygon[],
    plane: THREE.Plane,
    keepFront: boolean
  ): CsgPolygon[] | null {
    const csgPlane = planeToCsgForm(plane);
    const clipped = this.clipPolygonsToSide(
      sourcePolygons,
      csgPlane.normal,
      csgPlane.constant,
      keepFront
    );
    if (clipped.length === 0) return null;
    const outwardNormal = keepFront
      ? csgPlane.normal.clone().negate()
      : csgPlane.normal.clone();
    return this.appendCapIfPossible(
      clipped,
      sourcePolygons,
      csgPlane.normal,
      csgPlane.constant,
      outwardNormal
    );
  }

  /**
   * Splits a mesh into two capped solids on opposite sides of the plane.
   * @param mesh Source mesh to split.
   * @param plane Cutting plane (Three.js form).
   * @param frontName Optional name for the front piece.
   * @param backName Optional name for the back piece.
   * @returns Both meshes, or null when either side is empty.
   */
  splitMeshByPlane(
    mesh: THREE.Mesh,
    plane: THREE.Plane,
    frontName?: string,
    backName?: string
  ): PlaneSplitResult | null {
    const frontMesh = this.clipMeshToPlane(
      mesh,
      plane,
      true,
      frontName ?? this.nextName('SplitA')
    );
    const backMesh = this.clipMeshToPlane(
      mesh,
      plane,
      false,
      backName ?? this.nextName('SplitB')
    );
    if (!frontMesh || !backMesh) {
      this.disposeMesh(frontMesh);
      this.disposeMesh(backMesh);
      return null;
    }
    return { frontMesh, backMesh };
  }

  /**
   * Clips polygons to the front or back half-space.
   * @param polygons Source polygons.
   * @param planeNormal CSG plane normal.
   * @param planeConstant CSG plane constant.
   * @param keepFront Whether to keep the front side.
   * @returns Clipped polygons without a cap.
   */
  private clipPolygonsToSide(
    polygons: CsgPolygon[],
    planeNormal: THREE.Vector3,
    planeConstant: number,
    keepFront: boolean
  ): CsgPolygon[] {
    if (keepFront) {
      return this.clipper.clipPolygonsToFront(
        polygons,
        planeNormal,
        planeConstant
      );
    }
    const invertedNormal = planeNormal.clone().negate();
    const invertedConstant = -planeConstant;
    return this.clipper.clipPolygonsToFront(
      polygons,
      invertedNormal,
      invertedConstant
    );
  }

  /**
   * Appends a plane cap polygon when enough intersection points exist.
   * @param clipped Half-space shell polygons.
   * @param sourcePolygons Full source solid polygons.
   * @param planeNormal CSG plane normal.
   * @param planeConstant CSG plane constant.
   * @param outwardNormal Outward normal for the cap.
   * @returns Polygons including the cap when built.
   */
  private appendCapIfPossible(
    clipped: CsgPolygon[],
    sourcePolygons: CsgPolygon[],
    planeNormal: THREE.Vector3,
    planeConstant: number,
    outwardNormal: THREE.Vector3
  ): CsgPolygon[] {
    const cap = buildPlaneCapPolygon(
      sourcePolygons,
      planeNormal,
      planeConstant,
      outwardNormal
    );
    if (!cap) return clipped;
    return [...clipped, cap];
  }

  /**
   * Builds a centered mesh from polygons using the source material color.
   * @param polygons Result polygon soup.
   * @param sourceMesh Source mesh for color inheritance.
   * @param name Result mesh name.
   * @returns New mesh with decorative edges.
   */
  private buildResultMesh(
    polygons: CsgPolygon[],
    sourceMesh: THREE.Mesh,
    name: string
  ): THREE.Mesh {
    const color = this.extractMeshColor(sourceMesh);
    const mesh = this.meshBuilder.polygonsToMesh(polygons, color, name);
    rebuildDecorativeEdges(mesh);
    return mesh;
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

  /**
   * Allocates the next auto-incremented result name.
   * @param prefix Name prefix.
   * @returns Unique mesh name.
   */
  private nextName(prefix: string): string {
    this.resultCounter += 1;
    return `${prefix}_${String(this.resultCounter).padStart(3, '0')}`;
  }

  /**
   * Disposes geometry and material of a temporary mesh.
   * @param mesh Mesh to dispose, or null.
   */
  private disposeMesh(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material?.dispose();
  }
}
