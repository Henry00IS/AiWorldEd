import { Vector2 } from 'three';
import type { EditorWindow } from './editor_window.js';
import { EditorExclusiveMouseShieldDomain } from './editor_exclusive_mouse_shield_domain.js';
import { claimDomKeyboardFocus } from '@/utils/dom_focus.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/**
 * Routes browser pointer events into editor mouse-down, mouse-up, mouse-move,
 * and mouse-drag handlers.
 *
 * Mouse-down runs only when the pointer is in a pinned viewport. Mouse-up
 * always raises global mouse-up and raises mouse-up only when the release is in
 * a viewport. Outside release still raises global mouse-up. While a button is
 * held, drag is raised in-viewport locally and globally always; otherwise
 * mouse-move is raised. While the active event receiver is busy, full-screen
 * shields cover chrome on the main document and every detached viewport
 * document. Hit-testing peeks under the shield to decide viewport-local versus
 * global routing.
 */
export class EditorInputBridge {
  private readonly editor: EditorWindow;
  private readonly exclusiveShieldDomain: EditorExclusiveMouseShieldDomain;
  private ownerDocument: Document | null;
  private boundPointerDown: ((event: PointerEvent) => void) | null;
  private boundPointerUp: ((event: PointerEvent) => void) | null;
  private boundPointerMove: ((event: PointerEvent) => void) | null;
  private previousMousePosition: Vector2;
  private previousMouseGridPosition: Vector2;
  private exclusiveViewportRoots: HTMLElement[];
  /**
   * Documents that currently have idle capture-phase pointer listeners.
   * Includes the main install document and every detached popup that owns a
   * pinned root.
   */
  private idleListenerDocuments: Set<Document>;
  /**
   * True while RMB/MMB navigation was started through the shield and should
   * keep receiving retargeted move/up until release.
   */
  private navigationPassThroughActive: boolean;
  /** Pane content that currently owns navigation pass-through. */
  private navigationPassThroughRoot: HTMLElement | null;
  /** Document whose shield currently has pointer-events disabled for navigation. */
  private navigationPassThroughDocument: Document | null;
  private boundNavigationWindowPointerUp: ((event: PointerEvent) => void) | null;
  /**
   * Invoked when a pointer hit resolves to a pinned exclusive viewport content
   * root on pointerdown (not on move).
   */
  private exclusiveRootHitListener: ((root: HTMLElement) => void) | null;

  /**
   * Creates an input bridge bound to the editor window.
   *
   * @param editor Editor window that receives routed mouse events and state.
   */
  constructor(editor: EditorWindow) {
    this.editor = editor;
    this.exclusiveShieldDomain = new EditorExclusiveMouseShieldDomain();
    this.ownerDocument = null;
    this.boundPointerDown = null;
    this.boundPointerUp = null;
    this.boundPointerMove = null;
    this.previousMousePosition = new Vector2();
    this.previousMouseGridPosition = new Vector2();
    this.exclusiveViewportRoots = [];
    this.idleListenerDocuments = new Set();
    this.navigationPassThroughActive = false;
    this.navigationPassThroughRoot = null;
    this.navigationPassThroughDocument = null;
    this.boundNavigationWindowPointerUp = null;
    this.exclusiveRootHitListener = null;
  }

  /**
   * Sets a listener notified on exclusive-viewport pointerdown hits (not move).
   *
   * @param listener Callback receiving the content root, or null to clear.
   */
  setExclusiveRootHitListener(listener: ((root: HTMLElement) => void) | null): void {
    this.exclusiveRootHitListener = listener;
  }

  /**
   * Pins the exclusive interaction domain (one or more pane content elements).
   * Hits inside any root count as in-viewport; chrome outside is blocked while
   * the active tool is busy. Shields mount on every distinct owner document of
   * the pinned roots plus the main install document.
   *
   * @param roots Viewport content elements, or null/empty to clear.
   */
  setExclusiveViewportRoots(roots: readonly HTMLElement[] | null): void {
    this.exclusiveViewportRoots = roots ? [...roots] : [];
    this.syncIdleDocumentListeners();
    this.syncExclusiveShieldMount();
  }

  /**
   * Pins a single exclusive viewport content element (single-use convenience).
   *
   * @param root Viewport content element, or null to clear.
   */
  setExclusiveViewportRoot(root: HTMLElement | null): void {
    this.setExclusiveViewportRoots(root ? [root] : null);
  }

  /**
   * Returns the first pinned exclusive viewport content, if any.
   *
   * @returns Viewport content element, or null.
   */
  getExclusiveViewportRoot(): HTMLElement | null {
    return this.exclusiveViewportRoots[0] ?? null;
  }

  /**
   * Returns all pinned exclusive viewport content elements.
   *
   * @returns Exclusive domain roots.
   */
  getExclusiveViewportRoots(): readonly HTMLElement[] {
    return this.exclusiveViewportRoots;
  }

  /**
   * Returns whether any exclusive mouse shield is currently mounted.
   *
   * @returns True while busy exclusive overlays cover chrome.
   */
  isExclusiveShieldMounted(): boolean {
    return this.exclusiveShieldDomain.isAnyMounted();
  }

  /**
   * Returns how many document-scoped exclusive shields are mounted.
   *
   * @returns Mounted shield count (main + detached documents).
   */
  getMountedExclusiveShieldCount(): number {
    return this.exclusiveShieldDomain.getMountedShieldCount();
  }

  /**
   * Returns the mounted exclusive shield root for a document.
   *
   * @param ownerDocument Document that may host a shield.
   * @returns Shield element, or null.
   */
  getMountedExclusiveShieldElement(ownerDocument: Document): HTMLElement | null {
    return this.exclusiveShieldDomain.getMountedShieldElement(ownerDocument);
  }

  /**
   * Installs document listeners and prepares the exclusive shield domain.
   *
   * @param hostElement Root used only to resolve the owner document.
   */
  install(hostElement: HTMLElement): void {
    this.uninstall();
    this.ownerDocument = hostElement.ownerDocument;
    this.boundPointerDown = (event) => this.handleDocumentPointerDown(event);
    this.boundPointerUp = (event) => this.handleDocumentPointerUp(event);
    this.boundPointerMove = (event) => this.handleDocumentPointerMove(event);
    this.exclusiveShieldDomain.setListeners({
      onPointerDown: (event) => this.handleShieldPointerDown(event),
      onPointerUp: (event) => this.handleShieldPointerUp(event),
      onPointerMove: (event) => this.handleShieldPointerMove(event),
      onContextMenu: (event) => this.handleShieldContextMenu(event),
      onWheel: (event) => this.handleShieldWheel(event),
    });
    this.attachDocumentListeners();
    this.syncExclusiveShieldMount();
  }

  /** Removes listeners and the exclusive shields. */
  uninstall(): void {
    this.endNavigationPassThrough();
    this.detachDocumentListeners();
    this.exclusiveShieldDomain.setListeners(null);
    this.exclusiveShieldDomain.unmountAll();
    this.ownerDocument = null;
    this.boundPointerDown = null;
    this.boundPointerUp = null;
    this.boundPointerMove = null;
  }

  /**
   * Idle document pointerdown (capture phase). While the busy shield is
   * mounted, only shield handlers start new presses (avoids retargeted
   * navigation events re-entering the document path). When idle, arms presses
   * over pinned viewports. Mounts the shield only when the receiver becomes
   * busy.
   *
   * @param event Browser pointer event.
   */
  private handleDocumentPointerDown(event: PointerEvent): void {
    this.syncExclusiveShieldMount();
    if (this.isEventTargetExclusiveShield(event) || this.isExclusiveShieldMounted()) {
      return;
    }
    if (this.isEventTargetFloatingWindow(event)) {
      return;
    }
    if (this.exclusiveViewportRoots.length === 0) {
      return;
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    if (!hitRoot) {
      return;
    }
    this.notifyExclusiveRootHit(hitRoot);
    this.claimViewportDomKeyboardFocus(hitRoot);
    this.routeEditorMouseDown(event, true);
    this.syncExclusiveShieldMount();
  }

  /**
   * Idle document pointerup (capture phase). Completes an armed viewport press
   * when the event is not on the shield. Armed ups must not be dropped when a
   * shield is or was mounted (pointer capture, busy cleared on down).
   *
   * @param event Browser pointer event.
   */
  private handleDocumentPointerUp(event: PointerEvent): void {
    if (this.isEventTargetExclusiveShield(event)) {
      return;
    }
    if (!this.editor.isLeftMousePressed && !this.editor.isRightMousePressed) {
      this.syncExclusiveShieldMount();
      return;
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    this.routeEditorMouseUp(event, hitRoot !== null);
    this.syncExclusiveShieldMount();
  }

  /**
   * Idle document pointermove (capture phase). Defers shield-target events.
   * While busy exclusive is mounted and no button is armed, ignore (shield owns
   * hover). Armed moves always route so pointer-capture drags keep working.
   *
   * @param event Browser pointer event.
   */
  private handleDocumentPointerMove(event: PointerEvent): void {
    if (this.isEventTargetExclusiveShield(event)) {
      return;
    }
    if (!this.editor.isLeftMousePressed && !this.editor.isRightMousePressed) {
      if (this.isExclusiveShieldMounted()) {
        return;
      }
      if (this.exclusiveViewportRoots.length === 0) {
        this.updateMousePositionOnly(event);
        return;
      }
      this.routeEditorMouseMove(
        event,
        this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event) !== null,
      );
      return;
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    this.routeEditorMouseMove(event, hitRoot !== null);
    this.syncExclusiveShieldMount();
  }

  /**
   * Shield pointerdown while busy. LMB owns tool placement; RMB/MMB over the
   * pinned viewport are retargeted so 3D fly and 2D pan keep working.
   *
   * @param event Browser pointer event on the shield.
   */
  private handleShieldPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isViewportNavigationButton(event.button)) {
      const navigationRoot = this.findNavigationRootAtClientPoint(event.clientX, event.clientY, event);
      if (navigationRoot) {
        this.beginNavigationPassThrough(event, navigationRoot);
        return;
      }
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    if (hitRoot) {
      this.notifyExclusiveRootHit(hitRoot);
      this.claimViewportDomKeyboardFocus(hitRoot);
    }
    this.routeEditorMouseDown(event, hitRoot !== null);
    this.syncExclusiveShieldMount();
  }

  /**
   * Shield pointerup while busy.
   *
   * @param event Browser pointer event on the shield.
   */
  private handleShieldPointerUp(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.navigationPassThroughActive) {
      const root = this.navigationPassThroughRoot;
      if (root && this.isRetargetRootSameDocumentAsEvent(event, root)) {
        this.retargetPointerEventToViewportRoot(event, root);
      }
      if (!this.areNavigationButtonsHeld(event.buttons)) {
        this.endNavigationPassThrough();
      }
      this.syncExclusiveShieldMount();
      return;
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    this.routeEditorMouseUp(event, hitRoot !== null);
    this.syncExclusiveShieldMount();
  }

  /**
   * Shield pointermove while busy.
   *
   * @param event Browser pointer event on the shield.
   */
  private handleShieldPointerMove(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.navigationPassThroughActive) {
      if (!this.areNavigationButtonsHeld(event.buttons)) {
        this.endNavigationPassThrough();
        this.syncExclusiveShieldMount();
        return;
      }
      const root = this.navigationPassThroughRoot;
      if (root && this.isRetargetRootSameDocumentAsEvent(event, root)) {
        this.retargetPointerEventToViewportRoot(event, root);
      }
      return;
    }
    const hitRoot = this.findExclusiveRootAtClientPoint(event.clientX, event.clientY, event);
    this.routeEditorMouseMove(event, hitRoot !== null);
    this.syncExclusiveShieldMount();
  }

  /**
   * Blocks the browser context menu while the exclusive shield is active so
   * tools and viewport navigation can own right-click.
   *
   * @param event Context menu event on the shield.
   */
  private handleShieldContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Forwards wheel zoom/scroll to the pinned viewport when the pointer is over
   * it.
   *
   * @param event Wheel event on the shield.
   */
  private handleShieldWheel(event: WheelEvent): void {
    const hitRoot = this.findNavigationRootAtClientPoint(event.clientX, event.clientY, event);
    if (!hitRoot) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.retargetWheelEventToViewportRoot(event, hitRoot);
  }

  /**
   * Returns whether the button is viewport navigation (middle pan / right
   * fly-pan).
   *
   * @param button Mouse button index.
   * @returns True for middle or right button.
   */
  private isViewportNavigationButton(button: number): boolean {
    return button === 1 || button === 2;
  }

  /**
   * Returns whether middle or right mouse buttons are still held.
   *
   * @param buttons PointerEvent.buttons bitfield.
   * @returns True while navigation buttons remain down.
   */
  private areNavigationButtonsHeld(buttons: number): boolean {
    const middleOrRightMask = 2 | 4;
    return (buttons & middleOrRightMask) !== 0;
  }

  /**
   * Re-dispatches a pointer event onto a viewport content element so camera
   * fly/pan listeners receive it (exclusive shield owns the real target).
   * Refuses cross-document retarget so detached client coordinates never drive
   * main-window panes (and vice versa).
   *
   * @param event Original shield pointer event.
   * @param root Viewport content that should receive the event.
   */
  private retargetPointerEventToViewportRoot(event: PointerEvent, root: HTMLElement): void {
    if (!this.isRetargetRootSameDocumentAsEvent(event, root)) {
      return;
    }
    const retargeted = new PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      movementX: event.movementX,
      movementY: event.movementY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      pressure: event.pressure,
      width: event.width,
      height: event.height,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
    });
    root.dispatchEvent(retargeted);
  }

  /**
   * Re-dispatches a wheel event onto a viewport content element.
   *
   * @param event Original shield wheel event.
   * @param root Viewport content element that should receive the event.
   */
  private retargetWheelEventToViewportRoot(event: WheelEvent, root: HTMLElement): void {
    if (!this.isRetargetRootSameDocumentAsEvent(event, root)) {
      return;
    }
    const retargeted = new WheelEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    root.dispatchEvent(retargeted);
  }

  /**
   * Returns whether a retarget root lives in the same document as the shield
   * event so client coordinates stay window-local. When the shield document
   * cannot be resolved, still allows retarget if the root is a pinned exclusive
   * root (avoids dropping detached navigation when document identity is
   * fuzzy).
   *
   * @param event Shield pointer or wheel event.
   * @param root Candidate viewport content root.
   * @returns True when retarget is safe for this event.
   */
  private isRetargetRootSameDocumentAsEvent(event: Event, root: HTMLElement): boolean {
    const eventDocument = this.resolveEventDocument(event);
    if (eventDocument) {
      return root.ownerDocument === eventDocument;
    }
    return this.exclusiveViewportRoots.includes(root);
  }

  /**
   * Updates mouse state from the pointer and raises mouse-down when the hit is
   * inside the viewport; does nothing when the hit is outside.
   *
   * @param event Pointer event that supplies position, button, target, and
   *   modifiers.
   * @param inViewport Whether the hit is inside the exclusive viewport.
   */
  private routeEditorMouseDown(event: PointerEvent, inViewport: boolean): void {
    if (!inViewport) {
      return;
    }
    this.snapshotPreviousMouse();
    this.editor.updateMouseStateFromPointer(
      event.clientX,
      event.clientY,
      this.resolveEventTargetNode(event.target),
      event.button,
      true,
      this.resolveEventDocument(event),
      this.resolveModifierFlagsFromEvent(event),
    );
    this.editor.onMouseDown(event.button);
  }

  /**
   * Updates mouse state from the pointer, always raises global mouse-up, and
   * raises mouse-up when the release is over the viewport.
   *
   * @param event Pointer event that supplies position, button, target, and
   *   modifiers.
   * @param inViewport Whether the release is over the viewport.
   */
  private routeEditorMouseUp(event: PointerEvent, inViewport: boolean): void {
    this.editor.updateMouseStateFromPointer(
      event.clientX,
      event.clientY,
      this.resolveEventTargetNode(event.target),
      event.button,
      false,
      this.resolveEventDocument(event),
      this.resolveModifierFlagsFromEvent(event),
    );
    this.editor.onGlobalMouseUp(event.button);
    if (inViewport) {
      this.editor.onMouseUp(event.button);
    }
  }

  /**
   * Updates mouse state from the pointer and raises drag or move events from
   * the position delta since the previous snapshot.
   *
   * @param event Pointer event that supplies position, target, and modifiers.
   * @param inViewport Whether the pointer is over the viewport.
   */
  private routeEditorMouseMove(event: PointerEvent, inViewport: boolean): void {
    this.snapshotPreviousMouse();
    this.editor.updateMouseStateFromPointer(
      event.clientX,
      event.clientY,
      this.resolveEventTargetNode(event.target),
      -1,
      false,
      this.resolveEventDocument(event),
      this.resolveModifierFlagsFromEvent(event),
    );
    const screenDelta = this.editor.mousePosition.clone().sub(this.previousMousePosition);
    const gridDelta = this.editor.mouseGridPosition.clone().sub(this.previousMouseGridPosition);
    if (this.editor.isLeftMousePressed || this.editor.isRightMousePressed) {
      const button = this.editor.isLeftMousePressed ? 0 : 1;
      if (inViewport) {
        this.editor.onMouseDrag(button, screenDelta, gridDelta);
      }
      this.editor.onGlobalMouseDrag(button, screenDelta, gridDelta);
      return;
    }
    this.editor.onMouseMove(screenDelta, gridDelta);
  }

  /**
   * Updates editor mouse coordinates without raising tool mouse events.
   *
   * @param event Pointer event.
   */
  private updateMousePositionOnly(event: PointerEvent): void {
    this.editor.updateMouseStateFromPointer(
      event.clientX,
      event.clientY,
      this.resolveEventTargetNode(event.target),
      -1,
      false,
      this.resolveEventDocument(event),
      this.resolveModifierFlagsFromEvent(event),
    );
  }

  /**
   * Returns the shift, ctrl, alt, and meta key flags from a pointer event.
   *
   * @param event Pointer event whose modifier key properties are read.
   * @returns Object with shiftKey, ctrlKey, altKey, and metaKey booleans from
   *   the event.
   */
  private resolveModifierFlagsFromEvent(event: PointerEvent): {
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  } {
    return {
      shiftKey: event.shiftKey === true,
      ctrlKey: event.ctrlKey === true,
      altKey: event.altKey === true,
      metaKey: event.metaKey === true,
    };
  }

  /**
   * Mounts or unmounts exclusive shields on the main document and every
   * detached viewport document that owns a pinned exclusive root.
   */
  private syncExclusiveShieldMount(): void {
    if (!this.shouldUseExclusiveShield()) {
      this.endNavigationPassThrough();
      this.exclusiveShieldDomain.unmountAll();
      return;
    }
    this.exclusiveShieldDomain.syncMountedDocuments(this.collectExclusiveShieldDocuments());
    if (this.navigationPassThroughActive && this.navigationPassThroughDocument) {
      this.exclusiveShieldDomain.setBlocksPointerEventsForDocument(this.navigationPassThroughDocument, false);
    }
  }

  /**
   * Collects every document that must host a blocking overlay while busy.
   *
   * @returns Unique owner documents for main install + pinned roots.
   */
  private collectExclusiveShieldDocuments(): Document[] {
    const documents = new Set<Document>();
    if (this.ownerDocument) {
      documents.add(this.ownerDocument);
    }
    for (const root of this.exclusiveViewportRoots) {
      documents.add(root.ownerDocument);
    }
    return [...documents];
  }

  /**
   * Returns whether exclusive shields should cover chrome over the page.
   *
   * @returns True when exclusive roots are pinned and the active event receiver
   *   is busy.
   */
  private shouldUseExclusiveShield(): boolean {
    if (this.exclusiveViewportRoots.length === 0) {
      return false;
    }
    return this.editor.isActiveEventReceiverBusy;
  }

  /**
   * Returns whether the event target is a mounted exclusive mouse shield root.
   *
   * @param event Browser pointer event.
   * @returns True when shield handlers will own this event at the target phase.
   */
  private isEventTargetExclusiveShield(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.getAttribute('data-editor-exclusive-mouse-shield') === 'true') {
      return true;
    }
    const ownerDocument = target.ownerDocument;
    if (!ownerDocument) {
      return false;
    }
    return this.exclusiveShieldDomain.getMountedShieldElement(ownerDocument) === target;
  }

  /**
   * Returns whether the event landed on a floating editor window or open menu
   * surface (tool panel, modal backdrop, toolbar dropdown, context menu).
   * Coordinate viewport hits under those overlays must not start tool presses.
   *
   * @param event Browser pointer event.
   * @returns True when the target belongs to a registered overlay surface.
   */
  private isEventTargetFloatingWindow(event: Event): boolean {
    return FloatingPanelStack.containsEventTarget(event.target);
  }

  /**
   * Finds which exclusive viewport content owns a client point in the event's
   * document. Uses the shield that raised the event so main and detached
   * windows never share hit tests.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param event Event used to resolve the source document.
   * @returns Matching content root, or null.
   */
  private findExclusiveRootAtClientPoint(clientX: number, clientY: number, event: Event): HTMLElement | null {
    const eventDocument = this.resolveEventDocument(event);
    return this.exclusiveShieldDomain.findExclusiveRootAtClientPoint(
      clientX,
      clientY,
      this.exclusiveViewportRoots,
      eventDocument,
    );
  }

  /**
   * Resolves a navigation/wheel target for the shield event document.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param event Event used to resolve the source document.
   * @returns Navigation content root, or null.
   */
  private findNavigationRootAtClientPoint(clientX: number, clientY: number, event: Event): HTMLElement | null {
    const eventDocument = this.resolveEventDocument(event);
    return this.exclusiveShieldDomain.findNavigationRootAtClientPoint(
      clientX,
      clientY,
      this.exclusiveViewportRoots,
      eventDocument,
    );
  }

  /**
   * Notifies the exclusive-root hit listener for a pointerdown content hit.
   *
   * @param root Hit exclusive content root from a press (not move).
   */
  private notifyExclusiveRootHit(root: HTMLElement): void {
    this.exclusiveRootHitListener?.(root);
  }

  /**
   * Resolves the document that raised a pointer or wheel event. Idle listeners
   * are on Document itself (ownerDocument is null); busy listeners are on the
   * shield element. Never cross-matches main and detached windows.
   *
   * @param event Browser event.
   * @returns Source document, or null.
   */
  private resolveEventDocument(event: Event): Document | null {
    const fromShield = this.exclusiveShieldDomain.resolveBoundDocumentFromEvent(event);
    if (fromShield) {
      return fromShield;
    }
    const fromCurrent = this.resolveDocumentFromEventTarget(event.currentTarget);
    if (fromCurrent) {
      return fromCurrent;
    }
    const fromTarget = this.resolveDocumentFromEventTarget(event.target);
    if (fromTarget) {
      return fromTarget;
    }
    return this.ownerDocument;
  }

  /**
   * Resolves a Document from an event target without cross-realm instanceof.
   * Detached popup documents fail `instanceof Document` against the main
   * realm.
   *
   * @param target Event currentTarget or target.
   * @returns Self document (nodeType 9) or ownerDocument, or null.
   */
  private resolveDocumentFromEventTarget(target: EventTarget | null): Document | null {
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
   * Starts viewport navigation pass-through: delivers the initial button event
   * to the hit pane, then opens the shield so subsequent real pointer events
   * reach that pane (trusted movement / pointer lock).
   *
   * @param event Shield pointerdown that began navigation.
   * @param hitRoot Viewport content that owns the navigation gesture.
   */
  private beginNavigationPassThrough(event: PointerEvent, hitRoot: HTMLElement): void {
    this.navigationPassThroughActive = true;
    this.navigationPassThroughRoot = hitRoot;
    this.navigationPassThroughDocument = this.resolveEventDocument(event);
    this.claimViewportDomKeyboardFocus(hitRoot);
    this.retargetPointerEventToViewportRoot(event, hitRoot);
    if (this.navigationPassThroughDocument) {
      this.exclusiveShieldDomain.setBlocksPointerEventsForDocument(this.navigationPassThroughDocument, false);
    }
    this.attachNavigationWindowPointerUpListener(event);
    this.syncExclusiveShieldMount();
  }

  /**
   * Moves browser keyboard focus onto the viewport content so chrome controls
   * no longer light up or activate on key press.
   *
   * @param viewportRoot Viewport content element under the pointer.
   */
  private claimViewportDomKeyboardFocus(viewportRoot: HTMLElement): void {
    claimDomKeyboardFocus(viewportRoot);
  }

  /** Ends navigation pass-through and restores shield pointer capture. */
  private endNavigationPassThrough(): void {
    this.detachNavigationWindowPointerUpListener();
    if (this.navigationPassThroughDocument) {
      this.exclusiveShieldDomain.setBlocksPointerEventsForDocument(this.navigationPassThroughDocument, true);
    }
    this.navigationPassThroughActive = false;
    this.navigationPassThroughRoot = null;
    this.navigationPassThroughDocument = null;
  }

  /**
   * Listens for navigation button release on the event window when the shield
   * is open for pass-through and may not receive the up event.
   *
   * @param event Gesture-start pointer event used to resolve the window.
   */
  private attachNavigationWindowPointerUpListener(event: PointerEvent): void {
    this.detachNavigationWindowPointerUpListener();
    const ownerWindow = this.resolveEventDocument(event)?.defaultView;
    if (!ownerWindow) {
      return;
    }
    this.boundNavigationWindowPointerUp = (upEvent) => {
      if (this.isViewportNavigationButton(upEvent.button) || !this.areNavigationButtonsHeld(upEvent.buttons)) {
        this.endNavigationPassThrough();
        this.syncExclusiveShieldMount();
      }
    };
    ownerWindow.addEventListener('pointerup', this.boundNavigationWindowPointerUp, true);
    ownerWindow.addEventListener('pointercancel', this.boundNavigationWindowPointerUp, true);
  }

  /** Removes temporary navigation window release listeners. */
  private detachNavigationWindowPointerUpListener(): void {
    if (!this.boundNavigationWindowPointerUp) {
      return;
    }
    const docs = new Set<Document>();
    if (this.navigationPassThroughDocument) {
      docs.add(this.navigationPassThroughDocument);
    }
    if (this.ownerDocument) {
      docs.add(this.ownerDocument);
    }
    for (const doc of docs) {
      const view = doc.defaultView;
      if (!view) {
        continue;
      }
      view.removeEventListener('pointerup', this.boundNavigationWindowPointerUp, true);
      view.removeEventListener('pointercancel', this.boundNavigationWindowPointerUp, true);
    }
    this.boundNavigationWindowPointerUp = null;
  }

  /** Copies current mouse positions before a state update. */
  private snapshotPreviousMouse(): void {
    this.previousMousePosition.copy(this.editor.mousePosition);
    this.previousMouseGridPosition.copy(this.editor.mouseGridPosition);
  }

  /**
   * Resolves an EventTarget to a Node for hit-testing without cross-realm
   * instanceof (detached popup nodes fail `instanceof Node` against main).
   *
   * @param target Event target.
   * @returns Node when possible, otherwise null.
   */
  private resolveEventTargetNode(target: EventTarget | null): Node | null {
    if (!target || typeof target !== 'object') {
      return null;
    }
    const nodeLike = target as { nodeType?: number };
    if (typeof nodeLike.nodeType === 'number') {
      return target as Node;
    }
    return null;
  }

  /**
   * Attaches idle capture-phase listeners on the main install document and
   * every detached popup document that owns a pinned exclusive root.
   */
  private attachDocumentListeners(): void {
    this.syncIdleDocumentListeners();
  }

  /** Removes idle document listeners from every document that still has them. */
  private detachDocumentListeners(): void {
    for (const doc of this.idleListenerDocuments) {
      this.removeIdleListenersFromDocument(doc);
    }
    this.idleListenerDocuments.clear();
  }

  /**
   * Keeps idle pointer listeners in sync with the main install document and the
   * owner documents of pinned exclusive roots so detached popups receive LMB.
   */
  private syncIdleDocumentListeners(): void {
    if (!this.boundPointerDown || !this.boundPointerUp || !this.boundPointerMove) {
      return;
    }
    const desiredDocuments = new Set(this.collectExclusiveShieldDocuments());
    for (const doc of this.idleListenerDocuments) {
      if (!desiredDocuments.has(doc)) {
        this.removeIdleListenersFromDocument(doc);
        this.idleListenerDocuments.delete(doc);
      }
    }
    for (const doc of desiredDocuments) {
      if (this.idleListenerDocuments.has(doc)) {
        continue;
      }
      if (!this.canAttachIdleListenersToDocument(doc)) {
        continue;
      }
      this.addIdleListenersToDocument(doc);
      this.idleListenerDocuments.add(doc);
    }
  }

  /**
   * Returns whether a document can host capture-phase idle pointer listeners.
   *
   * @param doc Candidate document (main or detached popup).
   * @returns True when add/removeEventListener are available.
   */
  private canAttachIdleListenersToDocument(doc: Document): boolean {
    return typeof doc.addEventListener === 'function' && typeof doc.removeEventListener === 'function';
  }

  /**
   * Attaches idle capture-phase pointer listeners to one document.
   *
   * @param doc Document that should receive idle pointer routing.
   */
  private addIdleListenersToDocument(doc: Document): void {
    if (!this.boundPointerDown || !this.boundPointerUp || !this.boundPointerMove) {
      return;
    }
    doc.addEventListener('pointerdown', this.boundPointerDown, true);
    doc.addEventListener('pointerup', this.boundPointerUp, true);
    doc.addEventListener('pointermove', this.boundPointerMove, true);
  }

  /**
   * Removes idle capture-phase pointer listeners from one document.
   *
   * @param doc Document that previously hosted idle pointer routing.
   */
  private removeIdleListenersFromDocument(doc: Document): void {
    if (this.boundPointerDown) {
      doc.removeEventListener('pointerdown', this.boundPointerDown, true);
    }
    if (this.boundPointerUp) {
      doc.removeEventListener('pointerup', this.boundPointerUp, true);
    }
    if (this.boundPointerMove) {
      doc.removeEventListener('pointermove', this.boundPointerMove, true);
    }
  }
}
