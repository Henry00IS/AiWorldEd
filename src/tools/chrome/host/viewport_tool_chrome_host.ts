import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { ViewportToolRail } from '@/tools/chrome/rail/viewport_tool_rail.js';
import {
  ViewportToolOptionsBar,
  type ViewportToolOptionsBarHandlers,
} from '@/tools/chrome/options/viewport_tool_options_bar.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/** Combined handlers for rail and options bar. */
export interface ViewportToolChromeHandlers extends ViewportToolOptionsBarHandlers {
  onSelectTool: (toolId: EditorToolId) => void;
}

/**
 * Per-pane tool chrome: top options bar under the title toolbar, and a floating
 * left tool rail. Both are shown only while this pane owns hover. Surfaces are
 * registered as pointer-block chrome so the editor input bridge does not treat
 * clicks on them as exclusive viewport hits (same path as menus / floating
 * panels).
 */
export class ViewportToolChromeHost {
  private readonly container: HTMLElement;
  private readonly rail: ViewportToolRail;
  private readonly optionsBar: ViewportToolOptionsBar;
  private readonly onPointerEnter: () => void;
  private hoverOwned: boolean;

  /**
   * Creates chrome for one viewport pane container.
   *
   * @param container Pane host element (owns toolbar + content).
   * @param handlers Tool and action callbacks.
   * @param onHoverOwned Callback when the pointer enters this pane.
   */
  constructor(
    container: HTMLElement,
    handlers: ViewportToolChromeHandlers,
    onHoverOwned: (host: ViewportToolChromeHost) => void,
  ) {
    this.container = container;
    this.hoverOwned = false;
    this.optionsBar = new ViewportToolOptionsBar(container, {
      onTransformMode: (mode) => handlers.onTransformMode(mode),
      onFlipClipPlane: () => handlers.onFlipClipPlane(),
      onCommitClip: () => handlers.onCommitClip(),
      onCommitSplit: () => handlers.onCommitSplit(),
      onOpenUvEditor: () => handlers.onOpenUvEditor(),
      onExtrudeFaces: () => handlers.onExtrudeFaces(),
      onGridReset: () => handlers.onGridReset(),
      onGridAlignToFace: () => handlers.onGridAlignToFace(),
      onGridAlignAxis: (axis) => handlers.onGridAlignAxis(axis),
      onGridOriginVertex: () => handlers.onGridOriginVertex(),
      onCameraReset: () => handlers.onCameraReset(),
      onCameraAlignToFace: () => handlers.onCameraAlignToFace(),
      onInteractionMode: (mode) => handlers.onInteractionMode(mode),
      onComponentMode: (mode) => handlers.onComponentMode(mode),
      onApplyObjectTransform: (kind) => handlers.onApplyObjectTransform?.(kind),
      onConvexHull: () => handlers.onConvexHull?.(),
      onEditKnife: () => handlers.onEditKnife?.(),
      onEditLoopCut: () => handlers.onEditLoopCut?.(),
      onEditMerge: (mode) => handlers.onEditMerge?.(mode),
      onEditDissolve: () => handlers.onEditDissolve?.(),
      onEditDelete: () => handlers.onEditDelete?.(),
    });
    this.rail = new ViewportToolRail(container, {
      onSelectTool: (toolId) => handlers.onSelectTool(toolId),
    });
    this.registerPointerBlockSurfaces();
    this.onPointerEnter = () => {
      onHoverOwned(this);
    };
    this.container.addEventListener('pointerenter', this.onPointerEnter);
    this.setHoverOwned(false);
  }

  /**
   * Replaces handlers on rail and options bar.
   *
   * @param handlers New handlers.
   */
  setHandlers(handlers: ViewportToolChromeHandlers): void {
    this.rail.setHandlers({ onSelectTool: (toolId) => handlers.onSelectTool(toolId) });
    this.optionsBar.setHandlers({
      onTransformMode: (mode) => handlers.onTransformMode(mode),
      onFlipClipPlane: () => handlers.onFlipClipPlane(),
      onCommitClip: () => handlers.onCommitClip(),
      onCommitSplit: () => handlers.onCommitSplit(),
      onOpenUvEditor: () => handlers.onOpenUvEditor(),
      onExtrudeFaces: () => handlers.onExtrudeFaces(),
      onGridReset: () => handlers.onGridReset(),
      onGridAlignToFace: () => handlers.onGridAlignToFace(),
      onGridAlignAxis: (axis) => handlers.onGridAlignAxis(axis),
      onGridOriginVertex: () => handlers.onGridOriginVertex(),
      onCameraReset: () => handlers.onCameraReset(),
      onCameraAlignToFace: () => handlers.onCameraAlignToFace(),
      onInteractionMode: (mode) => handlers.onInteractionMode(mode),
      onComponentMode: (mode) => handlers.onComponentMode(mode),
      onApplyObjectTransform: (kind) => handlers.onApplyObjectTransform?.(kind),
      onConvexHull: () => handlers.onConvexHull?.(),
      onEditKnife: () => handlers.onEditKnife?.(),
      onEditLoopCut: () => handlers.onEditLoopCut?.(),
      onEditMerge: (mode) => handlers.onEditMerge?.(mode),
      onEditDissolve: () => handlers.onEditDissolve?.(),
      onEditDelete: () => handlers.onEditDelete?.(),
    });
  }

  /**
   * Updates the highlighted tool on this pane.
   *
   * @param toolId Active tool.
   */
  setActiveTool(toolId: EditorToolId): void {
    this.rail.setActiveTool(toolId);
    this.optionsBar.setActiveTool(toolId);
  }

  /**
   * Highlights the armed single-use grid/camera options button.
   *
   * @param mode Armed pick mode, or none when idle.
   */
  setActiveGridPickMode(mode: import('@/tools/grid/grid_align_pick_mode.js').GridAlignPickMode): void {
    this.optionsBar.setActiveGridPickMode(mode);
  }

  /**
   * Updates transform mode highlight.
   *
   * @param mode Transform mode.
   */
  setActiveTransformMode(mode: TransformMode): void {
    this.optionsBar.setActiveTransformMode(mode);
  }

  /**
   * Updates the Object Mode / Edit Mode control.
   *
   * @param mode Interaction mode.
   */
  setActiveInteractionMode(mode: EditorInteractionMode): void {
    this.optionsBar.setActiveInteractionMode(mode);
    const showObjectOnly = mode === EditorInteractionMode.EDIT_MODE;
    this.rail.setToolButtonVisible(EditorToolId.OBJECT, true);
    this.rail.setToolButtonVisible(EditorToolId.FACE, !showObjectOnly);
    this.rail.setToolButtonVisible(EditorToolId.CLIP_PLANE, !showObjectOnly);
    this.rail.setToolButtonVisible(EditorToolId.GRID, !showObjectOnly);
  }

  /**
   * Updates the Edit Mode component mode highlight.
   *
   * @param mode Component mode.
   */
  setActiveComponentMode(mode: EditorComponentMode): void {
    this.optionsBar.setActiveComponentMode(mode);
  }

  /**
   * Enables or disables clip actions.
   *
   * @param enabled Whether clip actions are available.
   */
  setClipActionsEnabled(enabled: boolean): void {
    this.optionsBar.setClipActionsEnabled(enabled);
  }

  /**
   * Shows floating rail and top options bar only when this pane owns hover.
   *
   * @param owned True when this pane owns hover.
   */
  setHoverOwned(owned: boolean): void {
    this.hoverOwned = owned;
    this.rail.setVisible(owned);
    this.optionsBar.setVisible(owned);
  }

  /**
   * Returns whether this host is hover-owned.
   *
   * @returns Hover owned flag.
   */
  isHoverOwned(): boolean {
    return this.hoverOwned;
  }

  /**
   * Returns the pane container for this chrome.
   *
   * @returns Container element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /** Disposes rail, options bar, and listeners. */
  dispose(): void {
    this.container.removeEventListener('pointerenter', this.onPointerEnter);
    this.unregisterPointerBlockSurfaces();
    this.optionsBar.dispose();
    this.rail.dispose();
  }

  /**
   * Registers chrome roots so EditorInputBridge skips viewport routing for
   * clicks on tool buttons (same contract as open menus).
   */
  private registerPointerBlockSurfaces(): void {
    FloatingPanelStack.registerPointerBlockSurface(this.rail.getElement());
    FloatingPanelStack.registerPointerBlockSurface(this.optionsBar.getElement());
  }

  /** Unregisters chrome roots from the pointer-block set. */
  private unregisterPointerBlockSurfaces(): void {
    FloatingPanelStack.unregisterPointerBlockSurface(this.rail.getElement());
    FloatingPanelStack.unregisterPointerBlockSurface(this.optionsBar.getElement());
  }
}
