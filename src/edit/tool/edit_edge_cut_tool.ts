import type { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { OverlayEdgeCutPreview } from '@/edit/overlay/overlay_edge_cut_preview.js';
import type { EditEdgeParameterHit } from '@/edit/pick/edit_edge_parameter_pick.js';

/** Single-use knife tool: hover an edge and click to insert a vertex. */
export class EditEdgeCutTool extends Tool {
  private preview: OverlayEdgeCutPreview | null;
  private hoverHit: EditEdgeParameterHit | null;
  private finished: boolean;

  /** Creates the knife tool. */
  constructor() {
    super();
    this.preview = null;
    this.hoverHit = null;
    this.finished = false;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.finished = false;
    this.hoverHit = null;
    this.editor?.getServices()?.setStatusMessage('Knife: click an edge to add a vertex · Esc cancels');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.disposePreview();
    this.hoverHit = null;
  }

  /**
   * Returns whether the knife still owns input.
   *
   * @returns True until the cut is committed or cancelled.
   */
  override isBusy(): boolean {
    return this.isSingleUse && !this.finished;
  }

  /** Called each frame to refresh the hover caret. */
  override onRender(): void {
    this.refreshHoverFromEditorPointer();
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || this.finished) {
      return;
    }
    this.commitHoverHit();
  }

  /**
   * Called when the tool receives a key.
   *
   * @param keyCode Key code.
   * @param _event Keyboard event.
   * @returns True when handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (keyCode !== 'Escape') {
      return false;
    }
    this.finished = true;
    this.editor?.switchTool(this.parent ?? this);
    return true;
  }

  /**
   * Unused mouse move hook; hover is sampled from the editor pointer in render.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /** Samples the current editor pointer and updates the caret. */
  private refreshHoverFromEditorPointer(): void {
    if (!this.editor) {
      return;
    }
    const hit = this.editor
      .getServices()
      ?.pickEditEdgeParameter?.(
        this.editor.lastPointerClientX,
        this.editor.lastPointerClientY,
        this.editor.lastPointerOwnerDocument,
      );
    this.hoverHit = hit ?? null;
    this.updatePreview(hit ?? null);
  }

  /**
   * Shows or hides the caret for a hit.
   *
   * @param hit Hover hit, or null.
   */
  private updatePreview(hit: EditEdgeParameterHit | null): void {
    if (!hit) {
      this.preview?.clearHover();
      return;
    }
    const camera = this.editor?.getServices()?.getActiveCamera();
    if (!camera) {
      return;
    }
    const preview = this.ensurePreview();
    if (!preview) {
      return;
    }
    preview.setHover(hit.worldPoint, hit.edgeDirection, camera);
  }

  /** Commits the hovered edge split. */
  private commitHoverHit(): void {
    const hit = this.hoverHit;
    const services = this.editor?.getServices();
    if (!hit || !services?.splitEditEdge) {
      services?.setStatusMessage('Click an edge to add a vertex');
      return;
    }
    services.splitEditEdge(hit.targetId, hit.vertexA, hit.vertexB, hit.parameter);
    this.finished = true;
    this.editor?.switchTool(this.parent ?? this);
  }

  /**
   * Ensures the caret overlay exists.
   *
   * @returns Preview, or null.
   */
  private ensurePreview(): OverlayEdgeCutPreview | null {
    if (this.preview) {
      return this.preview;
    }
    const scene = this.editor?.getServices()?.getPrimaryScene?.();
    if (!scene) {
      return null;
    }
    this.preview = new OverlayEdgeCutPreview(scene);
    return this.preview;
  }

  /** Disposes the caret overlay. */
  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }
}
