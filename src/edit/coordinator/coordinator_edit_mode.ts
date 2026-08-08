import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { EditSession } from '@/edit/session/edit_session.js';
import { readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import {
  ComponentEditCageOverlay,
  type ComponentCageMeshSource,
} from '@/edit/component/component_edit_cage_overlay.js';
import type { ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import { pickComponentEdge } from '@/edit/pick/raycaster_component_edge.js';
import { pickComponentBrushCageFace } from '@/edit/pick/raycaster_component_brush_cage_face.js';
import { pickComponentMeshDocumentFace } from '@/edit/pick/raycaster_component_mesh_document_face.js';
import type { ComponentVertexPickCandidate } from '@/edit/pick/raycaster_component_vertex.js';
import { buildBrushEditCage, type BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import {
  closestWorldPointOnSegmentToPointer,
  measureWorldSegmentScreenDistance,
  pickNearestUnoccludedWorldPointIndex,
} from '@/edit/pick/raycaster_component_world_points.js';
import { isWorldEdgeSampleUnoccluded } from '@/edit/pick/edit_component_occlusion.js';
import { resolveEditComponentPickRadius } from '@/edit/pick/edit_component_screen_metrics.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  EDIT_COMPONENT_EDGE_PICK_RADIUS_PX,
  EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX,
} from '@/edit/component/component_edit_pick_radii.js';
import {
  buildComponentTopologyFromBrushCage,
  buildComponentTopologyFromMeshDocument,
  type ComponentTopologyTarget,
} from '@/edit/component/component_selection_topology.js';
import {
  filterObjectsDeletableOutsideEditDomain,
  isObjectDeleteProtectedByEditDomain,
} from '@/edit/session/edit_mode_domain_protection.js';
import { setEditModeViewportLineStyleActive } from '@/edit/session/edit_mode_viewport_line_style.js';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';

/** Minimal viewport surface used for Edit Mode picking. */
export interface EditModeViewportPickSurface {
  getContentElement(): HTMLElement;
  getCamera(): THREE.Camera;
}

/** Dependencies for the Edit Mode coordinator. */
export interface CoordinatorEditModeDependencies {
  getPrimaryScene: () => THREE.Scene;
  getSelectedObjects: () => readonly THREE.Object3D[];
  getViewports: () => readonly EditModeViewportPickSurface[];
  showStatusMessage: (message: string) => void;
}

/** Owns the Edit Mode session, component selection, picking, and cage display. */
export class CoordinatorEditMode {
  private readonly deps: CoordinatorEditModeDependencies;
  private readonly session: EditSession;
  private cageOverlay: ComponentEditCageOverlay | null;
  private brushCages: BrushEditCage[];

  /**
   * Creates the coordinator.
   *
   * @param deps Shared editor callbacks.
   */
  constructor(deps: CoordinatorEditModeDependencies) {
    this.deps = deps;
    this.session = new EditSession();
    this.cageOverlay = null;
    this.brushCages = [];
    this.session.getComponentSelection().setChangeCallback((selected) => {
      this.refreshOverlay(selected);
    });
  }

  /**
   * Returns whether Edit Mode is active.
   *
   * @returns True while the session is open.
   */
  isActive(): boolean {
    return this.session.isActive();
  }

  /**
   * Returns the open session.
   *
   * @returns Edit session.
   */
  getSession(): EditSession {
    return this.session;
  }

  /**
   * Enters Edit Mode for the current object selection.
   *
   * @returns True when the session opened.
   */
  enterFromObjectSelection(): boolean {
    const opened = this.session.enter(this.deps.getSelectedObjects());
    if (!opened) {
      this.deps.showStatusMessage('Select a mesh or solid brush to enter Edit Mode');
      return false;
    }
    setEditModeViewportLineStyleActive(true);
    this.rebuildBrushCages();
    this.ensureCageOverlay();
    this.refreshOverlay(this.session.getComponentSelection().getSelected());
    this.deps.showStatusMessage(this.session.formatStatusLabel());
    return true;
  }

  /** Re-suppresses object-mode edge helpers for the open domain. */
  suppressObjectModeWireframes(): void {
    if (!this.session.isActive()) {
      return;
    }
    this.session.suppressObjectModeWireframes();
  }

  /** Leaves Edit Mode and disposes overlays. */
  exitToObjectMode(): void {
    this.session.exit();
    this.brushCages = [];
    this.disposeCageOverlay();
    setEditModeViewportLineStyleActive(false);
  }

  /**
   * Sets vertex / edge / face component mode.
   *
   * @param mode Component mode.
   */
  setComponentMode(mode: EditorComponentMode): void {
    if (!this.session.isActive()) {
      return;
    }
    this.session.setComponentMode(mode, this.buildComponentTopologies());
    this.refreshOverlay(this.session.getComponentSelection().getSelected());
    this.deps.showStatusMessage(this.session.formatStatusLabel());
  }

  /**
   * Returns whether object selection changes are blocked (Edit Mode domain
   * lock).
   *
   * @returns True while a session is open.
   */
  isObjectSelectionChangeBlocked(): boolean {
    return this.session.isActive();
  }

  /**
   * Rebuilds the edit cage/selection overlay from the current component
   * selection.
   */
  refreshPresentation(): void {
    if (!this.session.isActive()) {
      return;
    }
    this.refreshOverlay(this.session.getComponentSelection().getSelected());
  }

  /**
   * Rebuilds brush cages and selection overlays from the current domain, and
   * re-suppresses object-mode wireframes.
   */
  refreshDomainGeometryPresentation(): void {
    if (!this.session.isActive()) {
      return;
    }
    this.rebuildBrushCages();
    this.refreshOverlay(this.session.getComponentSelection().getSelected());
    this.session.suppressObjectModeWireframes();
  }

  /**
   * Returns the number of selected components in the open session.
   *
   * @returns Selection count, or zero when inactive.
   */
  getComponentSelectionCount(): number {
    if (!this.session.isActive()) {
      return 0;
    }
    return this.session.getComponentSelection().getSelectedCount();
  }

  /**
   * Returns whether deleting the object would remove an Edit Mode domain
   * target.
   *
   * @param object Candidate hierarchy object.
   * @returns True when delete must be refused.
   */
  isObjectDeleteProtected(object: THREE.Object3D): boolean {
    if (!this.session.isActive()) {
      return false;
    }
    return isObjectDeleteProtectedByEditDomain(object, this.session.getDomain());
  }

  /**
   * Filters objects that may be deleted while Edit Mode is open.
   *
   * @param objects Delete candidates.
   * @returns Objects that are not domain-protected.
   */
  filterDeletableObjects(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
    if (!this.session.isActive()) {
      return objects.slice();
    }
    return filterObjectsDeletableOutsideEditDomain(objects, this.session.getDomain());
  }

  /**
   * Builds topology descriptors for every domain target.
   *
   * @returns Topology list.
   */
  private buildComponentTopologies(): ComponentTopologyTarget[] {
    const topologies: ComponentTopologyTarget[] = [];
    for (const candidate of this.buildMeshPickCandidates()) {
      topologies.push(buildComponentTopologyFromMeshDocument(candidate.targetId, candidate.document));
    }
    for (const cage of this.brushCages) {
      topologies.push(buildComponentTopologyFromBrushCage(cage));
    }
    return topologies;
  }

  /**
   * Applies a component pick under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param addToSelection Shift-style additive select.
   * @param toggleSelection Ctrl-style toggle.
   * @param ownerDocument Document that owns the client coordinates, or null.
   * @returns True when a component was selected or toggled.
   */
  pickAtClientPoint(
    clientX: number,
    clientY: number,
    addToSelection: boolean,
    toggleSelection: boolean,
    ownerDocument: Document | null = null,
  ): boolean {
    if (!this.session.isActive()) {
      return false;
    }
    const viewport = this.findViewportAtClientPoint(clientX, clientY, ownerDocument);
    if (!viewport) {
      return false;
    }
    const pickElement = viewport.getContentElement();
    const camera = viewport.getCamera();
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    const entry = this.pickEntry(event, camera, pickElement);
    if (!entry) {
      if (!addToSelection && !toggleSelection) {
        this.session.getComponentSelection().clear();
        this.deps.showStatusMessage(this.session.formatStatusLabel());
      }
      return false;
    }
    if (toggleSelection) {
      this.session.getComponentSelection().toggle(entry);
    } else {
      this.session.getComponentSelection().select(entry, addToSelection);
    }
    this.deps.showStatusMessage(this.session.formatStatusLabel());
    return true;
  }

  /** Disposes session and overlays. */
  dispose(): void {
    this.exitToObjectMode();
  }

  /**
   * Picks a component entry for the active component mode.
   *
   * @param event Synthetic mouse event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Selection entry or null.
   */
  private pickEntry(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): ComponentSelectionEntry | null {
    const mode = this.session.getComponentMode();
    if (mode === EditorComponentMode.VERTEX) {
      return this.pickVertexEntry(event, camera, pickElement);
    }
    if (mode === EditorComponentMode.EDGE) {
      return this.pickEdgeEntry(event, camera, pickElement);
    }
    return this.pickFaceEntry(event, camera, pickElement);
  }

  /**
   * Picks the nearest domain vertex (mesh document or brush cage).
   *
   * @param event Event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Entry or null.
   */
  private pickVertexEntry(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): ComponentSelectionEntry | null {
    const occluders = this.collectDomainOccluderMeshes();
    const pixelRadius = resolveEditComponentPickRadius(camera, EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX);
    let best: { entry: ComponentSelectionEntry; distance: number } | null = null;
    for (const candidate of this.buildMeshPickCandidates()) {
      const worldPoints = this.collectMeshWorldVertices(candidate);
      const hit = pickNearestUnoccludedWorldPointIndex(event, camera, pickElement, worldPoints, pixelRadius, occluders);
      if (!hit) {
        continue;
      }
      if (best && hit.screenDistance >= best.distance) {
        continue;
      }
      best = {
        distance: hit.screenDistance,
        entry: {
          targetId: candidate.targetId,
          kind: 'vertex',
          componentKey: String(hit.index),
        },
      };
    }
    for (const cage of this.brushCages) {
      const hit = pickNearestUnoccludedWorldPointIndex(
        event,
        camera,
        pickElement,
        cage.worldPositions,
        pixelRadius,
        occluders,
      );
      if (!hit) {
        continue;
      }
      if (best && hit.screenDistance >= best.distance) {
        continue;
      }
      best = {
        distance: hit.screenDistance,
        entry: {
          targetId: cage.targetId,
          kind: 'vertex',
          componentKey: String(hit.index),
        },
      };
    }
    return best?.entry ?? null;
  }

  /**
   * Collects world-space vertices for a mesh document candidate.
   *
   * @param candidate Mesh pick candidate.
   * @returns World points in document vertex order.
   */
  private collectMeshWorldVertices(candidate: ComponentVertexPickCandidate): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const positions = candidate.document.getTopology().getPositions();
    const vertexCount = candidate.document.getTopology().getVertexCount();
    const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
    candidate.mesh.updateMatrixWorld(true);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      meshVertexPositionRead(positions, vertexIndex, scratch);
      points.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(candidate.mesh.matrixWorld));
    }
    return points;
  }

  /**
   * Picks the nearest domain edge.
   *
   * @param event Event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Entry or null.
   */
  private pickEdgeEntry(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): ComponentSelectionEntry | null {
    const occluders = this.collectDomainOccluderMeshes();
    const pixelRadius = resolveEditComponentPickRadius(camera, EDIT_COMPONENT_EDGE_PICK_RADIUS_PX);
    let best: { entry: ComponentSelectionEntry; distance: number } | null = null;
    for (const candidate of this.buildMeshPickCandidates()) {
      const meshHit = pickComponentEdge(event, camera, pickElement, [candidate], pixelRadius);
      if (!meshHit) {
        continue;
      }
      const ends = this.resolveMeshEdgeWorldEnds(candidate, meshHit.edgeKey);
      if (!ends) {
        continue;
      }
      if (!this.isEdgeVisibleForPick(event, camera, pickElement, ends.a, ends.b, occluders)) {
        continue;
      }
      const distance = measureWorldSegmentScreenDistance(event, camera, pickElement, ends.a, ends.b);
      if (distance === null) {
        continue;
      }
      if (best && distance >= best.distance) {
        continue;
      }
      best = {
        distance,
        entry: { targetId: meshHit.targetId, kind: 'edge', componentKey: meshHit.edgeKey },
      };
    }
    for (const cage of this.brushCages) {
      for (const edge of cage.edges) {
        const a = cage.worldPositions[edge.vertexA];
        const b = cage.worldPositions[edge.vertexB];
        if (!a || !b) {
          continue;
        }
        if (!this.isEdgeVisibleForPick(event, camera, pickElement, a, b, occluders)) {
          continue;
        }
        const distance = measureWorldSegmentScreenDistance(event, camera, pickElement, a, b);
        if (distance === null || distance > pixelRadius) {
          continue;
        }
        if (best && distance >= best.distance) {
          continue;
        }
        best = {
          distance,
          entry: { targetId: cage.targetId, kind: 'edge', componentKey: edge.edgeKey },
        };
      }
    }
    return best?.entry ?? null;
  }

  /**
   * Returns whether the edge sample nearest the pointer is unoccluded.
   *
   * @param event Pointer event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @param worldA Edge start.
   * @param worldB Edge end.
   * @param occluders Domain occluder meshes.
   * @returns True when the edge may be selected.
   */
  private isEdgeVisibleForPick(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    worldA: THREE.Vector3,
    worldB: THREE.Vector3,
    occluders: readonly THREE.Mesh[],
  ): boolean {
    const sample =
      closestWorldPointOnSegmentToPointer(event, camera, pickElement, worldA, worldB) ??
      worldA.clone().add(worldB).multiplyScalar(0.5);
    return isWorldEdgeSampleUnoccluded(worldA, worldB, sample, camera, occluders);
  }

  /**
   * Resolves world endpoints for a mesh document edge key.
   *
   * @param candidate Mesh candidate.
   * @param edgeKey Undirected edge key.
   * @returns World endpoints, or null.
   */
  private resolveMeshEdgeWorldEnds(
    candidate: ComponentVertexPickCandidate,
    edgeKey: string,
  ): { a: THREE.Vector3; b: THREE.Vector3 } | null {
    const parts = edgeKey.split(':');
    const indexA = Number(parts[0]);
    const indexB = Number(parts[1]);
    if (!Number.isFinite(indexA) || !Number.isFinite(indexB)) {
      return null;
    }
    const worldPoints = this.collectMeshWorldVertices(candidate);
    const a = worldPoints[indexA];
    const b = worldPoints[indexB];
    if (!a || !b) {
      return null;
    }
    return { a, b };
  }

  /**
   * Collects domain meshes used as depth occluders for pick tests.
   *
   * @returns Occluder meshes.
   */
  private collectDomainOccluderMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const candidate of this.buildMeshPickCandidates()) {
      meshes.push(candidate.mesh);
    }
    for (const target of this.session.getDomain()) {
      if (target.kind !== 'brush') {
        continue;
      }
      if (target.resultMesh) {
        meshes.push(target.resultMesh);
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
   * Picks a domain face (mesh document or brush cage surface).
   *
   * @param event Event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Entry or null.
   */
  private pickFaceEntry(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): ComponentSelectionEntry | null {
    const meshEntry = this.pickContentMeshFaceEntry(event, camera, pickElement);
    if (meshEntry) {
      return meshEntry;
    }
    return this.pickBrushCageFaceEntry(event, camera, pickElement);
  }

  /**
   * Picks a face on an edit-domain content mesh document.
   *
   * @param event Event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Entry or null.
   */
  private pickContentMeshFaceEntry(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): ComponentSelectionEntry | null {
    const hit = pickComponentMeshDocumentFace(event, camera, pickElement, this.buildMeshPickCandidates());
    if (!hit) {
      return null;
    }
    return {
      targetId: hit.targetId,
      kind: 'face',
      componentKey: String(hit.faceIndex),
    };
  }

  /**
   * Picks a brush face from wing-edge cage geometry in the edit domain.
   *
   * @param event Event.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Entry or null.
   */
  private pickBrushCageFaceEntry(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): ComponentSelectionEntry | null {
    const hit = pickComponentBrushCageFace(event, camera, pickElement, this.brushCages);
    if (!hit) {
      return null;
    }
    return {
      targetId: hit.targetId,
      kind: 'face',
      componentKey: String(hit.faceIndex),
    };
  }

  /**
   * Builds mesh pick candidates from the domain.
   *
   * @returns Mesh document candidates.
   */
  private buildMeshPickCandidates(): ComponentVertexPickCandidate[] {
    const candidates: ComponentVertexPickCandidate[] = [];
    for (const target of this.session.getContentMeshTargets()) {
      const document = readBoundMeshEditDocument(target.mesh);
      if (!document) {
        continue;
      }
      candidates.push({ targetId: target.targetId, mesh: target.mesh, document });
    }
    return candidates;
  }

  /**
   * Builds cage mesh sources for overlay.
   *
   * @returns Cage mesh sources.
   */
  private buildCageMeshSources(): ComponentCageMeshSource[] {
    return this.buildMeshPickCandidates().map((candidate) => ({
      targetId: candidate.targetId,
      mesh: candidate.mesh,
      document: candidate.document,
    }));
  }

  /** Rebuilds brush wing-edge cages for the current domain. */
  private rebuildBrushCages(): void {
    this.brushCages = [];
    for (const target of this.session.getDomain()) {
      if (target.kind !== 'brush') {
        continue;
      }
      const instance = target.solidModel.findBrush(target.brushId);
      if (!instance) {
        continue;
      }
      this.brushCages.push(buildBrushEditCage(target.solidModel, instance, target.targetId));
    }
  }

  /**
   * Refreshes the cage overlay from selection.
   *
   * @param selected Current selection.
   */
  private refreshOverlay(selected: readonly ComponentSelectionEntry[]): void {
    if (!this.cageOverlay) {
      return;
    }
    this.cageOverlay.update(this.buildCageMeshSources(), this.brushCages, selected);
  }

  /** Ensures the cage overlay exists. */
  private ensureCageOverlay(): void {
    if (this.cageOverlay) {
      return;
    }
    this.cageOverlay = new ComponentEditCageOverlay(this.deps.getPrimaryScene());
  }

  /** Disposes the cage overlay. */
  private disposeCageOverlay(): void {
    this.cageOverlay?.dispose();
    this.cageOverlay = null;
  }

  /**
   * Finds a viewport under the pointer. Client coordinates are window-local;
   * when ownerDocument is set, only panes in that document match.
   *
   * @param clientX Client X.
   * @param clientY Client Y.
   * @param ownerDocument Optional document that owns the client coordinates.
   * @returns Viewport or null.
   */
  private findViewportAtClientPoint(
    clientX: number,
    clientY: number,
    ownerDocument: Document | null = null,
  ): EditModeViewportPickSurface | null {
    return findPickSurfaceAtClientPoint(
      this.deps.getViewports(),
      (viewport) => viewport.getContentElement(),
      clientX,
      clientY,
      ownerDocument,
    );
  }

  /**
   * Creates a synthetic mouse event for pick helpers.
   *
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns Synthetic event.
   */
  private createSyntheticMouseEvent(clientX: number, clientY: number): MouseEvent {
    return { clientX, clientY } as MouseEvent;
  }
}
