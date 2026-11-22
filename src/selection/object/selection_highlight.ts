import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { hasEdgeBuildableGeometry } from '@/utils/mesh_edge_sync.js';
import { GizmoVisualStyle } from '@/transform/gizmo/gizmo_visual_style.js';
import { getOrBuildSelectionEdgeGeometry } from './selection_edge_geometry.js';

/**
 * UserData flag marking a LineSegments object as a selection outline. Used to
 * exclude outlines from raycast targets and selection.
 */
export const SELECTION_HIGHLIGHT_USERDATA_KEY = 'isSelectionHighlight';

/** UserData flag on the dim occluded edge pass (hidden in orthographic 2D). */
export const SELECTION_HIGHLIGHT_OCCLUDED_USERDATA_KEY = 'isSelectionHighlightOccluded';

/** Front-pass opacity for unoccluded selection edges (matches soft CSG look). */
const SELECTION_EDGE_FRONT_OPACITY = 0.82;

/** Occluded-pass opacity so outlines remain readable without blowing out. */
const SELECTION_EDGE_OCCLUDED_OPACITY = 0.22;

/**
 * Visual selection edge outlines on selected objects. Uses dual-pass depth
 * treatment (front + faint occluded) in perspective views so object mode is not
 * a flat full-bright always-on-top orange. Orthographic multi-view panes toggle
 * shared materials via {@link setDepthOcclusionEnabled} so 2D wireframes are
 * never blocked by floor/ceiling depth.
 */
export class SelectionHighlight {
  private static depthOcclusionEnabled = true;
  private static sharedFrontMaterial: THREE.LineBasicMaterial | null = null;
  private static sharedOccludedMaterial: THREE.LineBasicMaterial | null = null;
  private static activeInstances = new Set<SelectionHighlight>();

  private scene: THREE.Scene;
  private highlightMap: Map<THREE.Mesh, THREE.Group>;
  private highlightColor: number;

  /**
   * Creates a new selection highlight manager for the given scene.
   *
   * @param scene The Three.js scene this highlight instance belongs to.
   * @param theme The theme color constants used for highlight appearance.
   */
  constructor(scene: THREE.Scene, theme: typeof Theme) {
    this.scene = scene;
    this.highlightMap = new Map();
    this.highlightColor = theme.selectionColor;
    SelectionHighlight.ensureSharedMaterials(this.highlightColor);
    SelectionHighlight.activeInstances.add(this);
  }

  /**
   * Enables dual-pass depth darkening for perspective multi-view panes, or
   * always-on-top edges for orthographic 2D panes. Shared materials are toggled
   * each scissor pass because all panes draw the same world hierarchy.
   *
   * @param enabled True for 3D occlusion; false for full-bright 2D edges.
   */
  static setDepthOcclusionEnabled(enabled: boolean): void {
    if (this.depthOcclusionEnabled === enabled) return;
    this.depthOcclusionEnabled = enabled;
    this.applyDepthModeToSharedMaterials();
    this.activeInstances.forEach((instance) => instance.syncOccludedPassVisibility());
  }

  /**
   * Returns whether shared selection materials currently use dual-pass depth.
   *
   * @returns True when depth occlusion is enabled.
   */
  static isDepthOcclusionEnabled(): boolean {
    return this.depthOcclusionEnabled;
  }

  /**
   * Returns the shared front-pass material (tests / debugging).
   *
   * @returns Front line material.
   */
  static getFrontMaterial(): THREE.LineBasicMaterial {
    this.ensureSharedMaterials(Theme.selectionColor);
    return this.sharedFrontMaterial!;
  }

  /**
   * Returns the shared occluded-pass material (tests / debugging).
   *
   * @returns Occluded line material.
   */
  static getOccludedMaterial(): THREE.LineBasicMaterial {
    this.ensureSharedMaterials(Theme.selectionColor);
    return this.sharedOccludedMaterial!;
  }

  /**
   * Applies an orange edge outline to a mesh if it belongs to this scene.
   *
   * @param mesh The mesh to highlight.
   */
  apply(mesh: THREE.Mesh): void {
    if (this.highlightMap.has(mesh)) return;
    if (!this.isDescendantOfScene(mesh)) return;
    if (!hasEdgeBuildableGeometry(mesh)) return;
    this.stripOrphanHighlights(mesh);
    const outlineGroup = this.createOutlineForMesh(mesh);
    mesh.add(outlineGroup);
    this.highlightMap.set(mesh, outlineGroup);
  }

  /**
   * Removes the orange edge outline from a mesh.
   *
   * @param mesh The mesh to un-highlight.
   */
  remove(mesh: THREE.Mesh): void {
    const outlineGroup = this.highlightMap.get(mesh);
    if (!outlineGroup) return;
    this.disposeOutlineGroup(mesh, outlineGroup);
    this.highlightMap.delete(mesh);
  }

  /** Removes all active highlights from the scene. */
  clearAll(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => this.remove(mesh));
  }

  /**
   * Forces every active outline to match its parent mesh transform. Outlines
   * are mesh children so this is normally automatic; calling this after
   * external transform updates keeps outlines aligned.
   */
  syncTransforms(): void {
    this.highlightMap.forEach((outlineGroup, mesh) => {
      if (outlineGroup.parent !== mesh) {
        mesh.add(outlineGroup);
      }
      outlineGroup.position.set(0, 0, 0);
      outlineGroup.rotation.set(0, 0, 0);
      outlineGroup.scale.set(1, 1, 1);
      outlineGroup.updateMatrix();
    });
  }

  /**
   * Rebuilds outline geometry for all highlighted meshes. Call after geometry
   * edits so edges match the current mesh.
   */
  rebuildGeometries(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => {
      this.remove(mesh);
      this.apply(mesh);
    });
  }

  /**
   * Updates the highlight color for all active highlights.
   *
   * @param color The new hex color value for highlights.
   */
  updateColor(color: number): void {
    this.highlightColor = color;
    SelectionHighlight.ensureSharedMaterials(color);
    SelectionHighlight.sharedFrontMaterial!.color.setHex(color);
    SelectionHighlight.sharedOccludedMaterial!.color.setHex(color);
  }

  /** Disposes all highlight resources and clears state. */
  dispose(): void {
    this.clearAll();
    SelectionHighlight.activeInstances.delete(this);
  }

  /**
   * Returns the set of meshes currently highlighted.
   *
   * @returns A set of highlighted mesh references.
   */
  getHighlightedMeshes(): Set<THREE.Mesh> {
    return new Set(this.highlightMap.keys());
  }

  /**
   * Creates dual-pass outline line segments for a mesh in local space.
   *
   * @param mesh The mesh whose edges will be outlined.
   * @returns Group containing front and occluded edge passes.
   */
  private createOutlineForMesh(mesh: THREE.Mesh): THREE.Group {
    SelectionHighlight.ensureSharedMaterials(this.highlightColor);
    const edges = getOrBuildSelectionEdgeGeometry(mesh);
    const group = new THREE.Group();
    group.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    group.matrixAutoUpdate = true;
    group.add(
      this.createEdgePass(
        edges,
        SelectionHighlight.sharedOccludedMaterial!,
        GizmoVisualStyle.occludedRenderOrder,
        true,
      ),
    );
    group.add(
      this.createEdgePass(edges, SelectionHighlight.sharedFrontMaterial!, GizmoVisualStyle.frontRenderOrder, false),
    );
    return group;
  }

  /**
   * Creates one edge line-pass mesh sharing geometry with its sibling pass.
   *
   * @param edges Shared edge geometry (cached; not disposed by the pass).
   * @param material Front or occluded line material.
   * @param renderOrder Draw order for the pass.
   * @param isOccludedPass Whether this is the dim behind-geometry pass.
   * @returns Configured line segments.
   */
  private createEdgePass(
    edges: THREE.BufferGeometry,
    material: THREE.LineBasicMaterial,
    renderOrder: number,
    isOccludedPass: boolean,
  ): THREE.LineSegments {
    const lineSegments = new THREE.LineSegments(edges, material);
    lineSegments.renderOrder = renderOrder;
    lineSegments.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    lineSegments.userData['selectionEdgeGeometryShared'] = true;
    if (isOccludedPass) {
      lineSegments.userData[SELECTION_HIGHLIGHT_OCCLUDED_USERDATA_KEY] = true;
      lineSegments.visible = SelectionHighlight.depthOcclusionEnabled;
    }
    lineSegments.matrixAutoUpdate = true;
    return lineSegments;
  }

  /** Hides the dim occluded pass when drawing full-bright 2D selection edges. */
  private syncOccludedPassVisibility(): void {
    const showOccluded = SelectionHighlight.depthOcclusionEnabled;
    this.highlightMap.forEach((outlineGroup) => {
      outlineGroup.children.forEach((child) => {
        if (!(child instanceof THREE.LineSegments)) return;
        if (child.userData[SELECTION_HIGHLIGHT_OCCLUDED_USERDATA_KEY] !== true) return;
        child.visible = showOccluded;
      });
    });
  }

  /**
   * Ensures shared front and occluded materials exist for the current color.
   *
   * @param color Selection hex color for first-time creation.
   */
  private static ensureSharedMaterials(color: number): void {
    if (!this.sharedFrontMaterial) {
      this.sharedFrontMaterial = this.createFrontMaterial(color);
    }
    if (!this.sharedOccludedMaterial) {
      this.sharedOccludedMaterial = this.createOccludedMaterial(color);
    }
    this.applyDepthModeToSharedMaterials();
  }

  /** Applies the current depth-occlusion mode to both shared materials. */
  private static applyDepthModeToSharedMaterials(): void {
    if (this.sharedFrontMaterial) {
      this.applyDepthMode(this.sharedFrontMaterial, this.depthOcclusionEnabled, THREE.LessEqualDepth);
    }
    if (this.sharedOccludedMaterial) {
      this.applyDepthMode(this.sharedOccludedMaterial, this.depthOcclusionEnabled, THREE.GreaterDepth);
    }
  }

  /**
   * Applies depth-test mode for a dual-pass selection material.
   *
   * @param material Line material to update.
   * @param depthOcclusionEnabled Whether 3D occlusion is active.
   * @param occludedDepthFunc Depth function when occlusion is on.
   */
  private static applyDepthMode(
    material: THREE.LineBasicMaterial,
    depthOcclusionEnabled: boolean,
    occludedDepthFunc: THREE.DepthModes,
  ): void {
    material.depthTest = depthOcclusionEnabled;
    material.depthWrite = false;
    material.depthFunc = depthOcclusionEnabled ? occludedDepthFunc : THREE.AlwaysDepth;
  }

  /**
   * Builds the soft front-pass selection edge material.
   *
   * @param color Selection hex color.
   * @returns Configured line material.
   */
  private static createFrontMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: SELECTION_EDGE_FRONT_OPACITY,
      depthTest: this.depthOcclusionEnabled,
      depthWrite: false,
      depthFunc: this.depthOcclusionEnabled ? THREE.LessEqualDepth : THREE.AlwaysDepth,
      toneMapped: false,
    });
  }

  /**
   * Builds the faint occluded-pass selection edge material.
   *
   * @param color Selection hex color.
   * @returns Configured line material.
   */
  private static createOccludedMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: SELECTION_EDGE_OCCLUDED_OPACITY,
      depthTest: this.depthOcclusionEnabled,
      depthWrite: false,
      depthFunc: this.depthOcclusionEnabled ? THREE.GreaterDepth : THREE.AlwaysDepth,
      toneMapped: false,
    });
  }

  /**
   * Removes any orphaned outline children left behind by cloning.
   *
   * @param mesh The mesh to clean.
   */
  private stripOrphanHighlights(mesh: THREE.Mesh): void {
    const orphans = mesh.children.filter(
      (child) =>
        (child instanceof THREE.LineSegments || child instanceof THREE.Group) &&
        child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    );
    orphans.forEach((child) => {
      if (child instanceof THREE.Group) {
        this.disposeOutlineGroup(mesh, child);
      } else {
        mesh.remove(child);
      }
    });
  }

  /**
   * Detaches and disposes a dual-pass outline group.
   *
   * @param mesh The parent mesh.
   * @param outlineGroup The outline group to dispose.
   */
  private disposeOutlineGroup(mesh: THREE.Mesh, outlineGroup: THREE.Group): void {
    mesh.remove(outlineGroup);
    outlineGroup.clear();
  }

  /**
   * Checks whether a mesh is part of this highlight's scene graph.
   *
   * @param mesh The mesh to test.
   * @returns True if the mesh is the scene or a descendant of it.
   */
  private isDescendantOfScene(mesh: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current === this.scene) return true;
      current = current.parent;
    }
    return false;
  }
}
