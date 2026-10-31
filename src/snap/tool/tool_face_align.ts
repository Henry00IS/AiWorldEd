import type { Vector2 } from 'three';
import { HandlerFaceAlign, type FaceAlignMode } from './handler_face_align.js';
import { buildSnapAlignCache } from './snap_align_cache.js';
import type { SnapAlignChromeId } from './snap_align_chrome_id.js';
import { ToolSnapAlignBase } from './tool_snap_align_base.js';

/** Single-use face session shared by Face Align and Seat. */
export class ToolFaceSession extends ToolSnapAlignBase {
  private handler: HandlerFaceAlign | null;
  private readonly mode: FaceAlignMode;

  /**
   * Creates a face session tool.
   *
   * @param mode Align rotates. Seat only slides.
   */
  constructor(mode: FaceAlignMode) {
    super();
    this.mode = mode;
    this.handler = null;
  }

  /** Starts the two-click session. */
  override onActivate(): void {
    this.handler = null;
    const host = this.readHost();
    if (!host) {
      return;
    }
    this.openAlignChrome(chromeIdForMode(this.mode));
    this.handler = new HandlerFaceAlign(host, this.mode, buildSnapAlignCache(host.worldObject));
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
   * Previews the second-face result.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    this.sampleHover();
  }

  /**
   * Stores the source face, or commits the target face.
   *
   * @param button Mouse button.
   */
  override onMouseDown(button: number): void {
    if (button !== 0) {
      return;
    }
    this.sampleClick();
  }

  /** Restores the start pose. */
  protected cancelSession(): void {
    this.handler?.cancel();
  }

  /** Updates the hover from the editor pointer. */
  private sampleHover(): void {
    const pointer = this.currentPointer();
    if (!pointer || !this.handler) {
      return;
    }
    this.handler.updateHover(pointer.x, pointer.y, pointer.owner);
  }

  /** Forwards a click and returns to the parent when the session finishes. */
  private sampleClick(): void {
    const pointer = this.currentPointer();
    if (!pointer || !this.handler) {
      return;
    }
    this.handler.tryClick(pointer.x, pointer.y, pointer.owner);
    if (!this.handler.isArmed()) {
      this.returnToParent();
    }
  }

  /**
   * Reads the last editor pointer.
   *
   * @returns Client point and document, or null.
   */
  private currentPointer(): { x: number; y: number; owner: Document | null } | null {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    return {
      x: editor.lastPointerClientX,
      y: editor.lastPointerClientY,
      owner: editor.lastPointerOwnerDocument,
    };
  }
}

/**
 * Maps a face session mode to its options-bar highlight.
 *
 * @param mode Align rotates. Seat only slides.
 * @returns Chrome id.
 */
function chromeIdForMode(mode: FaceAlignMode): SnapAlignChromeId {
  if (mode === 'seat') {
    return 'seat';
  }
  return 'align';
}

/** Single-use tool that turns one face toward another. */
export class ToolFaceAlign extends ToolFaceSession {
  /** Creates a rotation-only face align tool. */
  constructor() {
    super('align');
  }
}
