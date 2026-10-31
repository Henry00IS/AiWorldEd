import type { Vector2 } from 'three';
import { HandlerHingeAlign } from './handler_hinge_align.js';
import { buildSnapAlignCache } from './snap_align_cache.js';
import { ToolSnapAlignBase } from './tool_snap_align_base.js';

/** Single-use tool that rotates around a picked edge. */
export class ToolHingeAlign extends ToolSnapAlignBase {
  private handler: HandlerHingeAlign | null;

  /** Creates the hinge tool. */
  constructor() {
    super();
    this.handler = null;
  }

  /** Starts the hinge session. */
  override onActivate(): void {
    this.handler = null;
    const host = this.readHost();
    if (!host) {
      return;
    }
    this.openAlignChrome('hinge');
    this.handler = new HandlerHingeAlign(host, buildSnapAlignCache(host.worldObject));
    this.handler.arm();
  }

  /** Cancels a still-armed session when the tool is left. */
  override onDeactivate(): void {
    if (this.handler?.isArmed()) {
      this.handler.cancel();
    }
    this.handler = null;
    this.closeAlignChrome();
  }

  /**
   * Previews the hinge rotation.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    this.sampleHover();
  }

  /**
   * Stores the hinge, or commits the preview.
   *
   * @param button Mouse button.
   */
  override onMouseDown(button: number): void {
    if (button !== 0) {
      return;
    }
    this.sampleClick();
  }

  /** Restores the start poses. */
  protected cancelSession(): void {
    this.handler?.cancel();
  }

  /** Updates the preview from the editor pointer. */
  private sampleHover(): void {
    const editor = this.editor;
    if (!editor || !this.handler) {
      return;
    }
    this.handler.updateHover(editor.lastPointerClientX, editor.lastPointerClientY, editor.lastPointerOwnerDocument);
  }

  /** Forwards a click and returns to the parent when the session finishes. */
  private sampleClick(): void {
    const editor = this.editor;
    if (!editor || !this.handler) {
      return;
    }
    this.handler.tryClick(editor.lastPointerClientX, editor.lastPointerClientY, editor.lastPointerOwnerDocument);
    if (!this.handler.isArmed()) {
      this.returnToParent();
    }
  }
}
