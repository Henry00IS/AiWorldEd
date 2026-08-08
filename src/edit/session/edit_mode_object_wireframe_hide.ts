import * as THREE from 'three';
import { isDecorativeEdge, isSolidBrushEdge } from '@/utils/mesh_edge_sync.js';
import {
  EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY,
  EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY,
  isEditModeWireframeSuppressed,
} from '@/utils/edit_mode_wireframe_suppress.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY, SolidBrushEdgeBatch } from '@/solid/model/solid_brush_edge_batch.js';
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
  private domainBrushMeshesTracked: boolean;

  /** Creates an empty hide tracker. */
  constructor() {
    this.hiddenObjects = new Set();
    this.domainBrushMeshesTracked = false;
  }

  /**
   * Hides permanent object-mode wireframes for domain targets only. Sibling
   * brushes outside the domain keep their static edge batches and personal
   * wireframes so the rest of the solid stays visible in 2D/3D wireframe.
   * Domain brushes are pulled out of static batches (live-pose membership) so
   * their additive/subtractive green/red edges do not draw under the edit
   * cage.
   *
   * @param domain Edit Mode domain targets.
   */
  hideForDomain(domain: readonly EditDomainTarget[]): void {
    this.restore();
    this.pullDomainBrushesOutOfStaticBatches(domain);
    for (const target of domain) {
      this.hideDomainTarget(target);
    }
    this.hideSolidEdgeBatchesWhenEntireSolidIsDomain(domain);
  }

  /** Restores every wireframe previously hidden for Edit Mode. */
  restore(): void {
    for (const object of this.hiddenObjects) {
      this.restoreObject(object);
    }
    this.hiddenObjects.clear();
    this.endDomainBrushBatchExclusion();
  }

  /**
   * Removes domain brush meshes from static edge batches so operation-colored
   * wireframes are not drawn for brushes currently in Edit Mode.
   *
   * @param domain Edit Mode domain targets.
   */
  private pullDomainBrushesOutOfStaticBatches(domain: readonly EditDomainTarget[]): void {
    const domainBrushMeshes = this.collectDomainBrushMeshes(domain);
    if (domainBrushMeshes.length === 0) {
      return;
    }
    SolidBrushEdgeBatch.beginLivePoseTracking(domainBrushMeshes);
    this.domainBrushMeshesTracked = true;
  }

  /** Ends live-pose membership used to exclude domain brushes from batches. */
  private endDomainBrushBatchExclusion(): void {
    if (!this.domainBrushMeshesTracked) {
      return;
    }
    SolidBrushEdgeBatch.endLivePoseTracking();
    this.domainBrushMeshesTracked = false;
  }

  /**
   * Collects brush preview meshes for brush domain targets.
   *
   * @param domain Edit Mode domain targets.
   * @returns Domain brush meshes.
   */
  private collectDomainBrushMeshes(domain: readonly EditDomainTarget[]): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const target of domain) {
      if (target.kind !== 'brush') {
        continue;
      }
      const instance = target.solidModel.findBrush(target.brushId);
      if (instance?.mesh) {
        meshes.push(instance.mesh);
      }
    }
    return meshes;
  }
  /**
   * Hides wireframe helpers for one domain target without touching siblings.
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
   * Hides solid-root static edge batches only when every brush of that solid is
   * in the edit domain. Partial-domain brush edits leave the batch visible so
   * non-edited brushes keep their wireframes.
   *
   * @param domain Edit Mode domain targets.
   */
  private hideSolidEdgeBatchesWhenEntireSolidIsDomain(domain: readonly EditDomainTarget[]): void {
    const brushIdsBySolid = this.collectDomainBrushIdsBySolid(domain);
    for (const [solidRoot, domainBrushIds] of brushIdsBySolid) {
      if (!this.solidHasOnlyDomainBrushes(solidRoot, domainBrushIds)) {
        continue;
      }
      this.hideSolidEdgeBatchesOnRoot(solidRoot);
    }
  }

  /**
   * Groups domain brush ids by solid root group.
   *
   * @param domain Edit Mode domain targets.
   * @returns Solid root → domain brush id set.
   */
  private collectDomainBrushIdsBySolid(domain: readonly EditDomainTarget[]): Map<THREE.Group, Set<string>> {
    const bySolid = new Map<THREE.Group, Set<string>>();
    for (const target of domain) {
      if (target.kind !== 'brush') {
        continue;
      }
      const root = target.solidModel.root;
      let brushIds = bySolid.get(root);
      if (!brushIds) {
        brushIds = new Set<string>();
        bySolid.set(root, brushIds);
      }
      brushIds.add(target.brushId);
    }
    return bySolid;
  }

  /**
   * Returns whether every brush under a solid root is listed in the domain set.
   *
   * @param solidRoot Solid model root.
   * @param domainBrushIds Domain brush ids for that solid.
   * @returns True when the domain covers the whole solid.
   */
  private solidHasOnlyDomainBrushes(solidRoot: THREE.Group, domainBrushIds: ReadonlySet<string>): boolean {
    let brushCount = 0;
    for (const child of solidRoot.children) {
      if (!(child instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(child)) {
        continue;
      }
      brushCount += 1;
      const brushId = SolidBrushVisual.getBrushId(child);
      if (!brushId || !domainBrushIds.has(brushId)) {
        return false;
      }
    }
    return brushCount > 0 && brushCount === domainBrushIds.size;
  }

  /**
   * Hides static edge batch LineSegments parented under a solid root.
   *
   * @param solidRoot Solid model root.
   */
  private hideSolidEdgeBatchesOnRoot(solidRoot: THREE.Group): void {
    for (const child of [...solidRoot.children]) {
      if (child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true) {
        this.hideObject(child);
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
