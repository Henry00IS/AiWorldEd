import type { Vector2 } from 'three';
import { Tool } from '../tool.js';
import { boxSelectApplyClickSelection } from './box_select_click_select.js';

/**
 * Shape Editor BoxSelectTool: object selection on OnGlobalMouseUp, G/R/S
 * single-use launches. No gizmo ownership — gizmos live on widgets of
 * BoundsTool / TranslateTool / RotateTool / ScaleTool.
 */
export class BoxSelectTool extends Tool {
  /** Creates a box select tool. */
  constructor() {
    super();
  }

  /**
   * Marquee busy flag (Shape Editor IsBusy). Marquee is inactive for now.
   *
   * @returns Always false until marquee selection returns.
   */
  override isBusy(): boolean {
    return false;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.editor?.getServices()?.setStatusMessage('Select');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {}

  /** Called when the tool is rendered. */
  override onRender(): void {}

  /**
   * Shape Editor OnMouseDown: selection is OnGlobalMouseUp only.
   *
   * @param _button Mouse button index.
   */
  override onMouseDown(_button: number): void {}

  /**
   * Shape Editor OnGlobalMouseUp: plain click selection (marquee deferred).
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button !== 0) {
      return;
    }
    this.applyClickSelectionAtLastPointer();
  }

  /**
   * Shape Editor OnMouseDrag: marquee arming deferred.
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the tool receives a key down event.
   *
   * @param keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when a single-use tool was started or a shortcut handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (this.isSingleUse) {
      return false;
    }
    if (!this.editor) {
      return false;
    }
    return this.dispatchSingleUseLaunchKeys(keyCode);
  }

  /** Applies object click selection at the last editor pointer sample. */
  private applyClickSelectionAtLastPointer(): void {
    if (!this.editor) {
      return;
    }
    const services = this.editor.getServices();
    if (!services) {
      return;
    }
    boxSelectApplyClickSelection(
      services,
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      this.editor.isShiftPressed,
      this.editor.isCtrlPressed,
    );
  }

  /**
   * Dispatches G / R / S single-use tool launches matching Shape Editor. Ctrl
   * or Meta combinations are left for the browser and global shortcuts.
   *
   * @param keyCode Key code string.
   * @returns True when handled.
   */
  private dispatchSingleUseLaunchKeys(keyCode: string): boolean {
    const editor = this.editor;
    if (!editor || editor.isCtrlPressed) {
      return false;
    }
    if (keyCode === 'KeyG' && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseTranslateTool();
      return true;
    }
    if (keyCode === 'KeyS' && !editor.isModifierPressed && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseScaleTool();
      return true;
    }
    if (keyCode === 'KeyR' && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseRotateTool();
      return true;
    }
    return false;
  }
}
