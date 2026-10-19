import { EditorToolId } from '@/types/editor_tool_id.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorInteractionMode, getEditorInteractionModeLabel } from '@/types/editor_interaction_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import {
  CLIP_PLANE_SESSION_KEY,
  EDIT_MODE_SESSION_KEY,
  OBJECT_TOOL_SESSION_KEY,
} from '@/tools/session/editor_tool_session_keys.js';
import {
  ViewportToolChromeHost,
  type ViewportToolChromeHandlers,
} from '@/tools/chrome/host/viewport_tool_chrome_host.js';
import { ViewportToolChromeHoverOwner } from '@/tools/chrome/focus/viewport_tool_chrome_hover_owner.js';
import type { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';
import type { GridAlignPickMode } from '@/tools/grid/grid_align_pick_mode.js';

/** Dependencies for coordinating per-pane tool chrome with editor modes. */
export interface ControllerViewportToolChromeDependencies {
  faceExtrusionController: ControllerFaceExtrusion;
  clipPlaneTool: ToolClipPlane;
  clipPlaneHandler: HandlerClipPlane;
  selectionManager: ManagerSelection;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  showStatusMessage: (message: string) => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
  isEditorToolBusy?: () => boolean;
  switchToClipTool?: () => boolean;
  switchToObjectSelect?: () => void;
  switchToFaceSelect?: () => void;
  switchToEditSelect?: () => void;
  /**
   * Attempts to open an Edit Mode session. Return false to cancel mode change
   * (e.g. empty selection).
   */
  onEnterEditMode?: () => boolean;
  /** Tears down the Edit Mode session when returning to Object Mode. */
  onExitEditMode?: () => void;
  /** Forwards component mode changes while Edit Mode is active. */
  onComponentMode?: (mode: EditorComponentMode) => void;
  /** Forces gizmo/rulers refresh after mode changes. */
  onEditModePresentationChanged?: () => void;
  /** Object → Apply bake for mesh/brush transforms. */
  onApplyObjectTransform?: (kind: ObjectApplyTransformKind) => void;
  /** Builds a convex brush around the selected brushes. */
  onConvexHull?: () => void;
  /** Starts the Edit Mode knife tool. */
  onEditKnife?: () => void;
  /** Starts the Edit Mode loop-cut tool. */
  onEditLoopCut?: () => void;
  /** Merges selected Edit Mode vertices. */
  onEditMerge?: (mode: import('@/edit/topology/topology_vertex_merge_mode.js').TopologyVertexMergeMode) => void;
  /** Dissolves the current Edit Mode component selection. */
  onEditDissolve?: () => void;
  /** Deletes the current Edit Mode component selection. */
  onEditDelete?: () => void;
  /** Switches the editor tool stack to the grid tool. */
  switchToGridTool?: () => void;
  /** Resets grid orientation only. */
  onGridReset?: () => void;
  /** Arms single-use face pick to align the grid only. */
  onGridAlignToFace?: () => void;
  /** Arms single-use edge pick to align one grid axis. */
  onGridAlignAxis?: (
    axis: import('@/navigation/orientation/editor_orientation_axis.js').EditorOrientationAxisId,
  ) => void;
  /** Arms single-use vertex pick to zero the grid lattice origin. */
  onGridOriginVertex?: () => void;
  /** Resets camera orientation only. */
  onCameraReset?: () => void;
  /** Arms single-use face pick to align the camera only. */
  onCameraAlignToFace?: () => void;
  /**
   * Refreshes gizmo / widget presentation after the primary rail tool changes
   * (e.g. hide bounds widgets while Grid is active).
   */
  onPrimaryToolChanged?: () => void;
}

/**
 * Coordinates Object / Face / Clip tools and Object Mode / Edit Mode across
 * per-pane viewport tool chrome hosts (rail and options bar).
 */
export class ControllerViewportToolChrome {
  private deps: ControllerViewportToolChromeDependencies;
  private activeTool: EditorToolId;
  private activeTransformMode: TransformMode;
  private activeInteractionMode: EditorInteractionMode;
  private activeComponentMode: EditorComponentMode;
  private activeGridPickMode: GridAlignPickMode;
  private readonly hosts: Set<ViewportToolChromeHost>;
  private readonly hostsByContainer: Map<HTMLElement, ViewportToolChromeHost>;
  private readonly hoverOwner: ViewportToolChromeHoverOwner;

  /**
   * Creates a viewport tool chrome controller.
   *
   * @param deps Shared tool systems and callbacks.
   */
  constructor(deps: ControllerViewportToolChromeDependencies) {
    this.deps = deps;
    this.activeTool = EditorToolId.OBJECT;
    this.activeTransformMode = TransformMode.BOUNDS;
    this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.activeGridPickMode = 'none';
    this.hosts = new Set();
    this.hostsByContainer = new Map();
    this.hoverOwner = new ViewportToolChromeHoverOwner();
    this.enableObjectToolOverlays();
  }

  /**
   * Highlights the armed single-use grid/camera options button across panes.
   *
   * @param mode Armed pick mode, or none when idle.
   */
  setActiveGridPickMode(mode: GridAlignPickMode): void {
    this.activeGridPickMode = mode;
    this.hosts.forEach((host) => {
      host.setActiveGridPickMode(mode);
    });
  }

  /**
   * Ensures every pane container has tool chrome attached.
   *
   * @param containers Live viewport pane hosts.
   */
  syncPaneContainers(containers: readonly HTMLElement[]): void {
    const live = new Set(containers);
    this.hostsByContainer.forEach((host, container) => {
      if (live.has(container)) {
        return;
      }
      this.detachHost(host);
    });
    containers.forEach((container) => {
      this.attachPane(container);
    });
  }

  /**
   * Attaches chrome to a pane container and registers it for broadcasts. No-ops
   * when the container is already attached.
   *
   * @param container Pane host element.
   * @returns Created or existing chrome host.
   */
  attachPane(container: HTMLElement): ViewportToolChromeHost {
    const existing = this.hostsByContainer.get(container);
    if (existing) {
      return existing;
    }
    const host = new ViewportToolChromeHost(container, this.buildHandlers(), (owned) => {
      this.hoverOwner.setOwner(owned);
    });
    this.hosts.add(host);
    this.hostsByContainer.set(container, host);
    this.hoverOwner.register(host);
    this.pushStateToHost(host);
    return host;
  }

  /**
   * Detaches and disposes chrome for a pane host.
   *
   * @param host Host previously returned by attachPane.
   */
  detachHost(host: ViewportToolChromeHost): void {
    this.hosts.delete(host);
    this.hostsByContainer.delete(host.getContainer());
    this.hoverOwner.unregister(host);
    host.dispose();
  }

  /**
   * Returns the active interactive tool.
   *
   * @returns Current EditorToolId.
   */
  getActiveTool(): EditorToolId {
    return this.activeTool;
  }

  /**
   * Returns the Blender-style Object Mode / Edit Mode state.
   *
   * @returns Current interaction mode.
   */
  getActiveInteractionMode(): EditorInteractionMode {
    return this.activeInteractionMode;
  }

  /**
   * Returns the active Edit Mode component mode.
   *
   * @returns Component mode.
   */
  getActiveComponentMode(): EditorComponentMode {
    return this.activeComponentMode;
  }

  /**
   * Returns whether the clip plane tool is active.
   *
   * @returns True when clip mode is live.
   */
  isClipToolActive(): boolean {
    return this.activeTool === EditorToolId.CLIP_PLANE && this.deps.clipPlaneTool.isActive();
  }

  /**
   * Sets Object Mode or Edit Mode and updates all pane chrome.
   *
   * @param mode Interaction mode to activate.
   */
  setInteractionMode(mode: EditorInteractionMode): void {
    if (this.deps.isEditorToolBusy?.()) {
      return;
    }
    if (this.activeInteractionMode === mode) {
      this.broadcastInteractionMode();
      return;
    }
    if (mode === EditorInteractionMode.EDIT_MODE) {
      this.enterEditMode();
      return;
    }
    this.enterObjectMode();
  }

  /**
   * Sets the Edit Mode component mode (vertex / edge / face).
   *
   * @param mode Component mode.
   */
  setComponentMode(mode: EditorComponentMode): void {
    if (this.activeInteractionMode !== EditorInteractionMode.EDIT_MODE) {
      return;
    }
    this.activeComponentMode = mode;
    this.broadcastComponentMode();
    this.deps.onComponentMode?.(mode);
  }

  /** Toggles between Object Mode and Edit Mode (Tab). */
  toggleInteractionMode(): void {
    if (this.activeInteractionMode === EditorInteractionMode.OBJECT_MODE) {
      this.setInteractionMode(EditorInteractionMode.EDIT_MODE);
      return;
    }
    this.setInteractionMode(EditorInteractionMode.OBJECT_MODE);
  }

  /**
   * Activates a tool from the rail or shortcuts.
   *
   * @param toolId Tool to activate.
   */
  selectTool(toolId: EditorToolId): void {
    if (this.deps.isEditorToolBusy?.()) {
      return;
    }
    if (this.activeInteractionMode === EditorInteractionMode.EDIT_MODE) {
      if (toolId === EditorToolId.FACE || toolId === EditorToolId.CLIP_PLANE || toolId === EditorToolId.GRID) {
        this.deps.showStatusMessage('Face Select, Clip, and Grid are Object Mode tools');
        return;
      }
      this.activateEditSelectTool();
      return;
    }
    if (toolId === EditorToolId.OBJECT) {
      this.activateObjectTool();
      return;
    }
    if (toolId === EditorToolId.FACE) {
      this.activateFaceTool();
      return;
    }
    if (toolId === EditorToolId.GRID) {
      this.activateGridTool();
      return;
    }
    this.activateClipTool();
  }

  /**
   * Syncs rail highlight when face/object selection mode changes externally
   * (keyboard shortcut or face coordinator).
   *
   * @param mode New selection mode.
   */
  onExternalSelectionModeChanged(mode: SelectionMode): void {
    if (this.activeInteractionMode === EditorInteractionMode.EDIT_MODE) {
      this.activateEditSelectTool();
      return;
    }
    this.endClipSessionIfActive();
    if (mode === SelectionMode.FACE) {
      this.clearObjectToolOverlays();
      if (this.activeTool !== EditorToolId.FACE) {
        this.activeTool = EditorToolId.FACE;
        this.deps.switchToFaceSelect?.();
      }
      this.broadcastActiveTool();
      this.refreshChromeContext();
      this.notifyPrimaryToolChanged();
      return;
    }
    if (this.activeTool !== EditorToolId.OBJECT) {
      this.activeTool = EditorToolId.OBJECT;
      this.deps.switchToObjectSelect?.();
    }
    this.enableObjectToolOverlays();
    this.broadcastActiveTool();
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
  }

  /**
   * Updates transform mode highlight on all panes.
   *
   * @param mode Active transform mode.
   */
  setActiveTransformMode(mode: TransformMode): void {
    this.activeTransformMode = mode;
    this.hosts.forEach((host) => {
      host.setActiveTransformMode(mode);
    });
  }

  /** Refreshes active tool highlight and clip enablement on all panes. */
  refreshChromeContext(): void {
    this.broadcastActiveTool();
    if (this.activeTool === EditorToolId.CLIP_PLANE) {
      this.broadcastClipEnabled(this.deps.clipPlaneTool.isPlaneReady());
      return;
    }
    this.broadcastClipEnabled(false);
  }

  /**
   * Refreshes tool chrome after clip or selection state changes. Named for
   * existing layout call sites.
   */
  refreshPaletteContext(): void {
    this.refreshChromeContext();
  }

  /** Disposes all attached hosts. */
  dispose(): void {
    this.hosts.forEach((host) => {
      host.dispose();
    });
    this.hosts.clear();
    this.hostsByContainer.clear();
    this.hoverOwner.clear();
  }

  /** Activates object selection mode. */
  private activateObjectTool(): void {
    this.endClipSessionIfActive();
    this.clearEditModeToolOverlays();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.activeTool = EditorToolId.OBJECT;
    this.broadcastActiveTool();
    this.deps.switchToObjectSelect?.();
    this.enableObjectToolOverlays();
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
    this.deps.showStatusMessage('Object select');
  }

  /** Keeps Edit Select active while Edit Mode is open. */
  private activateEditSelectTool(): void {
    this.endClipSessionIfActive();
    this.clearObjectToolOverlays();
    this.activeTool = EditorToolId.OBJECT;
    this.broadcastActiveTool();
    this.deps.switchToEditSelect?.();
    this.enableEditModeToolOverlays();
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
  }

  /** Activates face selection mode. */
  private activateFaceTool(): void {
    this.endClipSessionIfActive();
    this.clearObjectToolOverlays();
    this.clearEditModeToolOverlays();
    this.activeTool = EditorToolId.FACE;
    this.broadcastActiveTool();
    if (this.deps.switchToFaceSelect) {
      this.deps.switchToFaceSelect();
    } else {
      this.deps.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
    }
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
    this.deps.showStatusMessage('Face select');
  }

  /** Activates the global grid orientation tool. */
  private activateGridTool(): void {
    this.endClipSessionIfActive();
    this.clearObjectToolOverlays();
    this.clearEditModeToolOverlays();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.activeTool = EditorToolId.GRID;
    this.broadcastActiveTool();
    this.deps.switchToGridTool?.();
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
    this.deps.showStatusMessage('Grid tools');
  }

  /** Notifies layout that gizmo / widget presentation should refresh. */
  private notifyPrimaryToolChanged(): void {
    this.deps.onPrimaryToolChanged?.();
  }

  /** Opts into CAD rulers and transform gizmos for Object Select presentation. */
  private enableObjectToolOverlays(): void {
    this.deps.editorOverlayPolicy.enable(EditorOverlayId.CAD_BOUNDS_RULERS, OBJECT_TOOL_SESSION_KEY);
    this.deps.editorOverlayPolicy.enable(EditorOverlayId.TRANSFORM_GIZMOS, OBJECT_TOOL_SESSION_KEY);
  }

  /** Releases Object Select overlay ownership. */
  private clearObjectToolOverlays(): void {
    this.deps.editorOverlayPolicy.release(EditorOverlayId.CAD_BOUNDS_RULERS, OBJECT_TOOL_SESSION_KEY);
    this.deps.editorOverlayPolicy.release(EditorOverlayId.TRANSFORM_GIZMOS, OBJECT_TOOL_SESSION_KEY);
  }

  /** Opts into transform gizmos for Edit Mode component widgets (no CAD rulers). */
  private enableEditModeToolOverlays(): void {
    this.deps.editorOverlayPolicy.enable(EditorOverlayId.TRANSFORM_GIZMOS, EDIT_MODE_SESSION_KEY);
  }

  /** Releases Edit Mode overlay ownership. */
  private clearEditModeToolOverlays(): void {
    this.deps.editorOverlayPolicy.release(EditorOverlayId.TRANSFORM_GIZMOS, EDIT_MODE_SESSION_KEY);
  }

  /** Activates the clip plane tool when a mesh is selected. */
  private activateClipTool(): void {
    const selected = this.deps.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) {
      this.deps.showStatusMessage('Select a mesh to clip');
      return;
    }
    this.clearObjectToolOverlays();
    this.clearEditModeToolOverlays();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.beginClipSession();
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
  }

  /** Starts the clip modal session. */
  private beginClipSession(): void {
    const switched = this.deps.switchToClipTool?.() === true;
    if (!switched) {
      this.deps.clipPlaneTool.activate();
    }
    this.activeTool = EditorToolId.CLIP_PLANE;
    this.broadcastActiveTool();
    this.deps.modalToolSessionRegistry.register({
      id: CLIP_PLANE_SESSION_KEY,
      endsOnSelectionChange: true,
      end: () => this.onClipSessionEndedBySelection(),
    });
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
  }

  /** Ends clip when selection changes externally. */
  private onClipSessionEndedBySelection(): void {
    if (this.activeTool !== EditorToolId.CLIP_PLANE && !this.deps.clipPlaneTool.isActive()) {
      return;
    }
    this.deps.modalToolSessionRegistry.unregister(CLIP_PLANE_SESSION_KEY);
    this.deps.clipPlaneHandler.cancel();
    this.deps.switchToObjectSelect?.();
    this.activeTool = EditorToolId.OBJECT;
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.enableObjectToolOverlays();
    this.broadcastActiveTool();
    this.refreshChromeContext();
    this.notifyPrimaryToolChanged();
    this.deps.showStatusMessage('Clip cancelled · selection changed');
  }

  /** Ends the clip session when leaving clip. */
  private endClipSessionIfActive(): void {
    const clipLive =
      this.activeTool === EditorToolId.CLIP_PLANE ||
      this.deps.clipPlaneTool.isActive() ||
      this.deps.modalToolSessionRegistry.has(CLIP_PLANE_SESSION_KEY);
    if (!clipLive) {
      return;
    }
    this.deps.modalToolSessionRegistry.unregister(CLIP_PLANE_SESSION_KEY);
    if (this.deps.clipPlaneTool.isActive()) {
      this.deps.clipPlaneTool.deactivate();
    }
    this.deps.switchToObjectSelect?.();
  }

  /**
   * Builds handlers bound to this controller.
   *
   * @returns Chrome handlers.
   */
  private buildHandlers(): ViewportToolChromeHandlers {
    return {
      onSelectTool: (toolId) => this.selectTool(toolId),
      onTransformMode: (mode) => this.deps.onTransformMode(mode),
      onFlipClipPlane: () => this.deps.clipPlaneHandler.flipPlane(),
      onCommitClip: () => this.deps.clipPlaneHandler.commitClip(),
      onCommitSplit: () => this.deps.clipPlaneHandler.commitSplit(),
      onOpenUvEditor: () => this.deps.onOpenUvEditor(),
      onExtrudeFaces: () => this.deps.onExtrudeFaces(),
      onGridReset: () => this.deps.onGridReset?.(),
      onGridAlignToFace: () => this.deps.onGridAlignToFace?.(),
      onGridAlignAxis: (axis) => this.deps.onGridAlignAxis?.(axis),
      onGridOriginVertex: () => this.deps.onGridOriginVertex?.(),
      onCameraReset: () => this.deps.onCameraReset?.(),
      onCameraAlignToFace: () => this.deps.onCameraAlignToFace?.(),
      onInteractionMode: (mode) => this.setInteractionMode(mode),
      onComponentMode: (mode) => this.setComponentMode(mode),
      onApplyObjectTransform: (kind) => this.deps.onApplyObjectTransform?.(kind),
      onConvexHull: () => this.deps.onConvexHull?.(),
      onEditKnife: () => this.deps.onEditKnife?.(),
      onEditLoopCut: () => this.deps.onEditLoopCut?.(),
      onEditMerge: (mode) => this.deps.onEditMerge?.(mode),
      onEditDissolve: () => this.deps.onEditDissolve?.(),
      onEditDelete: () => this.deps.onEditDelete?.(),
    };
  }

  /**
   * Pushes full UI state to one host.
   *
   * @param host Target host.
   */
  private pushStateToHost(host: ViewportToolChromeHost): void {
    host.setHandlers(this.buildHandlers());
    host.setActiveTool(this.activeTool);
    host.setActiveTransformMode(this.activeTransformMode);
    host.setActiveInteractionMode(this.activeInteractionMode);
    host.setActiveComponentMode(this.activeComponentMode);
    host.setActiveGridPickMode(this.activeGridPickMode);
    this.refreshChromeContext();
  }

  /** Broadcasts active tool to all hosts. */
  private broadcastActiveTool(): void {
    this.hosts.forEach((host) => {
      host.setActiveTool(this.activeTool);
    });
  }

  /** Broadcasts Object Mode / Edit Mode to all hosts. */
  private broadcastInteractionMode(): void {
    this.hosts.forEach((host) => {
      host.setActiveInteractionMode(this.activeInteractionMode);
    });
  }

  /** Broadcasts Edit Mode component mode to all hosts. */
  private broadcastComponentMode(): void {
    this.hosts.forEach((host) => {
      host.setActiveComponentMode(this.activeComponentMode);
    });
  }

  /**
   * Broadcasts clip action enablement.
   *
   * @param enabled Whether clip actions are enabled.
   */
  private broadcastClipEnabled(enabled: boolean): void {
    this.hosts.forEach((host) => {
      host.setClipActionsEnabled(enabled);
    });
  }

  /** Enters Object Mode and restores object-select chrome. */
  private enterObjectMode(): void {
    this.endClipSessionIfActive();
    this.clearEditModeToolOverlays();
    this.deps.onExitEditMode?.();
    this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.activeTool = EditorToolId.OBJECT;
    this.broadcastInteractionMode();
    this.broadcastComponentMode();
    this.enableObjectToolOverlays();
    this.refreshChromeContext();
    this.deps.switchToObjectSelect?.();
    this.deps.onEditModePresentationChanged?.();
    this.notifyPrimaryToolChanged();
    this.deps.showStatusMessage(getEditorInteractionModeLabel(EditorInteractionMode.OBJECT_MODE));
  }

  /** Enters Edit Mode when a domain session can open. */
  private enterEditMode(): void {
    this.endClipSessionIfActive();
    this.clearObjectToolOverlays();
    const opened = this.deps.onEnterEditMode?.() !== false;
    if (!opened) {
      this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
      this.enableObjectToolOverlays();
      this.broadcastInteractionMode();
      this.refreshChromeContext();
      this.notifyPrimaryToolChanged();
      return;
    }
    this.activeInteractionMode = EditorInteractionMode.EDIT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.enableEditModeToolOverlays();
    this.broadcastInteractionMode();
    this.broadcastComponentMode();
    this.refreshChromeContext();
    this.deps.switchToEditSelect?.();
    this.deps.onEditModePresentationChanged?.();
    this.notifyPrimaryToolChanged();
  }
}
