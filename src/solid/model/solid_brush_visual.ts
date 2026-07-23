import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidOperation } from '../types/solid_operation.js';
import {
  DECORATIVE_EDGE_USERDATA_KEY
} from '../../utils/mesh_edge_sync.js';
import { Theme } from '../../theme.js';

/**
 * UserData key marking a mesh as a solid brush volume helper.
 */
export const SOLID_BRUSH_USERDATA_KEY = 'isSolidBrush';

/**
 * UserData key storing the brush instance id on a brush mesh.
 */
export const SOLID_BRUSH_ID_USERDATA_KEY = 'solidBrushId';

/**
 * UserData key excluding a mesh from face-mode triangle picking.
 * Brush volume helpers use this so only CSG result surfaces are face-selectable.
 */
export const SKIP_FACE_PICK_USERDATA_KEY = 'skipFacePick';

/**
 * Builds selectable brush preview meshes for the outliner and transform tools.
 */
export class SolidBrushVisual {
  /**
   * Creates a box preview mesh sized to match a centered solid brush.
   * @param name Display name.
   * @param size Edge length of the cube brush.
   * @param operation CSG operation (affects preview tint).
   * @returns Configured mesh with decorative edges.
   */
  static createBoxPreview(
    name: string,
    size: number,
    operation: SolidOperation
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(size, size, size);
    return this.finishPreviewMesh(name, geometry, operation);
  }

  /**
   * Creates a translucent hull preview matching an arbitrary convex brush.
   * @param name Display name.
   * @param brush Local convex brush geometry.
   * @param operation CSG operation (affects preview tint).
   * @returns Configured mesh with decorative edges.
   */
  static createHullPreview(
    name: string,
    brush: SolidBrush,
    operation: SolidOperation
  ): THREE.Mesh {
    const geometry = this.buildHullGeometry(brush);
    return this.finishPreviewMesh(name, geometry, operation);
  }

  /**
   * Builds a triangulated BufferGeometry from brush faces.
   * @param brush Convex brush with wing-edge topology.
   * @returns Geometry in brush local space.
   */
  private static buildHullGeometry(brush: SolidBrush): THREE.BufferGeometry {
    const positions: number[] = [];
    for (const face of brush.faces) {
      const points = brush.getFaceVertices(face);
      if (points.length < 3) continue;
      const origin = points[0];
      for (let index = 1; index < points.length - 1; index++) {
        positions.push(
          origin.x,
          origin.y,
          origin.z,
          points[index].x,
          points[index].y,
          points[index].z,
          points[index + 1].x,
          points[index + 1].y,
          points[index + 1].z
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Applies helper material, metadata, and wireframe to a preview mesh.
   * @param name Display name.
   * @param geometry Mesh geometry.
   * @param operation CSG operation.
   * @returns Configured preview mesh.
   */
  private static finishPreviewMesh(
    name: string,
    geometry: THREE.BufferGeometry,
    operation: SolidOperation
  ): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color: this.colorForOperation(operation),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      metalness: 0,
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    this.stampBrushHelperMetadata(mesh);
    mesh.renderOrder = 2;
    this.attachWireframe(mesh, this.edgeColorForOperation(operation));
    return mesh;
  }

  /**
   * Marks a mesh as a solid brush volume helper (object-selectable, not face-pickable).
   * @param mesh Brush preview mesh.
   */
  static stampBrushHelperMetadata(mesh: THREE.Mesh): void {
    mesh.userData[SOLID_BRUSH_USERDATA_KEY] = true;
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
  }

  /**
   * Returns whether face-mode picking should ignore this object.
   * @param object Candidate hit object.
   * @returns True when face pick must skip the object.
   */
  static shouldSkipFacePick(object: THREE.Object3D): boolean {
    if (object.userData[SKIP_FACE_PICK_USERDATA_KEY] === true) return true;
    return this.isBrushObject(object);
  }

  /**
   * Updates preview material tint for a brush operation change.
   * @param mesh Brush preview mesh.
   * @param operation New operation.
   */
  static applyOperationStyle(mesh: THREE.Mesh, operation: SolidOperation): void {
    this.ensurePreviewMaterial(mesh, operation);
    mesh.traverse((child) => {
      if (!(child instanceof THREE.LineSegments)) return;
      if (child.userData[DECORATIVE_EDGE_USERDATA_KEY] !== true) return;
      const lineMaterial = child.material;
      if (lineMaterial instanceof THREE.LineBasicMaterial) {
        lineMaterial.color.setHex(this.edgeColorForOperation(operation));
        lineMaterial.map = null;
        lineMaterial.needsUpdate = true;
      }
    });
  }

  /**
   * Forces the translucent operation-colored helper material (never content maps).
   * @param mesh Brush preview mesh.
   * @param operation Brush CSG operation.
   */
  private static ensurePreviewMaterial(
    mesh: THREE.Mesh,
    operation: SolidOperation
  ): void {
    const previous = mesh.material;
    if (Array.isArray(previous)) {
      previous.forEach((entry) => entry.dispose());
    } else if (previous) {
      previous.dispose();
    }
    mesh.material = new THREE.MeshStandardMaterial({
      color: this.colorForOperation(operation),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      metalness: 0,
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide,
      map: null
    });
  }

  /**
   * Returns whether an object is a solid brush preview mesh.
   * @param object Candidate object.
   * @returns True for brush previews.
   */
  static isBrushObject(object: THREE.Object3D): boolean {
    return object.userData[SOLID_BRUSH_USERDATA_KEY] === true;
  }

  /**
   * Reads the brush id stamped on a preview mesh.
   * @param object Brush mesh.
   * @returns Brush id or null.
   */
  static getBrushId(object: THREE.Object3D): string | null {
    const id = object.userData[SOLID_BRUSH_ID_USERDATA_KEY];
    return typeof id === 'string' ? id : null;
  }

  /**
   * Stamps the brush id onto a preview mesh.
   * @param mesh Brush mesh.
   * @param brushId Brush instance id.
   */
  static setBrushId(mesh: THREE.Mesh, brushId: string): void {
    mesh.userData[SOLID_BRUSH_ID_USERDATA_KEY] = brushId;
  }

  /**
   * Preview fill color for a CSG operation.
   * @param operation Solid operation.
   * @returns Hex color.
   */
  private static colorForOperation(operation: SolidOperation): number {
    if (operation === SolidOperation.Subtractive) return 0xc0392b;
    if (operation === SolidOperation.Intersecting) return 0x2980b9;
    return 0x27ae60;
  }

  /**
   * Preview edge color for a CSG operation.
   * @param operation Solid operation.
   * @returns Hex color.
   */
  private static edgeColorForOperation(operation: SolidOperation): number {
    if (operation === SolidOperation.Subtractive) return 0xff6b5a;
    if (operation === SolidOperation.Intersecting) return 0x5dade2;
    return 0x58d68d;
  }

  /**
   * Attaches decorative edge lines to a brush preview.
   * @param mesh Target mesh.
   * @param edgeColor Line color.
   */
  private static attachWireframe(mesh: THREE.Mesh, edgeColor: number): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: edgeColor,
        depthTest: true,
        transparent: true,
        opacity: 0.95
      })
    );
    line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    line.renderOrder = 3;
    mesh.add(line);
    void Theme;
  }
}
