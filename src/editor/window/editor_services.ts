import type { Camera, Mesh, Object3D, Vector3 } from 'three';
import type { TransformMode } from '@/types/transform_mode.js';
import type { ISelectable } from '../i_selectable.js';
import type { EditorViewportPickContext } from './editor_viewport_pick_context.js';

/**
 * Service methods for selection, transform, viewport picking, and interaction
 * state.
 */
export interface EditorServices {
  /**
   * Returns unlocked transform targets for the current selection.
   *
   * @returns Objects that may be transformed.
   */
  getTransformTargets(): Object3D[];

  /**
   * Returns an iterable of selectable wrappers for the currently selected
   * unlocked objects.
   *
   * @returns Selectable objects for the active tool.
   */
  forEachSelectedObject(): Iterable<ISelectable>;

  /**
   * Returns the count of selected transform targets.
   *
   * @returns Selection size.
   */
  getSelectedCount(): number;

  /**
   * Returns the world-space pivot for the current selection.
   *
   * @returns Pivot point.
   */
  getTransformPivot(): Vector3;

  /**
   * Returns the average screen position of the selection.
   *
   * @returns Screen-space average position.
   */
  getSelectedSegmentsAveragePosition(): { x: number; y: number };

  /**
   * Returns whether grid snapping is enabled.
   *
   * @returns True when snapping.
   */
  isSnapping(): boolean;

  /**
   * Returns the grid snap size.
   *
   * @returns Snap increment.
   */
  getGridSnap(): number;

  /**
   * Returns the angle snap in degrees.
   *
   * @returns Angle snap.
   */
  getAngleSnap(): number;

  /**
   * Projects a screen point into grid or world plane coordinates.
   *
   * @param screenX Screen X coordinate.
   * @param screenY Screen Y coordinate.
   * @returns World plane point with x and y components.
   */
  screenPointToGrid(screenX: number, screenY: number): { x: number; y: number };

  /**
   * Projects a grid or world plane point to screen coordinates.
   *
   * @param gridX Grid X coordinate.
   * @param gridY Grid Y coordinate.
   * @returns Screen point.
   */
  gridPointToScreen(gridX: number, gridY: number): { x: number; y: number };

  /**
   * Returns the active viewport camera.
   *
   * @returns Camera or null.
   */
  getActiveCamera(): Camera | null;

  /**
   * Returns the active viewport content element for NDC projection.
   *
   * @returns Pick element or null.
   */
  getActivePickElement(): HTMLElement | null;

  /**
   * Resolves the interactive 2D or 3D pane under a client point. When
   * ownerDocument is set, only panes in that document are considered.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Optional document that owns the client coordinates.
   * @returns Camera and pick element for that pane, or null when over chrome.
   */
  resolveInteractiveViewportAtClientPoint(
    clientX: number,
    clientY: number,
    ownerDocument?: Document | null,
  ): EditorViewportPickContext | null;

  /**
   * Returns the first interactive pane in a document when no pane is hit under
   * a client point.
   *
   * @param ownerDocument Document that should own the pane, or null for any.
   * @returns Camera and pick element, or null when no interactive pane exists.
   */
  resolveFirstInteractiveViewportInDocument(ownerDocument?: Document | null): EditorViewportPickContext | null;

  /**
   * Returns content elements of every interactive pane.
   *
   * @returns Live viewport content elements.
   */
  getInteractiveViewportPickElements(): HTMLElement[];

  /**
   * Begins a single-use transform drag for the given mode and targets.
   *
   * @param mode Transform mode.
   * @param objects Drag targets.
   * @param pivot World pivot.
   * @param camera Active camera.
   * @param pickElement Pick element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns True when started.
   */
  beginSingleUseDrag(
    mode: TransformMode,
    objects: Object3D[],
    pivot: Vector3,
    camera: Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): boolean;

  /**
   * Applies a single-use pointer move sample.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Camera for projection.
   * @param pickElement Pick element for NDC.
   */
  applySingleUsePointerMove(clientX: number, clientY: number, camera: Camera, pickElement: HTMLElement): void;

  /**
   * Returns whether a transform drag is active.
   *
   * @returns True during drag.
   */
  isTransformDragActive(): boolean;

  /**
   * Returns whether a permanent gizmo or bounds handle drag is active,
   * excluding single-use G/R/S drags.
   *
   * @returns True while a handle-picked permanent drag is running.
   */
  isPermanentGizmoHandleDragActive(): boolean;

  /**
   * Routes modal keyboard input during an active drag.
   *
   * @param keyCode Key code.
   * @param event Original keyboard event for modal digit and axis handling.
   * @returns True when consumed.
   */
  handleModalKeyDown(keyCode: string, event: KeyboardEvent): boolean;

  /** Commits the active transform drag. */
  commitActiveTransformDrag(): void;

  /** Cancels the active transform drag and restores poses. */
  cancelActiveTransformDrag(): void;

  /**
   * Pins one or more viewport content elements as the exclusive interaction
   * domain while a tool is busy. Chrome outside these roots is blocked; hits
   * inside any root count as in-viewport.
   *
   * @param pickElements Content roots to allow, or null or empty to clear.
   */
  pinExclusiveViewportDomain(pickElements: readonly HTMLElement[] | null): void;

  /**
   * Pins a single viewport content element as the exclusive interaction domain.
   * Omitting the argument pins every interactive pane.
   *
   * @param pickElement One content element, or null or undefined for all panes.
   */
  pinExclusiveViewport(pickElement?: HTMLElement | null): void;

  /** Restores the default exclusive domain to all interactive panes. */
  clearExclusiveViewport(): void;

  /**
   * Builds the near-to-far world-mesh pick stack under a client point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Unique world meshes ordered closest to farthest.
   */
  pickObjectStackAtClientPoint(clientX: number, clientY: number): Mesh[];

  /** Clears the object selection set. */
  clearObjectSelection(): void;

  /**
   * Picks and applies object selection at a client point, supporting
   * click-through, additive, and toggle modifiers.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param additive True when Shift is held.
   * @param toggle True when Ctrl or Meta is held.
   */
  applyObjectClickSelectionAtClientPoint(clientX: number, clientY: number, additive: boolean, toggle: boolean): void;

  /**
   * Selects or deselects meshes whose projected screen centers fall inside a
   * marquee rectangle in client coordinates.
   *
   * @param clientMinX Marquee min X.
   * @param clientMinY Marquee min Y.
   * @param clientMaxX Marquee max X.
   * @param clientMaxY Marquee max Y.
   * @param subtractive True when the marquee removes from selection.
   */
  applyObjectMarqueeSelection(
    clientMinX: number,
    clientMinY: number,
    clientMaxX: number,
    clientMaxY: number,
    subtractive: boolean,
  ): void;

  /**
   * Probes and begins a permanent gizmo or bounds handle drag under a client
   * point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param modifiers Modifier keys for Alt-duplicate and multi-select skip.
   * @returns True when a handle drag started.
   */
  tryBeginPermanentGizmoDragFromEditorPointer(
    clientX: number,
    clientY: number,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean },
  ): boolean;

  /**
   * Probes whether a permanent gizmo or bounds control is under the pointer
   * without starting a drag.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param modifiers Modifier keys; multi-select skips gizmo probes.
   * @returns True when a control is under the pointer.
   */
  probePermanentGizmoUnderPointer(
    clientX: number,
    clientY: number,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean },
  ): boolean;

  /**
   * Updates bounds face hover highlight and resize cursors under a client
   * point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  updateBoundsHoverAtClientPoint(clientX: number, clientY: number): void;

  /** Clears bounds face hover and forgets the cached hover cursor. */
  clearBoundsHoverAtClientPoint(): void;

  /** Enters face selection mode. */
  enterFaceSelectionMode(): void;

  /** Leaves face selection mode and restores object-mode feedback. */
  leaveFaceSelectionMode(): void;

  /**
   * Returns whether Edit Mode is currently active.
   *
   * @returns True while component editing is live.
   */
  isEditModeActive(): boolean;

  /**
   * Starts an Edit Mode component pick at a client point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param isShiftPressed Additive selection.
   * @param isCtrlPressed Toggle selection.
   * @param ownerDocument Document that owns the client coordinates, or null.
   * @returns True when the pick path ran.
   */
  beginEditSelectPointerDown(
    clientX: number,
    clientY: number,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
    ownerDocument?: Document | null,
  ): boolean;

  /**
   * Starts a face pick or paint stroke at a client point while the face tool is
   * active.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param isShiftPressed True when Shift is held for additive selection.
   * @param isCtrlPressed True when Ctrl or Meta is held for subtractive
   *   selection.
   * @returns True when face mode consumed the press.
   */
  beginFaceSelectPointerDown(
    clientX: number,
    clientY: number,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): boolean;

  /**
   * Continues face paint or UV smear while the button is held.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param buttons PointerEvent.buttons bitfield.
   */
  continueFaceSelectPointerMove(clientX: number, clientY: number, buttons: number): void;

  /** Ends face paint or UV smear. */
  endFaceSelectPointerUp(): void;

  /**
   * Returns whether a face paint or UV smear stroke is live.
   *
   * @returns True while a face stroke is active.
   */
  isFaceSelectStrokeActive(): boolean;

  /**
   * Returns whether grid face-align pick is armed.
   *
   * @returns True while waiting for a face click.
   */
  isGridAlignPickArmed(): boolean;

  /** Disarms grid face-align pick without changing orientation. */
  disarmGridAlignPick(): void;

  /**
   * Attempts a grid face-align pick at the given client point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns True when a face was aligned.
   */
  tryGridAlignPickAtPointer(clientX: number, clientY: number): boolean;

  /**
   * Updates the orange face hover while grid align pick is armed.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  updateGridAlignHoverAtPointer(clientX: number, clientY: number): void;

  /**
   * Sets the persistent gizmo widget mode.
   *
   * @param mode Transform mode.
   */
  setWidgetMode(mode: TransformMode): void;

  /**
   * Returns the persistent gizmo widget mode.
   *
   * @returns Current transform mode.
   */
  getWidgetMode(): TransformMode;

  /** Refreshes gizmo pivot and visibility. */
  refreshGizmoPresentation(): void;

  /**
   * Publishes a status-bar message.
   *
   * @param message Status text.
   */
  setStatusMessage(message: string): void;

  /**
   * Registers an undo operation name before a destructive edit.
   *
   * @param name Undo label.
   */
  registerUndo(name: string): void;

  /** Discards the last registered undo. */
  discardUndo(): void;

  /**
   * Notifies that transform visuals should end after a commit or cancel.
   *
   * @param objects Affected objects.
   * @param reason Commit or cancel.
   */
  publishTransformDragVisualEnd(objects: readonly Object3D[], reason: 'commit' | 'cancel'): void;

  /**
   * Returns the last known pointer client position for a document.
   *
   * @param ownerDocument Document that owns the pointer sample, or null for
   *   main.
   * @returns Client coordinates, or null.
   */
  getLastPointerClientPosition(ownerDocument?: Document | null): { clientX: number; clientY: number } | null;

  /**
   * Returns whether shift is pressed.
   *
   * @returns True when shift is down.
   */
  isShiftPressed(): boolean;

  /**
   * Returns whether ctrl is pressed.
   *
   * @returns True when ctrl is down.
   */
  isCtrlPressed(): boolean;

  /**
   * Returns whether alt is pressed.
   *
   * @returns True when alt is down.
   */
  isAltPressed(): boolean;

  /**
   * Returns whether any modifier is pressed.
   *
   * @returns True when ctrl, shift, alt, or meta is down.
   */
  isModifierPressed(): boolean;

  /**
   * Handles an editor-global keyboard shortcut fallthrough.
   *
   * @param keyCode Key code.
   * @param event Original keyboard event.
   * @returns True when a global shortcut handled the key.
   */
  handleGlobalKeyDown(keyCode: string, event: KeyboardEvent): boolean;

  /**
   * Returns whether camera navigation should suppress tool activation keys.
   *
   * @returns True while fly or pan owns the keyboard for continuous motion.
   */
  isNavigationBlockingTools(): boolean;
}
