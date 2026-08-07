import * as THREE from 'three';
import { isDecorativeEdge, isSolidBrushEdge } from '@/utils/mesh_edge_sync.js';
import {
  EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY,
  EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY,
  isEditModeWireframeSuppressed,
} from '@/utils/edit_mode_wireframe_suppress.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { EditDomainTarget } from './edit_session_domain.js';

export {
  EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY,
  isEditModeWireframeSuppressed,
} from '@/utils/edit_mode_wireframe_suppress.js';

/**
 * Hides object-mode content/brush wireframes for the Edit Mode domain without
 * destroying them, so only the edit cage is visible. Restore with
 * {@link EditModeObjectWireframeHide.restore}.
 */
export class EditModeObjectWireframeHide {
  private readonly hiddenObjects: Set<THREE.Object3D>;

  /** Creates an empty hide tracker. */
  constructor() {
    this.hiddenObjects = new Set();
  }

  /**
   * Hides permanent object-mode wireframes for every domain target.
   *
   * @param domain Edit Mode domain targets.
   */
  hideForDomain(domain: readonly EditDomainTarget[]): void {
    this.restore();
    for (const target of domain) {
      this.hideDomainTarget(target);
    }
  }

  /** Restores every wireframe previously hidden for Edit Mode. */
  restore(): void {
    for (const object of this.hiddenObjects) {
      this.restoreObject(object);
    }
    this.hiddenObjects.clear();
  }

  /**
   * Hides wireframe helpers for one domain target.
   *
   * @param target Edit Mode domain target.
   */
  private hideDomainTarget(target: EditDomainTarget): void {
    if (target.kind === 'content_mesh') {
      this.hideWireframeChildren(target.mesh);
      return;
    }
    this.hideWireframeChildren(target.resultMesh);
    const instance = target.solidModel.findBrush(target.brushId);
    if (instance?.mesh) {
      this.hideWireframeChildren(instance.mesh);
    }
    this.hideSolidEdgeBatches(target.solidModel.root);
  }

  /**
   * Hides decorative, selection, shading, and personal brush edge children on a
   * mesh.
   *
   * @param mesh Mesh that may own wireframe helpers.
   */
  private hideWireframeChildren(mesh: THREE.Mesh | null): void {
    if (!mesh) {
      return;
    }
    for (const child of [...mesh.children]) {
      if (!isObjectModeWireframeHelper(child)) {
        continue;
      }
      this.hideObject(child);
    }
  }

  /**
   * Hides static solid-root edge batches (operation-colored brush wireframes).
   *
   * @param solidRoot Solid model root.
   */
  private hideSolidEdgeBatches(solidRoot: THREE.Group): void {
    for (const child of [...solidRoot.children]) {
      if (child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true) {
        this.hideObject(child);
        continue;
      }
      if (child instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(child)) {
        this.hideWireframeChildren(child);
      }
    }
  }

  /**
   * Records and hides one object, marking it so later frame code cannot show
   * it.
   *
   * @param object Wireframe helper object.
   */
  private hideObject(object: THREE.Object3D): void {
    if (isEditModeWireframeSuppressed(object)) {
      object.visible = false;
      this.hiddenObjects.add(object);
      return;
    }
    object.userData[EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY] = object.visible;
    object.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY] = true;
    object.visible = false;
    this.hiddenObjects.add(object);
  }

  /**
   * Clears suppress markers and restores prior visibility for one helper.
   *
   * @param object Previously suppressed wireframe helper.
   */
  private restoreObject(object: THREE.Object3D): void {
    const wasVisible = object.userData[EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY] !== false;
    delete object.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY];
    delete object.userData[EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY];
    object.visible = wasVisible;
  }
}

/**
 * Returns whether a mesh child is an object-mode edge/selection helper that
 * must not draw over the Edit Mode cage.
 *
 * @param child Mesh child candidate.
 * @returns True for decorative edges, brush edges, selection outlines,
 *   overlays.
 */
export function isObjectModeWireframeHelper(child: THREE.Object3D): boolean {
  if (isDecorativeEdge(child) || isSolidBrushEdge(child)) {
    return true;
  }
  if (child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) {
    return true;
  }
  if (child.userData['isSelectionHighlight'] === true) {
    return true;
  }
  if (child.userData['isWireframeOverlay'] === true) {
    return true;
  }
  if (child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true) {
    return true;
  }
  if (child instanceof THREE.LineSegments) {
    return true;
  }
  if (child instanceof THREE.Group && groupContainsOnlyWireframeHelpers(child)) {
    return true;
  }
  return false;
}

/**
 * Returns whether a group is only selection/wireframe helper geometry.
 *
 * @param group Candidate group under a content or brush mesh.
 * @returns True when every child is a wireframe helper line.
 */
function groupContainsOnlyWireframeHelpers(group: THREE.Group): boolean {
  if (group.children.length === 0) {
    return false;
  }
  for (const nested of group.children) {
    if (!(nested instanceof THREE.LineSegments)) {
      return false;
    }
  }
  return true;
}
