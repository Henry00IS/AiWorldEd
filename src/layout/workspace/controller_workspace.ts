import type { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import {
  attachCamerasToSerializedLayout,
  restoreCamerasFromSerializedLayout,
  type SerializedAreaLayout,
} from '@/layout/area/area_layout_serializer.js';
import type { ViewportRegistry } from '@/layout/viewport/viewport_registry.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';
import {
  applyViewportCameraSnapshot,
  captureViewportCameraSnapshot,
} from '@/viewports/core/viewport_camera_snapshot.js';
import { WorkspaceStore } from './workspace_store.js';
import { workspaceIdForPaneCount } from './workspace_definition.js';
import type { WorkspaceDefinition } from './workspace_definition.js';

/** Host callbacks for applying a workspace to live panes. */
export interface WorkspaceControllerHost {
  /**
   * Creates a pane for an area that is not yet in the registry.
   *
   * @param areaId Area id.
   * @param container Host element.
   * @param viewportKind Viewport kind.
   */
  onAreaAdded(areaId: string, container: HTMLElement, viewportKind: ViewportKind): void;

  /**
   * Removes a registry pane.
   *
   * @param areaId Area id.
   */
  onAreaRemoved(areaId: string): void;

  /**
   * Updates an existing pane when the applied layout has a different viewport
   * kind for the same area id.
   *
   * @param areaId Area id.
   * @param viewportKind Kind from the layout document.
   */
  onAreaKindChanged(areaId: string, viewportKind: ViewportKind): void;

  /** Full structure rewire after workspace apply. */
  onStructureChanged(): void;
}

/** Applies named workspaces to the area layout and keeps the store in sync. */
export class ControllerWorkspace {
  private readonly store: WorkspaceStore;
  private readonly areaController: ControllerAreaLayout;
  private readonly registry: ViewportRegistry;
  private readonly host: WorkspaceControllerHost;

  /**
   * Creates a workspace controller.
   *
   * @param store Workspace persistence store.
   * @param areaController Area layout controller.
   * @param registry Viewport registry.
   * @param host Structure mutation host.
   */
  constructor(
    store: WorkspaceStore,
    areaController: ControllerAreaLayout,
    registry: ViewportRegistry,
    host: WorkspaceControllerHost,
  ) {
    this.store = store;
    this.areaController = areaController;
    this.registry = registry;
    this.host = host;
  }

  /**
   * Returns the backing store.
   *
   * @returns Workspace store.
   */
  getStore(): WorkspaceStore {
    return this.store;
  }

  /**
   * Applies the active workspace from the store.
   *
   * @param options.restoreCameras When true, restores per-pane cameras saved on
   *   the workspace. When false, keeps default camera poses.
   */
  applyActiveWorkspace(options: { restoreCameras?: boolean } = {}): void {
    const active = this.store.getActiveWorkspace();
    if (!active) return;
    this.applyWorkspace(active, options);
  }

  /**
   * Switches to a workspace by id, saving the current layout first. No-ops when
   * the requested id is already active.
   *
   * @param workspaceId Target workspace id.
   * @returns True when the active workspace is the requested id.
   */
  switchTo(workspaceId: string): boolean {
    if (this.store.getActiveWorkspaceId() === workspaceId) {
      return true;
    }
    this.persistCurrentIntoActive();
    if (!this.store.setActiveWorkspaceId(workspaceId)) return false;
    this.applyActiveWorkspace({ restoreCameras: true });
    return true;
  }

  /**
   * Adds a workspace cloned from the current layout and switches to it.
   *
   * @param name Display name.
   * @returns Created workspace.
   */
  addFromCurrent(name: string): WorkspaceDefinition {
    this.persistCurrentIntoActive();
    const created = this.store.addWorkspace(name, this.captureLayoutWithCameras());
    this.applyActiveWorkspace({ restoreCameras: true });
    return created;
  }

  /**
   * Adds a workspace from a preset template (name + layout) and switches to it.
   *
   * @param template Preset workspace definition.
   * @returns Created workspace.
   */
  addFromPreset(template: WorkspaceDefinition): WorkspaceDefinition {
    this.persistCurrentIntoActive();
    const created = this.store.addWorkspace(template.name, template.layout);
    this.applyActiveWorkspace({ restoreCameras: true });
    return created;
  }

  /**
   * Deletes a workspace when more than one remains.
   *
   * @param workspaceId Target id.
   * @returns True when deleted.
   */
  deleteWorkspace(workspaceId: string): boolean {
    const wasActive = this.store.getActiveWorkspaceId() === workspaceId;
    if (!this.store.deleteWorkspace(workspaceId)) return false;
    if (wasActive) this.applyActiveWorkspace({ restoreCameras: true });
    return true;
  }

  /**
   * Renames a workspace tab without changing its layout.
   *
   * @param workspaceId Target workspace id.
   * @param name New display name.
   * @returns True when the rename applied.
   */
  renameWorkspace(workspaceId: string, name: string): boolean {
    return this.store.renameWorkspace(workspaceId, name);
  }

  /**
   * Reorders a workspace tab to a new index.
   *
   * @param workspaceId Workspace to move.
   * @param toIndex Destination index.
   * @returns True when the order changed.
   */
  moveWorkspace(workspaceId: string, toIndex: number): boolean {
    return this.store.moveWorkspace(workspaceId, toIndex);
  }

  /**
   * Sets the active workspace from a pane count and applies it without
   * restoring cameras.
   *
   * @param paneCount Pane count 1–4.
   */
  applyPaneCountMigration(paneCount: 1 | 2 | 3 | 4): void {
    const id = workspaceIdForPaneCount(paneCount);
    this.store.setActiveWorkspaceId(id);
    this.applyActiveWorkspace({ restoreCameras: false });
  }

  /** Writes the current tree and live camera poses into the active workspace. */
  persistCurrentIntoActive(): void {
    const activeId = this.store.getActiveWorkspaceId();
    this.store.updateWorkspaceLayout(activeId, this.captureLayoutWithCameras());
  }

  /**
   * Serializes the area tree and attaches each pane's camera snapshot.
   *
   * @returns Layout document ready for storage.
   */
  private captureLayoutWithCameras(): SerializedAreaLayout {
    const layout = this.areaController.serialize();
    return attachCamerasToSerializedLayout(layout, (areaId) => {
      const viewport = this.registry.getPaneById(areaId)?.getViewport();
      if (!viewport) return null;
      return captureViewportCameraSnapshot(viewport);
    });
  }

  /**
   * Applies a workspace definition: load tree, reconcile registry panes, and
   * optionally restore remembered camera poses.
   *
   * @param workspace Workspace to apply.
   * @param options.restoreCameras Restore saved cameras when true.
   */
  private applyWorkspace(workspace: WorkspaceDefinition, options: { restoreCameras?: boolean } = {}): void {
    if (!this.areaController.loadSerialized(workspace.layout)) return;
    this.reconcileRegistryToPlacements();
    if (options.restoreCameras === true) {
      this.restoreCamerasFromLayout(workspace.layout);
    }
    this.host.onStructureChanged();
  }

  /**
   * Restores per-pane cameras from a serialized layout after panes exist.
   *
   * @param layout Layout document that may include camera snapshots.
   */
  private restoreCamerasFromLayout(layout: SerializedAreaLayout): void {
    restoreCamerasFromSerializedLayout(layout, (areaId, camera) => {
      const viewport = this.registry.getPaneById(areaId)?.getViewport();
      if (!viewport) return;
      applyViewportCameraSnapshot(viewport, camera);
    });
  }

  /**
   * Adds missing panes, removes registry panes not present in the layout, and
   * updates viewport kinds when the layout document differs from live panes.
   */
  private reconcileRegistryToPlacements(): void {
    const placements = listAreaLeafPlacements(this.areaController.getRoot());
    this.removeRegistryPanesMissingFromPlacements(placements);
    this.ensureRegistryPanesForPlacements(placements);
  }

  /**
   * Removes live registry panes whose area ids are gone from the layout tree.
   *
   * @param placements Current leaf placements.
   */
  private removeRegistryPanesMissingFromPlacements(placements: ReturnType<typeof listAreaLeafPlacements>): void {
    const liveIds = new Set(placements.map((item) => item.payload.areaId));
    for (const pane of [...this.registry.getPanes()]) {
      if (!liveIds.has(pane.getId())) {
        this.host.onAreaRemoved(pane.getId());
      }
    }
  }

  /**
   * Creates missing panes and updates kinds for existing placement areas.
   *
   * @param placements Current leaf placements.
   */
  private ensureRegistryPanesForPlacements(placements: ReturnType<typeof listAreaLeafPlacements>): void {
    for (const placement of placements) {
      this.ensureRegistryPaneForPlacement(placement);
    }
  }

  /**
   * Ensures one placement has a matching registry pane and viewport kind.
   *
   * @param placement Leaf placement from the area tree.
   */
  private ensureRegistryPaneForPlacement(placement: ReturnType<typeof listAreaLeafPlacements>[number]): void {
    const kind = placement.payload.viewportKind;
    if (!kind) return;
    const areaId = placement.payload.areaId;
    const existing = this.registry.getPaneById(areaId);
    if (!existing) {
      const container = this.areaController.getLayoutDom().getContainer(areaId);
      if (!container) return;
      this.host.onAreaAdded(areaId, container, kind);
      return;
    }
    if (existing.getKind() !== kind) {
      this.host.onAreaKindChanged(areaId, kind);
    }
  }
}
