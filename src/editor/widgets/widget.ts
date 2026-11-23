import { Vector2 } from 'three';
import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';
import type { EditorWindow } from '../window/editor_window.js';

/** Represents a viewport widget (e.g. transform handles). */
export abstract class Widget implements IEditorEventReceiver {
  /** The editor window. */
  editor: EditorWindow | null;

  /** The widget position in screen coordinates. */
  position: Vector2;

  /** Whether the widget is visible. */
  visible: boolean;

  /**
   * Latched wants-active flag (Shape Editor `_wantsActive`). Set from gizmo
   * handle state on mouse down or permanent map-gizmo drag begin.
   */
  private wantsActiveFlag: boolean;

  /** Creates a widget with default screen position and visibility. */
  constructor() {
    this.editor = null;
    this.position = new Vector2();
    this.visible = true;
    this.wantsActiveFlag = false;
  }

  /**
   * Gets whether the widget wants to be active with input focus.
   *
   * @returns True when the widget requests exclusive focus.
   */
  get wantsActive(): boolean {
    return this.wantsActiveFlag;
  }

  /**
   * Latches wantsActive from gizmo handle interaction state (Shape Editor
   * `_wantsActive = activeGizmoState.isActive` on mouse down).
   *
   * @param gizmoIsActive True when the gizmo handle is active under the pointer
   *   or mid permanent drag.
   */
  latchWantsActiveFromGizmoState(gizmoIsActive: boolean): void {
    this.wantsActiveFlag = gizmoIsActive;
  }

  /** Clears the wantsActive latch (Shape Editor OnGlobalMouseUp left button). */
  clearWantsActiveLatch(): void {
    this.wantsActiveFlag = false;
  }

  /**
   * Gets whether the widget currently has input focus.
   *
   * @returns True when this widget is the active event receiver.
   */
  get isActive(): boolean {
    if (!this.editor) {
      return false;
    }
    return this.editor.isActive(this);
  }

  /**
   * Gets whether some other widget currently has input focus.
   *
   * @returns True when another widget owns focus.
   */
  get isOtherActive(): boolean {
    if (!this.editor) {
      return false;
    }
    return this.editor.activeEventReceiverIsWidget && !this.isActive;
  }

  /**
   * Gets whether the control is busy and has to maintain the input focus,
   * making it impossible to switch to another object.
   *
   * @returns True while active and still wanting focus.
   */
  isBusy(): boolean {
    return this.isActive && this.wantsActive;
  }

  /**
   * Returns whether a release at a client point is a click this widget acts on,
   * so nothing under it acts on the same click. Off unless a widget turns it on
   * for itself.
   *
   * @param _clientX Release client X.
   * @param _clientY Release client Y.
   * @returns True for a click the widget acts on.
   */
  claimsClickAt(_clientX: number, _clientY: number): boolean {
    return false;
  }

  /** Called when the widget is activated. */
  onActivate(): void {}

  /** Called when the widget is deactivated. */
  onDeactivate(): void {
    this.clearWantsActiveLatch();
  }

  /** Called when the widget is rendered. */
  onRender(): void {}

  /**
   * Called when the widget receives a mouse down event.
   *
   * @param _button Mouse button index.
   */
  onMouseDown(_button: number): void {}

  /**
   * Called when the widget receives a mouse up event.
   *
   * @param _button Mouse button index.
   */
  onMouseUp(_button: number): void {}

  /**
   * Called when the widget receives a global mouse up event.
   *
   * @param _button Mouse button index.
   */
  onGlobalMouseUp(_button: number): void {}

  /**
   * Called when the widget receives a mouse drag event.
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the widget receives a global mouse drag event.
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onGlobalMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the widget receives a mouse move event.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Called when the widget receives a mouse scroll event.
   *
   * @param _delta Scroll wheel delta.
   * @returns True when consumed.
   */
  onMouseScroll(_delta: number): boolean {
    return false;
  }

  /**
   * Called when the widget receives a key down event.
   *
   * @param _keyCode Key code string.
   * @returns True when consumed.
   */
  onKeyDown(_keyCode: string, _event?: KeyboardEvent): boolean {
    return false;
  }

  /**
   * Called when the widget receives a key up event.
   *
   * @param _keyCode Key code string.
   * @returns True when consumed.
   */
  onKeyUp(_keyCode: string): boolean {
    return false;
  }

  /** Called when the widget receives input focus. */
  onFocus(): void {}

  /** Called when the widget loses input focus. */
  onFocusLost(): void {}
}

/**
 * Returns whether any widget acts on a click at a client point.
 *
 * @param widgets Registered widgets.
 * @param clientX Release client X.
 * @param clientY Release client Y.
 * @returns True when a widget claims the click.
 */
export function widgetsClaimClickAt(widgets: readonly Widget[], clientX: number, clientY: number): boolean {
  return widgets.some((widget) => widget.claimsClickAt(clientX, clientY));
}
