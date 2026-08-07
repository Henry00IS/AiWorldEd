import { Vector2 } from 'three';
import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';
import type { Tool } from '../tools/tool.js';
import type { Widget } from '../widgets/widget.js';
import type { GuiWindow } from '../gui/gui_window.js';
import type { IGuiContainerEventReceiver } from '../gui/gui_container_event_receiver.js';
import type { EditorServices } from './editor_services.js';
import { BoxSelectTool } from '../tools/box_select_tool.js';
import { BoundsTool } from '../tools/bounds_tool.js';
import { TranslateTool } from '../tools/translate_tool.js';
import { RotateTool } from '../tools/rotate_tool.js';
import { ScaleTool } from '../tools/scale_tool.js';
import { FaceSelectTool } from '../tools/face_select/face_select_tool.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { GridTool } from '../tools/grid/grid_tool.js';
import type { ClipTool } from '../tools/clip_tool.js';
import { managerMouseCursor } from '@/input/manager_mouse_cursor.js';
import {
  isAnyModifierPressedOnDomFlags,
  isCtrlOrMetaPressedOnDomFlags,
  isShiftPressedOnDomFlags,
  type DomModifierKeyFlags,
} from '@/input/modifier_keys_query.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Holds active tool and event-receiver focus, widgets, GUI windows, mouse
 * state, and routes pointer and keyboard input.
 */
export class EditorWindow {
  /** The currently active viewport tool. */
  activeTool: Tool | null;

  /** The active event receiver with input focus (e.g. a tool or window etc.). */
  private activeEventReceiver: IEditorEventReceiver | null;

  private readonly widgets: Widget[];
  private readonly guiWindows: GuiWindow[];
  private services: EditorServices | null;

  private boxSelectTool: BoxSelectTool | null;
  private boundsTool: BoundsTool | null;
  private translateTool: TranslateTool | null;
  private rotateTool: RotateTool | null;
  private scaleTool: ScaleTool | null;
  private faceSelectTool: FaceSelectTool | null;
  private editSelectTool: EditSelectTool | null;
  private gridTool: GridTool | null;
  private clipTool: ClipTool | null;

  /** Current mouse position in screen coordinates. */
  mousePosition: Vector2;

  /** Current mouse position on the grid/world plane. */
  mouseGridPosition: Vector2;

  /** Mouse position at the start of the left-button press. */
  mouseInitialPosition: Vector2;

  /** Grid mouse position at the start of the left-button press. */
  mouseGridInitialPosition: Vector2;

  /** Whether the left mouse button is pressed. */
  isLeftMousePressed: boolean;

  /** Whether the right mouse button is pressed. */
  isRightMousePressed: boolean;

  /** Last DOM event target node. */
  lastEventTargetNode: Node | null;

  /** Last known pointer client X. */
  lastPointerClientX: number;

  /** Last known pointer client Y. */
  lastPointerClientY: number;

  /** Whether a last pointer client position is known. */
  hasLastPointerClient: boolean;

  /**
   * Document that owns the last pointer sample. Client coordinates are local to
   * this document.
   */
  lastPointerOwnerDocument: Document | null;

  /** Modifier flags from the last pointer or keyboard sample. */
  private latchedModifierFlags: DomModifierKeyFlags;

  /** True after at least one DOM sample has stored latched modifier flags. */
  private hasLatchedModifierFlags: boolean;

  /**
   * Creates an empty editor window with null tools, empty widget lists, and
   * default mouse and modifier state.
   */
  constructor() {
    this.activeTool = null;
    this.activeEventReceiver = null;
    this.widgets = [];
    this.guiWindows = [];
    this.services = null;
    this.boxSelectTool = null;
    this.boundsTool = null;
    this.translateTool = null;
    this.rotateTool = null;
    this.scaleTool = null;
    this.faceSelectTool = null;
    this.editSelectTool = null;
    this.gridTool = null;
    this.clipTool = null;
    this.mousePosition = new Vector2();
    this.mouseGridPosition = new Vector2();
    this.mouseInitialPosition = new Vector2();
    this.mouseGridInitialPosition = new Vector2();
    this.isLeftMousePressed = false;
    this.isRightMousePressed = false;
    this.lastEventTargetNode = null;
    this.lastPointerClientX = 0;
    this.lastPointerClientY = 0;
    this.hasLastPointerClient = false;
    this.lastPointerOwnerDocument = null;
    this.latchedModifierFlags = {
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    };
    this.hasLatchedModifierFlags = false;
  }

  /**
   * Stores the services instance on this window.
   *
   * @param services Services instance to store.
   */
  setServices(services: EditorServices): void {
    this.services = services;
  }

  /**
   * Returns the stored services instance, or null when none is stored.
   *
   * @returns Stored services, or null.
   */
  getServices(): EditorServices | null {
    return this.services;
  }

  /** Invokes onRender on the active tool and every registered widget. */
  onRepaint(): void {
    this.drawTool();
    this.drawWidgets();
  }

  /**
   * Requests a CSS cursor on the given element for the current frame.
   *
   * @param cursorCss CSS cursor value such as `ew-resize`.
   * @param targetElement Element that receives the cursor style.
   */
  setMouseCursor(cursorCss: string, targetElement: HTMLElement): void {
    managerMouseCursor.setMouseCursor(cursorCss, targetElement);
  }

  /** Invokes onRender on the active tool when one is set. */
  private drawTool(): void {
    if (this.activeTool === null) {
      return;
    }
    this.activeTool.onRender();
  }

  /** Invokes onRender on every registered widget. */
  private drawWidgets(): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onRender();
    }
  }

  /**
   * Returns whether a mouse button is pressed or the focused tool reports busy.
   *
   * @returns True when left or right mouse is down, or the focused tool is
   *   busy.
   */
  get isMouseBusy(): boolean {
    return this.isLeftMousePressed || this.isRightMousePressed || this.isToolBusy;
  }

  /**
   * Returns whether the focused event receiver is a GUI container.
   *
   * @returns True when the focused receiver is a GUI container.
   */
  get activeEventReceiverIsGuiContainer(): boolean {
    return this.isGuiContainerReceiver(this.activeEventReceiver);
  }

  /**
   * Returns whether the focused event receiver is a widget.
   *
   * @returns True when the focused receiver is a widget.
   */
  get activeEventReceiverIsWidget(): boolean {
    return this.isWidgetReceiver(this.activeEventReceiver);
  }

  /**
   * Returns whether the focused event receiver is a tool.
   *
   * @returns True when the focused receiver is a tool.
   */
  get activeEventReceiverIsTool(): boolean {
    return this.isToolReceiver(this.activeEventReceiver);
  }

  /**
   * Returns whether the focused event receiver is a tool and reports busy.
   *
   * @returns True when the focused tool is busy.
   */
  get isToolBusy(): boolean {
    if (!this.activeEventReceiverIsTool) {
      return false;
    }
    return this.getActiveEventReceiver().isBusy();
  }

  /**
   * Returns whether the focused event receiver reports busy.
   *
   * @returns True when the focused receiver is busy.
   */
  get isActiveEventReceiverBusy(): boolean {
    return this.getActiveEventReceiver().isBusy();
  }

  /**
   * Latches every widget as wanting active from gizmo state and focuses the
   * first widget that reports wantsActive.
   */
  onPermanentGizmoHandleDragBegan(): void {
    this.latchAllWidgetsWantsActiveFromGizmo(true);
    const widget = this.findActiveWidget();
    if (widget) {
      this.trySwitchActiveEventReceiver(widget);
    }
  }

  /** Clears the gizmo-derived wantsActive latch on every registered widget. */
  onPermanentGizmoHandleDragEnded(): void {
    this.latchAllWidgetsWantsActiveFromGizmo(false);
  }

  /**
   * Calls latchWantsActiveFromGizmoState on every registered widget.
   *
   * @param gizmoIsActive Value passed to each widget latch call.
   */
  private latchAllWidgetsWantsActiveFromGizmo(gizmoIsActive: boolean): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.latchWantsActiveFromGizmoState(gizmoIsActive);
    }
  }

  /**
   * Returns whether shift is pressed from latched DOM flags when available,
   * otherwise from stored services.
   *
   * @returns True when shift is down.
   */
  get isShiftPressed(): boolean {
    if (this.hasLatchedModifierFlags && isShiftPressedOnDomFlags(this.latchedModifierFlags)) {
      return true;
    }
    return this.services?.isShiftPressed() === true;
  }

  /**
   * Returns whether ctrl or meta is pressed from latched DOM flags when
   * available, otherwise from stored services.
   *
   * @returns True when ctrl or meta is down.
   */
  get isCtrlPressed(): boolean {
    if (this.hasLatchedModifierFlags && isCtrlOrMetaPressedOnDomFlags(this.latchedModifierFlags)) {
      return true;
    }
    return this.services?.isCtrlPressed() === true;
  }

  /**
   * Returns whether any modifier is pressed from latched DOM flags when
   * available, otherwise from stored services.
   *
   * @returns True when a modifier is down.
   */
  get isModifierPressed(): boolean {
    if (this.hasLatchedModifierFlags && isAnyModifierPressedOnDomFlags(this.latchedModifierFlags)) {
      return true;
    }
    return this.services?.isModifierPressed() === true;
  }

  /**
   * Returns whether grid snapping is enabled.
   *
   * @returns True when snapping.
   */
  get isSnapping(): boolean {
    return this.services?.isSnapping() === true;
  }

  /**
   * Returns the grid snap size.
   *
   * @returns Snap increment.
   */
  get gridSnap(): number {
    return this.services?.getGridSnap() ?? 1;
  }

  /**
   * Returns the angle snap in degrees.
   *
   * @returns Angle snap.
   */
  get angleSnap(): number {
    return this.services?.getAngleSnap() ?? 15;
  }

  /**
   * Returns the count of selected objects.
   *
   * @returns Selection size.
   */
  get selectedSegmentsCount(): number {
    return this.services?.getSelectedCount() ?? 0;
  }

  /**
   * Returns the average screen position of the selection.
   *
   * @returns Screen-space average as Vector2.
   */
  get selectedSegmentsAveragePosition(): Vector2 {
    const average = this.services?.getSelectedSegmentsAveragePosition() ?? { x: 0, y: 0 };
    return new Vector2(average.x, average.y);
  }

  /**
   * Creates permanent tools when missing and switches to the bounds tool when
   * no active tool is set.
   */
  validateTools(): void {
    if (this.boxSelectTool === null) {
      this.boxSelectTool = new BoxSelectTool();
      this.boundsTool = new BoundsTool();
      this.translateTool = new TranslateTool();
      this.rotateTool = new RotateTool();
      this.scaleTool = new ScaleTool();
      this.faceSelectTool = new FaceSelectTool();
      this.editSelectTool = new EditSelectTool();
      this.gridTool = new GridTool();
    }
    if (this.activeTool === null) {
      this.switchTool(this.boundsTool as BoundsTool);
    }
  }

  /**
   * Ensures tools exist and returns the box select tool.
   *
   * @returns Box select tool instance.
   */
  getBoxSelectTool(): BoxSelectTool {
    this.validateTools();
    return this.boxSelectTool as BoxSelectTool;
  }

  /**
   * Ensures tools exist and returns the bounds tool.
   *
   * @returns Bounds tool instance.
   */
  getBoundsTool(): BoundsTool {
    this.validateTools();
    return this.boundsTool as BoundsTool;
  }

  /**
   * Ensures tools exist and returns the translate tool.
   *
   * @returns Translate tool instance.
   */
  getTranslateTool(): TranslateTool {
    this.validateTools();
    return this.translateTool as TranslateTool;
  }

  /**
   * Ensures tools exist and returns the rotate tool.
   *
   * @returns Rotate tool instance.
   */
  getRotateTool(): RotateTool {
    this.validateTools();
    return this.rotateTool as RotateTool;
  }

  /**
   * Ensures tools exist and returns the scale tool.
   *
   * @returns Scale tool instance.
   */
  getScaleTool(): ScaleTool {
    this.validateTools();
    return this.scaleTool as ScaleTool;
  }

  /**
   * Ensures tools exist and returns the face select tool.
   *
   * @returns Face select tool instance.
   */
  getFaceSelectTool(): FaceSelectTool {
    this.validateTools();
    return this.faceSelectTool as FaceSelectTool;
  }

  /**
   * Ensures tools exist and returns the edit select tool.
   *
   * @returns Edit select tool instance.
   */
  getEditSelectTool(): EditSelectTool {
    this.validateTools();
    return this.editSelectTool as EditSelectTool;
  }

  /**
   * Ensures tools exist and returns the grid tool.
   *
   * @returns Grid tool instance.
   */
  getGridTool(): GridTool {
    this.validateTools();
    return this.gridTool as GridTool;
  }

  /**
   * Stores the clip tool and assigns this window as its editor.
   *
   * @param tool Clip tool instance to store.
   */
  setClipTool(tool: ClipTool): void {
    this.clipTool = tool;
    tool.editor = this;
  }

  /**
   * Returns the stored clip tool, or null when none is stored.
   *
   * @returns Clip tool, or null.
   */
  getClipTool(): ClipTool | null {
    return this.clipTool;
  }

  /**
   * Returns whether the stored clip tool is the active tool and has an active
   * session.
   *
   * @returns True when the clip tool is active with a live session.
   */
  isClipToolActive(): boolean {
    if (!this.clipTool || this.activeTool !== this.clipTool) {
      return false;
    }
    return this.clipTool.isSessionActive();
  }

  /**
   * Deactivates the previous tool, clears widgets, activates the given tool,
   * and focuses it as the event receiver. No-op when the tool is already
   * active.
   *
   * @param tool Tool to make active.
   */
  switchTool(tool: Tool): void {
    if (this.activeTool === tool) {
      return;
    }
    const previousTool = this.activeTool;
    if (previousTool !== null) {
      previousTool.onDeactivate();
    }
    this.clearWidgets();
    if (previousTool?.isSingleUse) {
      this.services?.clearExclusiveViewport();
    }
    tool.editor = this;
    this.activeTool = tool;
    this.activeTool.onActivate();
    this.trySwitchActiveEventReceiver(tool);
    if (tool.isSingleUse) {
      this.services?.pinExclusiveViewport();
    }
  }

  /**
   * Sets the tool's parent to the current active tool, then switches to the
   * given tool. No-op when the tool is already active.
   *
   * @param tool Tool to switch to.
   */
  useTool(tool: Tool): void {
    if (this.activeTool === tool) {
      return;
    }
    tool.parent = this.activeTool;
    this.switchTool(tool);
  }

  /**
   * Switches input focus to the given event receiver when the current receiver
   * is not busy. No-op success when already focused on that receiver.
   *
   * @param eventReceiver Event receiver to try to focus.
   * @returns True when focus is on the given receiver after the call.
   */
  trySwitchActiveEventReceiver(eventReceiver: IEditorEventReceiver): boolean {
    if (eventReceiver === null) {
      return false;
    }
    if (this.activeEventReceiver === eventReceiver) {
      return true;
    }
    if (this.activeEventReceiver !== null) {
      if (this.activeEventReceiver.isBusy()) {
        return false;
      }
      this.activeEventReceiver.onFocusLost();
    }
    this.activeEventReceiver = eventReceiver;
    this.activeEventReceiver.editor = this;
    this.activeEventReceiver.onFocus();
    return true;
  }

  /**
   * Returns the focused event receiver, focusing the box select tool when none
   * is set.
   *
   * @returns The focused event receiver.
   */
  getActiveEventReceiver(): IEditorEventReceiver {
    if (this.activeEventReceiver === null) {
      this.validateTools();
      this.trySwitchActiveEventReceiver(this.boxSelectTool as BoxSelectTool);
    }
    return this.activeEventReceiver as IEditorEventReceiver;
  }

  /**
   * Returns whether the given event receiver is the focused receiver.
   *
   * @param eventReceiver Event receiver to compare.
   * @returns True when the receiver is focused.
   */
  isActive(eventReceiver: IEditorEventReceiver): boolean {
    return this.activeEventReceiver === eventReceiver;
  }

  /** Deactivates every registered widget and clears the widget list. */
  clearWidgets(): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onDeactivate();
    }
    this.widgets.length = 0;
  }

  /**
   * Assigns this window as the widget's editor, appends the widget, and
   * activates it.
   *
   * @param widget Widget to add.
   */
  addWidget(widget: Widget): void {
    widget.editor = this;
    this.widgets.push(widget);
    widget.onActivate();
  }

  /**
   * Returns the first registered widget whose wantsActive flag is true.
   *
   * @returns Matching widget, or null when none want active.
   */
  findActiveWidget(): Widget | null {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      const widget = this.widgets[i];
      if (widget && widget.wantsActive) {
        return widget;
      }
    }
    return null;
  }

  /**
   * Returns the registered widgets list.
   *
   * @returns Read-only widgets array.
   */
  getWidgets(): readonly Widget[] {
    return this.widgets;
  }

  /**
   * Stores a GUI window if it is not already registered and assigns this window
   * as its editor.
   *
   * @param window GUI window instance.
   */
  registerGuiWindow(window: GuiWindow): void {
    if (this.guiWindows.includes(window)) {
      return;
    }
    window.editor = this;
    this.guiWindows.push(window);
  }

  /**
   * Removes the GUI window whose root element matches, and focuses the active
   * tool when that window held focus.
   *
   * @param rootElement Root element used to identify the window.
   */
  unregisterGuiWindowByRoot(rootElement: HTMLElement): void {
    const index = this.guiWindows.findIndex((window) => window.getRootElement() === rootElement);
    if (index < 0) {
      return;
    }
    const [removed] = this.guiWindows.splice(index, 1);
    if (removed && this.activeEventReceiver === removed) {
      if (this.activeTool) {
        this.trySwitchActiveEventReceiver(this.activeTool);
      }
    }
  }

  /**
   * Returns the topmost registered GUI window that contains the node.
   *
   * @param node DOM node to test, or null.
   * @returns Matching window, or null.
   */
  findWindowAtNode(node: Node | null): GuiWindow | null {
    if (!node) {
      return null;
    }
    for (let i = this.guiWindows.length - 1; i >= 0; i -= 1) {
      const window = this.guiWindows[i];
      if (window && window.containsNode(node)) {
        return window;
      }
    }
    return null;
  }

  /**
   * Returns the registered GUI window under the last event target node.
   *
   * @returns Matching window, or null.
   */
  findWindowAtPosition(): GuiWindow | null {
    return this.findWindowAtNode(this.lastEventTargetNode);
  }

  /**
   * Routes a mouse down to the focused receiver, resolving a new focus target
   * first when the current receiver is not busy.
   *
   * @param button Mouse button index.
   */
  onMouseDown(button: number): void {
    let eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onMouseDown(button);
      return;
    }
    eventReceiver = this.resolveMouseDownEventReceiver(eventReceiver, button);
    eventReceiver.onMouseDown(button);
  }

  /**
   * Routes a mouse up to the focused receiver without the global flag.
   *
   * @param button Mouse button index.
   */
  onMouseUp(button: number): void {
    this.routeMouseUpLike(button, false);
  }

  /**
   * Routes a mouse up to the focused receiver with the global flag.
   *
   * @param button Mouse button index.
   */
  onGlobalMouseUp(button: number): void {
    this.routeMouseUpLike(button, true);
  }

  /**
   * Forwards a mouse drag to the focused event receiver.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Forwards a global mouse drag to the focused event receiver.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onGlobalMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onGlobalMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Forwards a mouse move to the focused event receiver.
   *
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseMove(screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onMouseMove(screenDelta, gridDelta);
  }

  /**
   * Forwards a mouse scroll to the focused event receiver.
   *
   * @param delta Scroll wheel delta.
   * @returns True when the receiver consumed the scroll.
   */
  onMouseScroll(delta: number): boolean {
    const eventReceiver = this.getActiveEventReceiver();
    return eventReceiver.onMouseScroll(delta);
  }

  /**
   * Seeds pointer and modifier state from the keyboard event, then dispatches
   * key-down through navigation suppression or the normal key-down chain.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when the key was consumed.
   */
  onKeyDown(keyCode: string, event: KeyboardEvent): boolean {
    this.seedPointerStateFromKeyboardEvent(event);
    if (this.shouldSuppressToolKeysForNavigation()) {
      return this.services?.handleGlobalKeyDown(keyCode, event) === true;
    }
    return this.dispatchKeyDownChain(keyCode, event);
  }

  /**
   * Forwards a key up to the focused event receiver, or returns false when
   * navigation is suppressing tool keys.
   *
   * @param keyCode Key code string.
   * @returns True when the key was consumed.
   */
  onKeyUp(keyCode: string): boolean {
    if (this.shouldSuppressToolKeysForNavigation()) {
      return false;
    }
    const eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onKeyUp(keyCode);
      return true;
    }
    return eventReceiver.onKeyUp(keyCode);
  }

  /**
   * Updates stored pointer position, target node, owner document, optional
   * modifiers, grid projection, and left/right press flags from a pointer
   * sample.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param targetNode Event target node.
   * @param button Mouse button, or -1 when not a button event.
   * @param isDown True when the button is being pressed.
   * @param ownerDocument Fallback owner document when the target has none.
   * @param modifierFlags Optional browser modifier flags from the same event.
   */
  updateMouseStateFromPointer(
    clientX: number,
    clientY: number,
    targetNode: Node | null,
    button: number,
    isDown: boolean,
    ownerDocument: Document | null = null,
    modifierFlags: DomModifierKeyFlags | null = null,
  ): void {
    this.lastEventTargetNode = targetNode;
    this.lastPointerClientX = clientX;
    this.lastPointerClientY = clientY;
    this.hasLastPointerClient = true;
    this.lastPointerOwnerDocument = this.resolveOwnerDocumentFromTarget(targetNode) ?? ownerDocument;
    if (modifierFlags) {
      this.updateModifiersFromDomEvent(modifierFlags);
    }
    this.mousePosition.set(clientX, clientY);
    const grid = this.services?.screenPointToGrid(clientX, clientY) ?? { x: clientX, y: clientY };
    this.mouseGridPosition.set(grid.x, grid.y);
    if (button === 0 && isDown) {
      this.mouseInitialPosition.copy(this.mousePosition);
      this.mouseGridInitialPosition.copy(this.mouseGridPosition);
      this.isLeftMousePressed = true;
    }
    if (button === 1 && isDown) {
      this.isRightMousePressed = true;
    }
    if (button === 0 && !isDown) {
      this.isLeftMousePressed = false;
    }
    if (button === 1 && !isDown) {
      this.isRightMousePressed = false;
    }
  }

  /**
   * Stores the given modifier flags and marks latched modifier state as known.
   *
   * @param flags Browser event modifier flags to store.
   */
  updateModifiersFromDomEvent(flags: DomModifierKeyFlags): void {
    this.latchedModifierFlags = {
      shiftKey: flags.shiftKey === true,
      ctrlKey: flags.ctrlKey === true,
      altKey: flags.altKey === true,
      metaKey: flags.metaKey === true,
    };
    this.hasLatchedModifierFlags = true;
  }

  /**
   * Returns a copy of the latched modifier flags, or null when none have been
   * stored.
   *
   * @returns Copied flags when latched, otherwise null.
   */
  getLatchedModifierFlags(): DomModifierKeyFlags | null {
    if (!this.hasLatchedModifierFlags) {
      return null;
    }
    return {
      shiftKey: this.latchedModifierFlags.shiftKey,
      ctrlKey: this.latchedModifierFlags.ctrlKey,
      altKey: this.latchedModifierFlags.altKey,
      metaKey: this.latchedModifierFlags.metaKey,
    };
  }

  /**
   * Projects a screen point into grid coordinates.
   *
   * @param screen Screen point.
   * @returns Grid point.
   */
  screenPointToGrid(screen: Vector2): Vector2 {
    const grid = this.services?.screenPointToGrid(screen.x, screen.y) ?? { x: screen.x, y: screen.y };
    return new Vector2(grid.x, grid.y);
  }

  /**
   * Projects a grid point into screen coordinates.
   *
   * @param grid Grid point.
   * @returns Screen point.
   */
  gridPointToScreen(grid: Vector2): Vector2 {
    const screen = this.services?.gridPointToScreen(grid.x, grid.y) ?? { x: grid.x, y: grid.y };
    return new Vector2(screen.x, screen.y);
  }

  /**
   * Registers an undo operation.
   *
   * @param name Undo label.
   */
  registerUndo(name: string): void {
    this.services?.registerUndo(name);
  }

  /** Discards the last registered undo. */
  discardUndo(): void {
    this.services?.discardUndo();
  }

  /** Switches to the bounds tool. */
  userSwitchToBoxSelectTool(): void {
    this.userSwitchToBoundsTool();
  }

  /** Switches to the permanent bounds tool. */
  userSwitchToBoundsTool(): void {
    this.switchTool(this.getBoundsTool());
  }

  /** Switches to the permanent face select tool. */
  userSwitchToFaceSelectTool(): void {
    this.switchTool(this.getFaceSelectTool());
  }

  /** Switches to the permanent edit select tool. */
  userSwitchToEditSelectTool(): void {
    this.switchTool(this.getEditSelectTool());
  }

  /** Switches to the permanent grid tool. */
  userSwitchToGridTool(): void {
    this.switchTool(this.getGridTool());
  }

  /** Switches to the permanent translate tool. */
  userSwitchToTranslateTool(): void {
    this.switchTool(this.getTranslateTool());
  }

  /** Switches to the permanent rotate tool. */
  userSwitchToRotateTool(): void {
    this.switchTool(this.getRotateTool());
  }

  /** Switches to the permanent scale tool. */
  userSwitchToScaleTool(): void {
    this.switchTool(this.getScaleTool());
  }

  /**
   * Switches to the stored clip tool when one is stored.
   *
   * @returns True when a clip tool was present and switched to.
   */
  userSwitchToClipTool(): boolean {
    if (!this.clipTool) {
      return false;
    }
    this.switchTool(this.clipTool);
    return true;
  }

  /** Creates a new translate tool and switches to it as a single-use tool. */
  useSingleUseTranslateTool(): void {
    this.useTool(new TranslateTool());
  }

  /** Creates a new rotate tool and switches to it as a single-use tool. */
  useSingleUseRotateTool(): void {
    this.useTool(new RotateTool());
  }

  /** Creates a new scale tool and switches to it as a single-use tool. */
  useSingleUseScaleTool(): void {
    this.useTool(new ScaleTool());
  }

  /**
   * Chooses the mouse-down focus target by hit-testing a GUI window first,
   * otherwise resolving against widgets and the active tool.
   *
   * @param eventReceiver Current focused receiver.
   * @param button Mouse button index.
   * @returns Receiver that should receive the mouse down.
   */
  private resolveMouseDownEventReceiver(eventReceiver: IEditorEventReceiver, button: number): IEditorEventReceiver {
    const window = this.findWindowAtPosition();
    if (window !== null) {
      return this.resolveMouseDownForWindow(eventReceiver, window);
    }
    return this.resolveMouseDownForViewport(eventReceiver, button);
  }

  /**
   * Attempts to focus the hit GUI window when it is not already focused.
   *
   * @param eventReceiver Current focused receiver.
   * @param window Hit GUI window.
   * @returns Focused receiver after the attempt, or the prior receiver on
   *   failure.
   */
  private resolveMouseDownForWindow(eventReceiver: IEditorEventReceiver, window: GuiWindow): IEditorEventReceiver {
    if (window === eventReceiver) {
      return eventReceiver;
    }
    if (this.trySwitchActiveEventReceiver(window)) {
      return window;
    }
    return eventReceiver;
  }

  /**
   * Delivers mouse down to all widgets, then focuses a wanting widget or the
   * active tool when allowed.
   *
   * @param eventReceiver Current focused receiver.
   * @param button Mouse button index.
   * @returns Focused receiver after the attempt, or the prior receiver on
   *   failure.
   */
  private resolveMouseDownForViewport(eventReceiver: IEditorEventReceiver, button: number): IEditorEventReceiver {
    this.informAllWidgetsMouseDown(button);
    const widget = this.findActiveWidget();
    if (widget !== null) {
      if (this.trySwitchActiveEventReceiver(widget)) {
        return widget;
      }
      return eventReceiver;
    }
    if (this.activeTool && this.trySwitchActiveEventReceiver(this.activeTool)) {
      return this.activeTool;
    }
    return eventReceiver;
  }

  /**
   * Calls onMouseDown on every registered widget with the given button.
   *
   * @param button Mouse button index.
   */
  private informAllWidgetsMouseDown(button: number): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onMouseDown(button);
    }
  }

  /**
   * Routes mouse up to a busy receiver, a widget receiver, or the focused
   * receiver.
   *
   * @param button Mouse button index.
   * @param isGlobal True to dispatch as global mouse up.
   */
  private routeMouseUpLike(button: number, isGlobal: boolean): void {
    let eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
      return;
    }
    if (this.activeEventReceiverIsWidget) {
      this.routeWidgetMouseUp(eventReceiver, button, isGlobal);
      return;
    }
    this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
  }

  /**
   * Dispatches mouse up to the widget receiver and focuses the active tool when
   * the widget no longer wants active.
   *
   * @param eventReceiver Current widget receiver.
   * @param button Mouse button index.
   * @param isGlobal True to dispatch as global mouse up.
   */
  private routeWidgetMouseUp(eventReceiver: IEditorEventReceiver, button: number, isGlobal: boolean): void {
    const widget = eventReceiver as Widget;
    if (!widget.wantsActive) {
      this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
      if (this.activeTool) {
        this.trySwitchActiveEventReceiver(this.activeTool);
      }
      return;
    }
    this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
  }

  /**
   * Calls onGlobalMouseUp or onMouseUp on the receiver based on isGlobal.
   *
   * @param eventReceiver Target receiver.
   * @param button Mouse button index.
   * @param isGlobal True to call onGlobalMouseUp; false to call onMouseUp.
   */
  private dispatchMouseUpToReceiver(eventReceiver: IEditorEventReceiver, button: number, isGlobal: boolean): void {
    if (isGlobal) {
      eventReceiver.onGlobalMouseUp(button);
      return;
    }
    eventReceiver.onMouseUp(button);
  }

  /**
   * Latches modifiers from the keyboard event and copies the last pointer
   * client position for the event's owner document when available.
   *
   * @param event Browser keyboard event.
   */
  private seedPointerStateFromKeyboardEvent(event: KeyboardEvent): void {
    this.updateModifiersFromDomEvent({
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    const ownerDocument = this.resolveOwnerDocumentFromKeyboardEvent(event);
    if (!ownerDocument) {
      return;
    }
    this.lastPointerOwnerDocument = ownerDocument;
    const last = this.services?.getLastPointerClientPosition(ownerDocument);
    if (!last) {
      return;
    }
    this.lastPointerClientX = last.clientX;
    this.lastPointerClientY = last.clientY;
    this.hasLastPointerClient = true;
  }

  /**
   * Resolves the document that owns a keyboard event.
   *
   * @param event Browser keyboard event.
   * @returns Owner document, or null.
   */
  private resolveOwnerDocumentFromKeyboardEvent(event: KeyboardEvent): Document | null {
    if (event.view?.document) {
      return event.view.document;
    }
    return this.resolveOwnerDocumentFromTarget(event.target);
  }

  /**
   * Resolves the document that owns an event target node.
   *
   * @param target Event target node.
   * @returns Owner document, or null.
   */
  private resolveOwnerDocumentFromTarget(target: EventTarget | Node | null): Document | null {
    if (!target || typeof target !== 'object') {
      return null;
    }
    const nodeLike = target as { nodeType?: number; ownerDocument?: Document | null };
    if (nodeLike.nodeType === 9) {
      return target as Document;
    }
    if (nodeLike.ownerDocument) {
      return nodeLike.ownerDocument;
    }
    return null;
  }

  /**
   * Dispatches key-down to the permanent-gizmo path, the focused receiver, GUI
   * fallthrough, tool default shortcuts, or global handling until consumed.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when the key was consumed.
   */
  private dispatchKeyDownChain(keyCode: string, event: KeyboardEvent): boolean {
    if (this.services?.isPermanentGizmoHandleDragActive() === true) {
      return this.dispatchKeyDownDuringPermanentGizmoHandleDrag(keyCode, event);
    }
    const eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onKeyDown(keyCode, event);
      return true;
    }
    let used = eventReceiver.onKeyDown(keyCode, event);
    if (!used) {
      used = this.tryFallThroughFromGuiToTool(keyCode, event);
    }
    if (!used && this.activeEventReceiverIsTool) {
      used = this.dispatchToolModeDefaultShortcuts(keyCode, event);
    }
    if (!used) {
      used = this.services?.handleGlobalKeyDown(keyCode, event) === true;
    }
    return used;
  }

  /**
   * Forwards key-down as a modal key while a permanent gizmo handle drag is
   * active, ends the drag latch when the drag is no longer active, and always
   * reports the key as consumed.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns Always true.
   */
  private dispatchKeyDownDuringPermanentGizmoHandleDrag(keyCode: string, event: KeyboardEvent): boolean {
    this.services?.handleModalKeyDown(keyCode, event);
    if (this.services?.isPermanentGizmoHandleDragActive() !== true) {
      this.onPermanentGizmoHandleDragEnded();
    }
    return true;
  }

  /**
   * When focus is a GUI container that did not consume the key, focuses the
   * active tool and retries key-down on that tool.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when the tool consumed the key.
   */
  private tryFallThroughFromGuiToTool(keyCode: string, event: KeyboardEvent): boolean {
    if (!this.activeEventReceiverIsGuiContainer) {
      return false;
    }
    if (this.isModifierKeyCode(keyCode) || this.isMouseBusy || keyCode === '') {
      return false;
    }
    if (!this.activeTool || !this.trySwitchActiveEventReceiver(this.activeTool)) {
      return false;
    }
    return this.activeTool.onKeyDown(keyCode, event);
  }

  /**
   * Handles Q/W/R/S tool-switch shortcuts, or edit-mode transform shortcuts
   * when edit mode is active.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when a shortcut handled the key.
   */
  private dispatchToolModeDefaultShortcuts(keyCode: string, event: KeyboardEvent): boolean {
    if (this.services?.isEditModeActive()) {
      return this.dispatchEditModeTransformModeShortcuts(keyCode, event);
    }
    if (keyCode === 'KeyQ') {
      this.userSwitchToBoxSelectTool();
      return true;
    }
    if (keyCode === 'KeyW') {
      this.userSwitchToTranslateTool();
      return true;
    }
    if (keyCode === 'KeyR') {
      this.userSwitchToRotateTool();
      return true;
    }
    if (keyCode === 'KeyS' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      this.userSwitchToScaleTool();
      return true;
    }
    return false;
  }

  /**
   * Sets translate, rotate, or scale widget mode for W/R/S when no ctrl, meta,
   * or shift modifier is held on S.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when a transform mode shortcut was handled.
   */
  private dispatchEditModeTransformModeShortcuts(keyCode: string, event: KeyboardEvent): boolean {
    if (keyCode === 'KeyW') {
      this.services?.setWidgetMode(TransformMode.TRANSLATE);
      this.services?.refreshGizmoPresentation();
      return true;
    }
    if (keyCode === 'KeyR') {
      this.services?.setWidgetMode(TransformMode.ROTATE);
      this.services?.refreshGizmoPresentation();
      return true;
    }
    if (keyCode === 'KeyS' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      this.services?.setWidgetMode(TransformMode.SCALE);
      this.services?.refreshGizmoPresentation();
      return true;
    }
    return false;
  }

  /**
   * Returns whether stored services report navigation blocking tools and the
   * active event receiver is not busy.
   *
   * @returns True when tool key handling should be suppressed.
   */
  private shouldSuppressToolKeysForNavigation(): boolean {
    if (!this.services?.isNavigationBlockingTools()) {
      return false;
    }
    if (this.isActiveEventReceiverBusy) {
      return false;
    }
    return true;
  }

  /**
   * Returns whether the key code is only a modifier key.
   *
   * @param keyCode Key code string.
   * @returns True for bare Shift/Ctrl/Alt/Meta.
   */
  private isModifierKeyCode(keyCode: string): boolean {
    return (
      keyCode === 'ShiftLeft' ||
      keyCode === 'ShiftRight' ||
      keyCode === 'ControlLeft' ||
      keyCode === 'ControlRight' ||
      keyCode === 'AltLeft' ||
      keyCode === 'AltRight' ||
      keyCode === 'MetaLeft' ||
      keyCode === 'MetaRight'
    );
  }

  /**
   * Returns whether a receiver is a GUI container.
   *
   * @param receiver Event receiver, or null.
   * @returns True when GUI container.
   */
  private isGuiContainerReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return (
      'getRootElement' in receiver && typeof (receiver as IGuiContainerEventReceiver).getRootElement === 'function'
    );
  }

  /**
   * Returns whether a receiver is a widget.
   *
   * @param receiver Event receiver, or null.
   * @returns True when widget.
   */
  private isWidgetReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return 'wantsActive' in receiver;
  }

  /**
   * Returns whether a receiver is a tool.
   *
   * @param receiver Event receiver, or null.
   * @returns True when tool.
   */
  private isToolReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return 'isSingleUse' in receiver && 'parent' in receiver;
  }
}
