import { Tool } from '../tool.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { GeneratorSliderWidget } from './generator_slider_widget.js';

/**
 * Edits the widgets of the selected object in the scene. Transform gizmos and
 * bounds rulers are hidden, the rail shows its own Generator highlight, a still
 * click only switches to another object with an edit mode, and Escape returns
 * to the Bounds tool.
 */
export class GeneratorTool extends Tool {
  /** Client point of the last left press, or null. */
  private press: { x: number; y: number } | null = null;
  /** Slider handles of the edited object. */
  private readonly sliders = new GeneratorSliderWidget();

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.host()?.setEditing(true);
    this.editor?.addWidget(this.sliders);
    this.editor?.getServices()?.setStatusMessage('Generator · Esc Returns to Bounds');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.press = null;
    this.host()?.setEditing(false);
  }

  /**
   * Returns to Bounds once no object with an edit mode is selected, as after
   * undo.
   */
  override onRender(): void {
    if (this.editor && !this.host()?.selectedEditable()) this.editor.userSwitchToBoundsTool();
  }

  /**
   * Remembers where a left press started.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || !this.editor) return;
    this.press = { x: this.editor.lastPointerClientX, y: this.editor.lastPointerClientY };
  }

  /** Forgets a press once the pointer moves at all, even if it comes back. */
  override onGlobalMouseDrag(): void {
    const editor = this.editor;
    const press = this.press;
    if (editor && press && (press.x !== editor.lastPointerClientX || press.y !== editor.lastPointerClientY))
      this.press = null;
  }

  /**
   * Switches to the object with an edit mode under a click that did not move.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const editor = this.editor;
    const press = this.press;
    if (button !== 0 || !editor || !press) return;
    this.press = null;
    if (press.x !== editor.lastPointerClientX || press.y !== editor.lastPointerClientY) return;
    this.host()?.pickEditable(press.x, press.y);
  }

  /**
   * Returns to the Bounds tool on Escape.
   *
   * @param keyCode Key code string.
   * @returns True when the key was handled.
   */
  override onKeyDown(keyCode: string): boolean {
    if (keyCode !== 'Escape' || !this.editor) return false;
    this.editor.userSwitchToBoundsTool();
    return true;
  }

  /**
   * Returns the scene host, or null outside the editor.
   *
   * @returns Host or null.
   */
  private host(): GeneratorEditHost | null {
    return this.editor?.getServices()?.getGeneratorEditHost?.() ?? null;
  }
}
