import { Vector2 } from 'three';
import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';
import type { EditorWindow } from '../window/editor_window.js';

/** Represents a viewport tool that's used to manipulate shapes. */
export abstract class Tool implements IEditorEventReceiver {
  /** The editor window. */
  editor: EditorWindow | null;

  /**
   * The parent tool that called this tool (if any), to which the editor will
   * return once the tool is finished. This is set when a single-use tool is
   * instantiated with a keyboard binding.
   */
  parent: Tool | null;

  /**
   * Whether this tool is in single-use mode.
   *
   * @returns True when parent is set.
   */
  get isSingleUse(): boolean {
    return this.parent !== null;
  }

  /** Creates a tool with no parent (permanent until UseTool sets parent). */
  constructor() {
    this.editor = null;
    this.parent = null;
  }

  /**
   * Gets whether the tool is busy and has to maintain the input focus, making
   * it impossible to switch to another object.
   *
   * @returns True while exclusive input ownership is required.
   */
  isBusy(): boolean {
    return false;
  }

  /**
   * Returns whether RMB/MMB must stay with the tool instead of fly/pan
   * navigation pass-through while the exclusive shield is active.
   *
   * @returns True when the tool owns middle and right mouse buttons.
   */
  suppressesViewportNavigation(): boolean {
    return false;
  }

  /** Called when the tool is activated. */
  onActivate(): void {}

  /** Called when the tool is deactivated. */
  onDeactivate(): void {}

  /** Called when the tool is rendered. */
  onRender(): void {}

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param _button Mouse button index.
   */
  onMouseDown(_button: number): void {}

  /**
   * Called when the tool receives a mouse up event.
   *
   * @param _button Mouse button index.
   */
  onMouseUp(_button: number): void {}

  /**
   * Called when the tool receives a global mouse up event.
   *
   * @param _button Mouse button index.
   */
  onGlobalMouseUp(_button: number): void {}

  /**
   * Called when the tool receives a mouse drag event.
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the tool receives a global mouse drag event.
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onGlobalMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the tool receives a mouse move event.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the tool receives a mouse scroll event.
   *
   * @param _delta Scroll wheel delta.
   * @returns True when consumed.
   */
  onMouseScroll(_delta: number): boolean {
    return false;
  }

  /**
   * Called when the tool receives a key down event.
   *
   * @param _keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when consumed.
   */
  onKeyDown(_keyCode: string, _event?: KeyboardEvent): boolean {
    return false;
  }

  /**
   * Called when the tool receives a key up event.
   *
   * @param _keyCode Key code string.
   * @returns True when consumed.
   */
  onKeyUp(_keyCode: string): boolean {
    return false;
  }

  /** Called when the tool receives input focus. */
  onFocus(): void {}

  /** Called when the tool loses input focus. */
  onFocusLost(): void {}
}
