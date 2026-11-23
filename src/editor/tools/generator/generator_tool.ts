import { Tool } from '../tool.js';
import type { GeneratorEditHost } from './generator_edit_host.js';

/**
 * Edits the selected generator in the scene. Transform gizmos and bounds rulers
 * are hidden, a click only switches to another generator, and Escape returns to
 * the Bounds tool.
 */
export class GeneratorTool extends Tool {
  /** Client point of the last left press, or null. */
  private press: { x: number; y: number } | null = null;

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.host()?.setEditing(true);
    this.editor?.getServices()?.setStatusMessage('Generator · Esc Returns to Bounds');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.press = null;
    this.host()?.setEditing(false);
  }

  /** Returns to Bounds once no generator is selected, as after undo. */
  override onRender(): void {
    if (this.editor && !this.host()?.selectedGenerator()) this.editor.userSwitchToBoundsTool();
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

  /**
   * Switches to the generator under a click that did not move.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const editor = this.editor;
    const press = this.press;
    if (button !== 0 || !editor || !press) return;
    this.press = null;
    if (press.x !== editor.lastPointerClientX || press.y !== editor.lastPointerClientY) return;
    this.host()?.pickGenerator(press.x, press.y);
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
