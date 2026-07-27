import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidBrushEdgeMaterials, SOLID_BRUSH_EDGE_USERDATA_KEY } from './solid_brush_edge_materials.js';

/** UserData key marking a mesh as a solid brush volume helper. */
export const SOLID_BRUSH_USERDATA_KEY = 'isSolidBrush';

/** UserData key storing the brush instance id on a brush mesh. */
export const SOLID_BRUSH_ID_USERDATA_KEY = 'solidBrushId';

/** UserData key storing the CSG operation used for preview tinting. */
export const SOLID_BRUSH_OPERATION_USERDATA_KEY = 'solidBrushOperation';

/** UserData key tracking whether the translucent hull fill is shown. */
export const SOLID_BRUSH_HULL_FILL_USERDATA_KEY = 'solidBrushHullFillVisible';

/**
 * UserData key excluding a mesh from face-mode triangle picking. Brush volume
 * helpers use this so only CSG result surfaces are face-selectable.
 */
export const SKIP_FACE_PICK_USERDATA_KEY = 'skipFacePick';

/** UserData key marking the dim occluded pass of a brush edge wireframe. */
export const SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY = 'isSolidBrushOccludedEdge';

/** Render order for the occluded brush edge pass (drawn before the front pass). */
const BRUSH_EDGE_OCCLUDED_RENDER_ORDER = 3;

/** Render order for the front brush edge pass. */
const BRUSH_EDGE_FRONT_RENDER_ORDER = 4;

/**
 * Render order for selected hull fills in orthographic 2D views. Above solid
 * result meshes so the translucent volume is not buried by opaque CSG depth.
 */
const BRUSH_ORTHO_SELECTED_FILL_RENDER_ORDER = 6;

/** Default render order for brush helper meshes in perspective. */
const BRUSH_DEFAULT_RENDER_ORDER = 2;

/** UserData key marking a brush preview that lives in an orthographic 2D clone. */
export const SOLID_BRUSH_ORTHO_CLONE_USERDATA_KEY = 'solidBrushOrthoClone';

/**
 * Builds selectable brush preview meshes for the outliner and transform tools.
 * Unselected brushes render operation-colored outlines only (no filled hull).
 * Selected brushes add a cheap translucent fill so the volume is visible. Edge
 * lines use dual depth passes and distance fade in the 3D viewport.
 */
export class SolidBrushVisual {
  /**
   * When true, selected hull fills use depth testing (perspective). When false,
   * fills draw always-on-top for orthographic multi-view panes.
   */
  private static hullFillDepthOcclusionEnabled = true;

  /**
   * Creates a box preview mesh sized to match a centered solid brush.
   *
   * @param name Display name.
   * @param size Edge length of the cube brush.
   * @param operation CSG operation (affects preview tint).
   * @returns Configured mesh with decorative edges.
   */
  static createBoxPreview(name: string, size: number, operation: SolidOperation): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(size, size, size);
    return this.finishPreviewMesh(name, geometry, operation);
  }

  /**
   * Creates a hull preview matching an arbitrary convex brush.
   *
   * @param name Display name.
   * @param brush Local convex brush geometry.
   * @param operation CSG operation (affects preview tint).
   * @returns Configured mesh with decorative edges.
   */
  static createHullPreview(name: string, brush: SolidBrush, operation: SolidOperation): THREE.Mesh {
    const geometry = this.buildHullGeometry(brush);
    return this.finishPreviewMesh(name, geometry, operation);
  }

  /**
   * Builds a triangulated BufferGeometry from brush faces.
   *
   * @param brush Convex brush with wing-edge topology.
   * @returns Geometry in brush local space.
   */
  private static buildHullGeometry(brush: SolidBrush): THREE.BufferGeometry {
    const positions: number[] = [];
    for (const face of brush.faces) {
      const points = brush.getFaceVertices(face);
      if (points.length < 3) continue;
      const origin = points[0]!;
      for (let index = 1; index < points.length - 1; index++) {
        const mid = points[index]!;
        const last = points[index + 1]!;
        positions.push(origin.x, origin.y, origin.z, mid.x, mid.y, mid.z, last.x, last.y, last.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Applies helper material, metadata, and wireframe to a preview mesh.
   *
   * @param name Display name.
   * @param geometry Mesh geometry.
   * @param operation CSG operation.
   * @returns Configured preview mesh (outline-only until selected).
   */
  private static finishPreviewMesh(
    name: string,
    geometry: THREE.BufferGeometry,
    operation: SolidOperation,
  ): THREE.Mesh {
    const material = this.createOutlineOnlyMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    this.stampBrushHelperMetadata(mesh);
    this.storeOperation(mesh, operation);
    mesh.userData[SOLID_BRUSH_HULL_FILL_USERDATA_KEY] = false;
    mesh.renderOrder = BRUSH_DEFAULT_RENDER_ORDER;
    this.attachWireframe(mesh, operation);
    return mesh;
  }

  /**
   * Marks a mesh as a solid brush volume helper (object-selectable, not
   * face-pickable).
   *
   * @param mesh Brush preview mesh.
   */
  static stampBrushHelperMetadata(mesh: THREE.Mesh): void {
    mesh.userData[SOLID_BRUSH_USERDATA_KEY] = true;
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
  }

  /**
   * Returns whether face-mode picking should ignore this object.
   *
   * @param object Candidate hit object.
   * @returns True when face pick must skip the object.
   */
  static shouldSkipFacePick(object: THREE.Object3D): boolean {
    if (object.userData[SKIP_FACE_PICK_USERDATA_KEY] === true) return true;
    return this.isBrushObject(object);
  }

  /**
   * Updates preview edge materials for a brush operation change. Preserves
   * current hull-fill visibility (selected vs outline-only).
   *
   * @param mesh Brush preview mesh.
   * @param operation New operation.
   */
  static applyOperationStyle(mesh: THREE.Mesh, operation: SolidOperation): void {
    this.storeOperation(mesh, operation);
    if (!this.hasBrushEdges(mesh)) {
      this.attachWireframe(mesh, operation);
    } else {
      this.bindEdgeMaterials(mesh, operation);
    }
    const fillVisible = mesh.userData[SOLID_BRUSH_HULL_FILL_USERDATA_KEY] === true;
    this.setHullFillVisible(mesh, fillVisible);
  }

  /**
   * Returns whether the mesh already has dual-pass solid brush edge helpers.
   *
   * @param mesh Brush preview mesh.
   * @returns True when at least one brush edge LineSegments child exists.
   */
  private static hasBrushEdges(mesh: THREE.Mesh): boolean {
    return mesh.children.some(
      (child) => child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
    );
  }

  /**
   * Shows or hides the translucent volume fill for a brush helper. Unselected
   * brushes stay outline-only for clarity and draw-call cost.
   *
   * @param mesh Brush preview mesh.
   * @param visible True to show the operation-colored translucent hull.
   */
  static setHullFillVisible(mesh: THREE.Mesh, visible: boolean): void {
    if (!this.isBrushObject(mesh)) return;
    mesh.userData[SOLID_BRUSH_HULL_FILL_USERDATA_KEY] = visible;
    const operation = this.readOperation(mesh);
    const material = this.ensureBasicMaterial(mesh);
    if (visible) {
      this.applySelectedFillStyle(material, operation);
    } else {
      this.applyOutlineOnlyStyle(material);
    }
    this.applyHullFillDepthPresentation(mesh, material, visible);
  }

  /**
   * Marks a brush preview as a 2D orthographic clone and prepares its materials
   * so selected hulls are not occluded by solid result depth.
   *
   * @param mesh Cloned brush preview in a 2D viewport scene.
   */
  static prepareBrushMeshForOrthoClone(mesh: THREE.Mesh): void {
    if (!this.isBrushObject(mesh)) return;
    mesh.userData[SOLID_BRUSH_ORTHO_CLONE_USERDATA_KEY] = true;
    mesh.frustumCulled = false;
    const material = this.ensureBasicMaterial(mesh);
    this.applyHullFillDepthPresentation(mesh, material, this.isHullFillVisible(mesh));
  }

  /**
   * Returns whether a brush mesh is a 2D orthographic viewport clone.
   *
   * @param mesh Candidate brush mesh.
   * @returns True for ortho clones.
   */
  static isOrthoCloneBrush(mesh: THREE.Mesh): boolean {
    return mesh.userData[SOLID_BRUSH_ORTHO_CLONE_USERDATA_KEY] === true;
  }

  /**
   * Returns whether the translucent hull fill is currently shown.
   *
   * @param mesh Brush preview mesh.
   * @returns True when fill is visible.
   */
  static isHullFillVisible(mesh: THREE.Mesh): boolean {
    return mesh.userData[SOLID_BRUSH_HULL_FILL_USERDATA_KEY] === true;
  }

  /**
   * Enables depth-tested selected hull fills (perspective) or always-on-top
   * fills (orthographic multi-view). Updates every selected brush under root.
   *
   * @param root World group or scene containing brush helpers.
   * @param enabled True for 3D depth occlusion; false for full-bright 2D.
   */
  static setHullFillDepthOcclusionEnabled(root: THREE.Object3D, enabled: boolean): void {
    this.hullFillDepthOcclusionEnabled = enabled;
    this.applyHullFillDepthModeToTree(root);
  }

  /**
   * Returns whether selected hull fills currently use depth testing.
   *
   * @returns True when perspective-style depth occlusion is active.
   */
  static isHullFillDepthOcclusionEnabled(): boolean {
    return this.hullFillDepthOcclusionEnabled;
  }

  /**
   * Applies selected-state fill styling to a brush material.
   *
   * @param material Brush surface material.
   * @param operation CSG operation for tint.
   */
  private static applySelectedFillStyle(material: THREE.MeshBasicMaterial, operation: SolidOperation): void {
    material.visible = true;
    material.color.setHex(this.colorForOperation(operation));
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    material.colorWrite = true;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
  }

  /**
   * Applies depth presentation for a selected or outline-only brush hull. Used
   * for shared multi-view 2D panes, perspective panes, and legacy ortho
   * clones.
   *
   * @param mesh Brush preview mesh.
   * @param material Fill material to adjust.
   * @param fillVisible Whether the selected fill is shown.
   */
  private static applyHullFillDepthPresentation(
    mesh: THREE.Mesh,
    material: THREE.MeshBasicMaterial,
    fillVisible: boolean,
  ): void {
    if (!fillVisible) {
      mesh.renderOrder = BRUSH_DEFAULT_RENDER_ORDER;
      material.needsUpdate = true;
      return;
    }
    if (this.shouldUseOrthographicHullFill(mesh)) {
      this.applyOrthographicHullFillDepth(mesh, material);
      return;
    }
    this.applyPerspectiveHullFillDepth(mesh, material);
  }

  /**
   * Returns whether this brush should draw its selected fill without depth
   * testing (2D multi-view pass or dedicated ortho clone).
   *
   * @param mesh Brush preview mesh.
   * @returns True for always-on-top hull presentation.
   */
  private static shouldUseOrthographicHullFill(mesh: THREE.Mesh): boolean {
    return !this.hullFillDepthOcclusionEnabled || this.isOrthoCloneBrush(mesh);
  }

  /**
   * Walks a hierarchy and re-applies hull fill depth mode to selected brushes.
   *
   * @param root World group or scene containing brush helpers.
   */
  private static applyHullFillDepthModeToTree(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!this.isBrushObject(object)) return;
      if (!this.isHullFillVisible(object)) return;
      const material = this.ensureBasicMaterial(object);
      this.applyHullFillDepthPresentation(object, material, true);
    });
  }

  /**
   * Draws the selected volume without depth testing so other brushes do not
   * hide it in orthographic views.
   *
   * @param mesh Brush preview mesh.
   * @param material Selected fill material.
   */
  private static applyOrthographicHullFillDepth(mesh: THREE.Mesh, material: THREE.MeshBasicMaterial): void {
    material.depthTest = false;
    material.depthWrite = false;
    material.depthFunc = THREE.AlwaysDepth;
    material.polygonOffset = false;
    mesh.renderOrder = BRUSH_ORTHO_SELECTED_FILL_RENDER_ORDER;
    material.needsUpdate = true;
  }

  /**
   * Restores depth-tested selected fill presentation for the perspective pane.
   *
   * @param mesh Brush preview mesh.
   * @param material Selected fill material.
   */
  private static applyPerspectiveHullFillDepth(mesh: THREE.Mesh, material: THREE.MeshBasicMaterial): void {
    material.depthTest = true;
    material.depthWrite = false;
    material.depthFunc = THREE.LessEqualDepth;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    mesh.renderOrder = BRUSH_DEFAULT_RENDER_ORDER;
    material.needsUpdate = true;
  }

  /**
   * Applies outline-only surface styling (not drawn; pick mesh only). Depth is
   * left to the CSG result so brush volumes do not hide other edges.
   *
   * @param material Brush surface material.
   */
  private static applyOutlineOnlyStyle(material: THREE.MeshBasicMaterial): void {
    material.visible = false;
    material.color.setHex(0x000000);
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = false;
    material.depthTest = true;
    material.colorWrite = false;
    material.side = THREE.FrontSide;
    material.polygonOffset = false;
    material.needsUpdate = true;
  }

  /**
   * Ensures the brush mesh uses a MeshBasicMaterial suitable for helper fills.
   *
   * @param mesh Brush preview mesh.
   * @returns The mesh basic material in use.
   */
  private static ensureBasicMaterial(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
    const current = mesh.material;
    if (current instanceof THREE.MeshBasicMaterial) {
      return current;
    }
    this.disposeMaterial(current);
    const material = this.createOutlineOnlyMaterial();
    mesh.material = material;
    return material;
  }

  /**
   * Creates the default invisible surface material for unselected brushes.
   *
   * @returns MeshBasicMaterial with color writes disabled.
   */
  private static createOutlineOnlyMaterial(): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    this.applyOutlineOnlyStyle(material);
    return material;
  }

  /**
   * Disposes a material or material array unless it is a shared edge material.
   *
   * @param material Material(s) to dispose.
   */
  private static disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => this.disposeOwnedMaterial(entry));
      return;
    }
    if (material) this.disposeOwnedMaterial(material);
  }

  /**
   * Disposes one material when it is owned by a mesh (not shared).
   *
   * @param material Material to dispose.
   */
  private static disposeOwnedMaterial(material: THREE.Material): void {
    if (SolidBrushEdgeMaterials.isSharedMaterial(material)) return;
    material.dispose();
  }

  /**
   * Binds shared front/occluded edge materials for the given operation.
   *
   * @param mesh Brush preview mesh.
   * @param operation CSG operation.
   */
  private static bindEdgeMaterials(mesh: THREE.Mesh, operation: SolidOperation): void {
    for (const child of mesh.children) {
      if (!(child instanceof THREE.LineSegments)) continue;
      if (child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] !== true) continue;
      const isOccluded = child.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true;
      child.material = isOccluded
        ? SolidBrushEdgeMaterials.getOccludedMaterial(operation)
        : SolidBrushEdgeMaterials.getFrontMaterial(operation);
    }
  }

  /**
   * Stores the CSG operation on mesh userData for later style updates.
   *
   * @param mesh Brush preview mesh.
   * @param operation CSG operation.
   */
  private static storeOperation(mesh: THREE.Mesh, operation: SolidOperation): void {
    mesh.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY] = operation;
  }

  /**
   * Reads the stored CSG operation, defaulting to additive.
   *
   * @param mesh Brush preview mesh.
   * @returns Stored operation or Additive.
   */
  private static readOperation(mesh: THREE.Mesh): SolidOperation {
    const value = mesh.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY];
    if (value === SolidOperation.Subtractive) return SolidOperation.Subtractive;
    if (value === SolidOperation.Intersecting) return SolidOperation.Intersecting;
    return SolidOperation.Additive;
  }

  /**
   * Returns whether an object is a solid brush preview mesh.
   *
   * @param object Candidate object.
   * @returns True for brush previews.
   */
  static isBrushObject(object: THREE.Object3D): boolean {
    return object.userData[SOLID_BRUSH_USERDATA_KEY] === true;
  }

  /**
   * Reads the brush id stamped on a preview mesh.
   *
   * @param object Brush mesh.
   * @returns Brush id or null.
   */
  static getBrushId(object: THREE.Object3D): string | null {
    const id = object.userData[SOLID_BRUSH_ID_USERDATA_KEY];
    return typeof id === 'string' ? id : null;
  }

  /**
   * Stamps the brush id onto a preview mesh.
   *
   * @param mesh Brush mesh.
   * @param brushId Brush instance id.
   */
  static setBrushId(mesh: THREE.Mesh, brushId: string): void {
    mesh.userData[SOLID_BRUSH_ID_USERDATA_KEY] = brushId;
  }

  /**
   * Preview fill color for a CSG operation.
   *
   * @param operation Solid operation.
   * @returns Hex color.
   */
  private static colorForOperation(operation: SolidOperation): number {
    if (operation === SolidOperation.Subtractive) return 0xc0392b;
    if (operation === SolidOperation.Intersecting) return 0x2980b9;
    return 0x27ae60;
  }

  /**
   * Attaches dual-pass operation-colored edge lines to a brush preview. Uses
   * SOLID_BRUSH_EDGE_USERDATA_KEY so content white outlines never attach here.
   * Shared materials provide occluded dimming and distance fade in 3D.
   *
   * @param mesh Target mesh.
   * @param operation CSG operation for edge tint.
   */
  private static attachWireframe(mesh: THREE.Mesh, operation: SolidOperation): void {
    const sharedEdgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 1);
    if (!sharedEdgeGeometry.boundingSphere) {
      sharedEdgeGeometry.computeBoundingSphere();
    }
    const occluded = new THREE.LineSegments(sharedEdgeGeometry, SolidBrushEdgeMaterials.getOccludedMaterial(operation));
    occluded.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] = true;
    occluded.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] = true;
    occluded.renderOrder = BRUSH_EDGE_OCCLUDED_RENDER_ORDER;
    const front = new THREE.LineSegments(sharedEdgeGeometry, SolidBrushEdgeMaterials.getFrontMaterial(operation));
    front.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] = true;
    front.renderOrder = BRUSH_EDGE_FRONT_RENDER_ORDER;
    mesh.add(occluded);
    mesh.add(front);
  }
}
