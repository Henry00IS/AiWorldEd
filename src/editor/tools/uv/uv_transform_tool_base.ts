import { Vector2 } from 'three';
import { Tool } from '../tool.js';
import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import {
  isSingleUsePointerCompatibleWithPinnedPick,
  resolveSingleUseViewportPointerContext,
} from '../single_use_viewport_pointer.js';

/**
 * Shared single-use UV transform tool. Matches TranslateTool / Edit Mode G/R/S:
 * UseTool sets parent, activate begins the session, mouse move samples, click
 * (mouse up) commits and returns to the parent Face Select tool.
 */
export abstract class UvTransformToolBase extends Tool {
  private isSingleUseDone: boolean;
  private pinnedCamera: import('three').Camera | null;
  private pinnedPickElement: HTMLElement | null;

  /** Creates a single-use UV transform tool. */
  constructor() {
    super();
    this.isSingleUseDone = false;
    this.pinnedCamera = null;
    this.pinnedPickElement = null;
  }

  /**
   * Returns the UV transform mode this tool drives.
   *
   * @returns Move, rotate, or scale.
   */
  protected abstract getUvTransformMode(): UvTransformMode;

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.isSingleUseDone = false;
    this.pinnedCamera = null;
    this.pinnedPickElement = null;
    if (!this.isSingleUse) {
      this.finishAndReturnToParent();
      return;
    }
    this.beginSessionFromServices();
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    if (this.isSingleUseDone) {
      return;
    }
    this.editor?.getServices()?.cancelFaceUvTransform();
  }

  /**
   * Busy until the single-use gesture finishes.
   *
   * @returns True while the tool owns input.
   */
  override isBusy(): boolean {
    if (this.isSingleUse) {
      return !this.isSingleUseDone;
    }
    return false;
  }

  /**
   * Called when the tool receives a mouse move event.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    if (this.isSingleUse && !this.isSingleUseDone) {
      this.samplePointerMove();
    }
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (this.isSingleUse) {
      if (button === 0) {
        this.isSingleUseDone = true;
      }
    }
  }

  /**
   * Called when the tool receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {
    if (this.isSingleUse) {
      if (button === 0) {
        return;
      }
    }
  }

  /**
   * Called when the tool receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (this.isSingleUse && button === 0) {
      this.commitAndReturnToParent();
    }
  }

  /**
   * Called when the tool receives a key down event.
   *
   * @param keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when consumed.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (!this.isSingleUse || this.isSingleUseDone) {
      return false;
    }
    if (keyCode === 'Escape') {
      this.toolOnCancel();
      return true;
    }
    if (keyCode === 'Enter') {
      this.commitAndReturnToParent();
      return true;
    }
    return false;
  }

  /** Starts the UV session through map editor services. */
  private beginSessionFromServices(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      this.finishAndReturnToParent();
      return;
    }
    const context = resolveSingleUseViewportPointerContext(this.editor, services);
    if (!context) {
      this.finishAndReturnToParent();
      return;
    }
    this.pinnedCamera = context.camera;
    this.pinnedPickElement = context.pickElement;
    const started = services.beginFaceUvTransform(
      this.getUvTransformMode(),
      context.clientX,
      context.clientY,
      context.camera,
      context.pickElement,
    );
    if (!started) {
      this.finishAndReturnToParent();
    }
  }

  /** Samples the live pointer for the active UV session. */
  private samplePointerMove(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    if (!services.isFaceUvTransformActive()) {
      return;
    }
    if (!isSingleUsePointerCompatibleWithPinnedPick(this.editor, this.pinnedPickElement)) {
      return;
    }
    const camera = this.pinnedCamera ?? services.getActiveCamera();
    const pickElement = this.pinnedPickElement ?? services.getActivePickElement();
    if (!camera || !pickElement) {
      return;
    }
    services.updateFaceUvTransform(
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      camera,
      pickElement,
      this.editor.isShiftPressed,
    );
  }

  /** Commits the live UV session when one is still open. */
  private commitLiveUvTransformIfNeeded(): void {
    const services = this.editor?.getServices();
    if (!services || !services.isFaceUvTransformActive()) {
      return;
    }
    services.endFaceUvTransform();
  }

  /** Commits the UV session and returns to the parent tool. */
  private commitAndReturnToParent(): void {
    this.isSingleUseDone = true;
    this.commitLiveUvTransformIfNeeded();
    this.switchToParentToolIfPresent();
  }

  /** Cancels the UV session and returns to the parent tool. */
  private toolOnCancel(): void {
    this.editor?.getServices()?.cancelFaceUvTransform();
    this.isSingleUseDone = true;
    this.switchToParentToolIfPresent();
  }

  /** Marks the tool finished and switches back to the parent. */
  private finishAndReturnToParent(): void {
    this.isSingleUseDone = true;
    this.switchToParentToolIfPresent();
  }

  /** Switches the editor to the parent tool when one is set. */
  private switchToParentToolIfPresent(): void {
    if (!this.parent) {
      return;
    }
    this.editor?.switchTool(this.parent);
  }
}
