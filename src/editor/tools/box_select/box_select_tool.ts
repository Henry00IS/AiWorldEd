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
   * Shape Editor OnGlobalMouseUp: plain click selection.
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
   * Called when the tool receives a key down event.
   *
   * @param keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when a one-shot transform started, a status prompt was shown,
   *   or a shortcut handled the key.
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
   * Dispatches G / R / S one-shot move, rotate, and scale. These keys never
   * switch gizmo tools. Shift, Alt, Ctrl, and Meta are left for Group, Align to
   * Origin, and browser or global shortcuts.
   *
   * @param keyCode Key code string.
   * @returns True when handled.
   */
  private dispatchSingleUseLaunchKeys(keyCode: string): boolean {
    const editor = this.editor;
    if (!editor || editor.isModifierPressed) {
      return false;
    }
    if (keyCode === 'KeyG') {
      return this.launchOrPromptSingleUse('Select an object to move', () => editor.useSingleUseTranslateTool());
    }
    if (keyCode === 'KeyR') {
      return this.launchOrPromptSingleUse('Select an object to rotate', () => editor.useSingleUseRotateTool());
    }
    if (keyCode === 'KeyS') {
      return this.launchOrPromptSingleUse('Select an object to scale', () => editor.useSingleUseScaleTool());
    }
    return false;
  }

  /**
   * Starts a one-shot transform when something is selected, otherwise reports
   * why the key did nothing.
   *
   * @param emptySelectionMessage Status text when the selection is empty.
   * @param launch Starts the one-shot tool.
   * @returns Always true because the key was handled.
   */
  private launchOrPromptSingleUse(emptySelectionMessage: string, launch: () => void): boolean {
    const editor = this.editor;
    if (!editor || editor.selectedSegmentsCount <= 0) {
      editor?.getServices()?.setStatusMessage(emptySelectionMessage);
      return true;
    }
    launch();
    return true;
  }
}
