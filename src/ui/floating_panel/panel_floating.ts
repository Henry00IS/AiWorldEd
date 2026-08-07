import { Theme } from '@/theme.js';
import { FloatingPanelStack, type FloatingPanelStackLayer } from './panel_floating_stack.js';
import { clampFloatingPanelRectToScreen, FLOATING_PANEL_SCREEN_PADDING_PX } from './panel_floating_screen_bounds.js';
import {
  buildFloatingPanelTitleBar,
  type FloatingPanelTitleBarOptions,
  type FloatingPanelTitleBarParts,
} from './panel_floating_title_bar.js';

/** Startup corner placement relative to the viewport anchor. */
export type FloatingPanelCorner = 'top-left' | 'bottom-left' | 'bottom-right';

/** Construction options for a floating tool window or modal dialog. */
export interface FloatingPanelOptions {
  /** Corner of the anchor used for the first open position. */
  corner: FloatingPanelCorner;
  /**
   * When true, top-left placement sits below the viewport title bar strip. Only
   * applies to top-left corners.
   */
  insetBelowViewportToolbar?: boolean;
  /** Outer padding from the anchor edges in CSS pixels. */
  paddingPx?: number;
  /** When false, title-bar drag is disabled. Defaults to true. */
  draggable?: boolean;
  /** When true, mounts a full-screen dimmed backdrop behind the panel. */
  modal?: boolean;
  /** When true, centers the panel in the viewport (typical for modals). */
  centered?: boolean;
  /** When true and modal, backdrop pointer-down outside the panel closes it. */
  closeOnBackdropClick?: boolean;
  /** When true, Escape hides the panel while it is open. */
  closeOnEscape?: boolean;
  /** Stacking band. Defaults to tool, or modal/confirm when modal is set. */
  stackLayer?: FloatingPanelStackLayer;
  /** Optional class name applied to the modal backdrop element. */
  backdropClassName?: string;
  /** Optional backdrop background CSS. Defaults to a dim scrim when modal. */
  backdropBackground?: string;
}

/**
 * Shared base for floating editor windows and modal dialogs. Owns show/hide,
 * optional modal backdrop, startup anchoring, optional title-bar drag, screen
 * clamping, Escape/backdrop dismiss, and stacking via
 * {@link FloatingPanelStack}.
 *
 * Lifecycle is identical for every subclass: the shell is built in memory on
 * construct, mounted into the host only while open, and removed from the DOM
 * when hidden or disposed.
 */
export abstract class PanelFloating {
  protected readonly root: HTMLElement;
  protected readonly host: HTMLElement;
  private readonly backdrop: HTMLElement | null;
  private defaultAnchor: HTMLElement | null;
  private defaultAnchorResolver: (() => HTMLElement | null) | null;
  private isVisible: boolean;
  private readonly corner: FloatingPanelCorner;
  private readonly insetBelowViewportToolbar: boolean;
  private readonly paddingPx: number;
  private readonly draggable: boolean;
  private readonly modal: boolean;
  private readonly centered: boolean;
  private readonly closeOnBackdropClick: boolean;
  private readonly closeOnEscape: boolean;
  private readonly stackLayer: FloatingPanelStackLayer;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;
  private isShellMounted: boolean;
  private readonly boundDocumentKeyDown: (event: KeyboardEvent) => void;

  /**
   * Creates a floating panel shell. The shell stays out of the document until
   * {@link show} mounts it.
   *
   * @param host Parent element (editor root / toolbar container).
   * @param options Corner, modal, and drag options for placement.
   * @param defaultAnchor Optional viewport container for startup placement.
   */
  protected constructor(host: HTMLElement, options: FloatingPanelOptions, defaultAnchor: HTMLElement | null = null) {
    this.host = host;
    this.defaultAnchor = defaultAnchor;
    this.defaultAnchorResolver = null;
    this.corner = options.corner;
    this.insetBelowViewportToolbar = options.insetBelowViewportToolbar === true;
    this.paddingPx = options.paddingPx ?? FLOATING_PANEL_SCREEN_PADDING_PX;
    this.draggable = options.draggable !== false;
    this.modal = options.modal === true;
    this.centered = options.centered === true || (this.modal && options.centered !== false);
    this.closeOnBackdropClick = options.closeOnBackdropClick ?? this.modal;
    this.closeOnEscape = options.closeOnEscape ?? this.modal;
    this.stackLayer = options.stackLayer ?? (this.modal ? 'modal' : 'tool');
    this.isVisible = false;
    this.isDragging = false;
    this.isShellMounted = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.boundDocumentKeyDown = (event) => this.onDocumentKeyDown(event);
    this.root = this.createShellRoot();
    this.backdrop = this.modal ? this.createModalBackdrop(options) : null;
    FloatingPanelStack.register(this.getStackElement(), () => this.clampToScreenIfVisible(), this.stackLayer);
    this.bindBringToFrontOnPointer();
  }

  /**
   * Sets the element used for the default open position.
   *
   * @param anchor Viewport container, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Sets a live anchor resolver invoked on every open and reposition.
   *
   * @param resolver Callback returning the placement container, or null.
   */
  setDefaultAnchorResolver(resolver: (() => HTMLElement | null) | null): void {
    this.defaultAnchorResolver = resolver;
  }

  /**
   * Returns the current default anchor element when set.
   *
   * @returns Anchor element or null.
   */
  getDefaultAnchor(): HTMLElement | null {
    return this.defaultAnchor;
  }

  /**
   * Mounts the shell under the host and shows it. No-ops when already open
   * (still raises the window in the stack).
   */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.getStackElement(), this.stackLayer);
      return;
    }
    this.isVisible = true;
    this.mountShellIntoHost();
    this.applyVisibleDisplayStyles();
    this.positionDefaultIfNeeded();
    this.clampToScreenIfNeeded();
    FloatingPanelStack.bringToFront(this.getStackElement(), this.stackLayer);
    this.bindEscapeWhileOpen();
    this.onAfterShow();
  }

  /**
   * Hides the panel and removes its shell from the document.
   *
   * @param _force Kept for call-site compatibility; always hides.
   */
  hide(_force: boolean = false): void {
    if (!this.isVisible) {
      return;
    }
    this.isVisible = false;
    this.unbindEscapeWhileOpen();
    this.onAfterHide();
    this.unmountShellFromHost();
  }

  /** Toggles visibility. */
  toggle(): void {
    if (this.isVisible) {
      this.hide(true);
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is visible and mounted.
   *
   * @returns True when shown.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Returns whether the shell is currently attached under the host.
   *
   * @returns True when the panel root (or modal backdrop) is in the document.
   */
  isMountedInHost(): boolean {
    return this.isShellMounted;
  }

  /** Repositions to the default anchor while visible (startup layout pass). */
  repositionToDefaultAnchor(): void {
    if (!this.isVisible) {
      return;
    }
    this.positionDefaultIfNeeded();
    this.clampToScreenIfNeeded();
  }

  /** Clamps the panel into the browser window while it is visible. */
  clampToScreenIfVisible(): void {
    if (!this.isVisible) {
      return;
    }
    this.clampToScreenIfNeeded();
  }

  /** Hides if open, unregisters from the stack, and drops any remaining DOM. */
  dispose(): void {
    this.hide(true);
    FloatingPanelStack.unregister(this.getStackElement());
    this.unmountShellFromHost();
  }

  /**
   * Returns the panel root element (card chrome; tests / host wiring).
   *
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement {
    return this.root;
  }

  /**
   * Returns the modal backdrop element when this panel is modal.
   *
   * @returns Backdrop element, or null for non-modal panels.
   */
  getBackdropElement(): HTMLElement | null {
    return this.backdrop;
  }

  /**
   * Returns the outermost element that owns pointer hit-testing for this window
   * (modal backdrop when present, otherwise the panel root).
   *
   * @returns Interaction root HTML element.
   */
  getInteractionRootElement(): HTMLElement {
    return this.getStackElement();
  }

  /**
   * Binds title-bar drag that keeps the panel inside the screen when enabled.
   *
   * @param bar Title bar element.
   */
  protected bindTitleBarDrag(bar: HTMLElement): void {
    if (!this.draggable) {
      return;
    }
    bar.addEventListener('pointerdown', (event) => this.onTitleBarPointerDown(event));
  }

  /**
   * Builds a standard tool-window title bar with close control and drag
   * binding.
   *
   * @param options Title text and layout options (onClose defaults to hide).
   * @returns Title bar parts for further customization.
   */
  protected createStandardTitleBar(
    options: Omit<FloatingPanelTitleBarOptions, 'onClose' | 'ownerDocument'> & {
      onClose?: () => void;
    },
  ): FloatingPanelTitleBarParts {
    const parts = buildFloatingPanelTitleBar({
      ...options,
      ownerDocument: this.root.ownerDocument,
      onClose: options.onClose ?? (() => this.hide(true)),
    });
    this.bindTitleBarDrag(parts.bar);
    return parts;
  }

  /**
   * Applies a free top/left position and clears bottom/right anchors.
   *
   * @param left CSS left in pixels.
   * @param top CSS top in pixels.
   */
  protected setTopLeftPosition(left: number, top: number): void {
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.bottom = 'auto';
    this.root.style.right = 'auto';
  }

  /**
   * Converts a bottom-anchored layout to top/left using the current rect.
   *
   * @param rect Current panel bounding rect.
   */
  protected convertBottomToTopPosition(rect: DOMRect): void {
    this.setTopLeftPosition(rect.left, rect.top);
  }

  /** Clamps the current panel rect into the browser window. */
  protected clampToScreen(): void {
    const rect = this.root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const clamped = clampFloatingPanelRectToScreen(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      window.innerWidth,
      window.innerHeight,
      this.paddingPx,
    );
    this.setTopLeftPosition(clamped.left, clamped.top);
  }

  /** Called after the panel becomes visible. */
  protected onAfterShow(): void {}

  /** Called after the panel is hidden. */
  protected onAfterHide(): void {}

  /**
   * Returns the element registered with the window stack.
   *
   * @returns Backdrop for modal panels, otherwise the panel root.
   */
  protected getStackElement(): HTMLElement {
    return this.backdrop ?? this.root;
  }

  /** Mounts the shell under the host (backdrop + root when modal). */
  private mountShellIntoHost(): void {
    if (this.isShellMounted) {
      return;
    }
    if (this.backdrop) {
      if (this.root.parentElement !== this.backdrop) {
        this.backdrop.appendChild(this.root);
      }
      this.host.appendChild(this.backdrop);
    } else {
      this.host.appendChild(this.root);
    }
    this.isShellMounted = true;
  }

  /** Removes the outermost shell node from the document. */
  private unmountShellFromHost(): void {
    if (!this.isShellMounted) {
      return;
    }
    if (this.backdrop) {
      this.backdrop.remove();
    } else {
      this.root.remove();
    }
    this.isShellMounted = false;
    this.root.style.display = 'none';
    if (this.backdrop) {
      this.backdrop.style.display = 'none';
    }
  }

  /** Applies display styles used while the panel is open. */
  private applyVisibleDisplayStyles(): void {
    this.root.style.display = 'flex';
    if (this.backdrop) {
      this.backdrop.style.display = 'flex';
    }
  }

  /** Positions using the corner anchor when the panel is not flex-centered. */
  private positionDefaultIfNeeded(): void {
    if (this.centered && this.modal) {
      return;
    }
    this.positionDefault();
  }

  /** Clamps free-positioned panels into the screen. */
  private clampToScreenIfNeeded(): void {
    if (this.centered && this.modal) {
      return;
    }
    this.clampToScreen();
  }

  /**
   * Creates the shell root element; subclasses fill it after super().
   *
   * @returns Empty flex column root (hidden).
   */
  private createShellRoot(): HTMLElement {
    const root = document.createElement('div');
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.userSelect = 'none';
    if (this.modal && this.centered) {
      root.style.position = 'relative';
    } else {
      root.style.position = 'fixed';
    }
    return root;
  }

  /**
   * Creates a full-screen modal backdrop for dialogs.
   *
   * @param options Floating panel options with optional backdrop chrome.
   * @returns Hidden backdrop element.
   */
  private createModalBackdrop(options: FloatingPanelOptions): HTMLElement {
    const backdrop = document.createElement('div');
    if (options.backdropClassName) {
      backdrop.className = options.backdropClassName;
    }
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.display = 'none';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.padding = '24px';
    backdrop.style.background = options.backdropBackground ?? 'rgba(0, 0, 0, 0.55)';
    backdrop.style.boxSizing = 'border-box';
    if (this.closeOnBackdropClick) {
      backdrop.addEventListener('pointerdown', (event) => this.onBackdropPointerDown(event));
    }
    return backdrop;
  }

  /**
   * Closes the panel when the user presses the backdrop outside the card.
   *
   * @param event Pointer event on the backdrop.
   */
  private onBackdropPointerDown(event: PointerEvent): void {
    if (!this.backdrop || event.target !== this.backdrop) {
      return;
    }
    this.hide(true);
  }

  /** Raises this panel when the user interacts with it. */
  private bindBringToFrontOnPointer(): void {
    this.getStackElement().addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(this.getStackElement(), this.stackLayer);
    });
  }

  /** Installs document Escape handling while the panel is open. */
  private bindEscapeWhileOpen(): void {
    if (!this.closeOnEscape) {
      return;
    }
    document.addEventListener('keydown', this.boundDocumentKeyDown);
  }

  /** Removes document Escape handling. */
  private unbindEscapeWhileOpen(): void {
    if (!this.closeOnEscape) {
      return;
    }
    document.removeEventListener('keydown', this.boundDocumentKeyDown);
  }

  /**
   * Handles Escape dismiss while open.
   *
   * @param event Document keydown event.
   */
  private onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    this.hide(true);
  }

  /**
   * Starts title-bar drag when the pointer is not on a button.
   *
   * @param event Pointer down on the title bar.
   */
  private onTitleBarPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') {
      return;
    }
    this.beginDrag(event);
  }

  /**
   * Begins a drag session with screen clamping on move.
   *
   * @param event Pointer down event.
   */
  private beginDrag(event: PointerEvent): void {
    this.isDragging = true;
    FloatingPanelStack.bringToFront(this.getStackElement(), this.stackLayer);
    const rect = this.root.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.root.style.position = 'fixed';
    this.convertBottomToTopPosition(rect);
    const onMove = (moveEvent: PointerEvent) => this.onDragMove(moveEvent);
    const onUp = () => {
      this.isDragging = false;
      this.clampToScreen();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Updates panel position while dragging, clamped to the screen.
   *
   * @param moveEvent Pointer move event.
   */
  private onDragMove(moveEvent: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }
    const rect = this.root.getBoundingClientRect();
    const nextLeft = moveEvent.clientX - this.dragOffsetX;
    const nextTop = moveEvent.clientY - this.dragOffsetY;
    const clamped = clampFloatingPanelRectToScreen(
      { left: nextLeft, top: nextTop, width: rect.width, height: rect.height },
      window.innerWidth,
      window.innerHeight,
      this.paddingPx,
    );
    this.setTopLeftPosition(clamped.left, clamped.top);
  }

  /** Places the panel at the configured corner of the live placement anchor. */
  private positionDefault(): void {
    const anchor = this.resolvePlacementAnchor();
    const rect = anchor.getBoundingClientRect();
    const size = this.resolvePanelSizeForPlacement();
    const leftTop = this.computeDefaultLeftTop(rect, size.width, size.height);
    this.setTopLeftPosition(leftTop.left, leftTop.top);
  }

  /**
   * Resolves the element used for default corner placement.
   *
   * @returns Anchor container for placement (never null).
   */
  private resolvePlacementAnchor(): HTMLElement {
    const liveAnchor = this.defaultAnchorResolver?.() ?? null;
    if (liveAnchor) {
      this.defaultAnchor = liveAnchor;
      return liveAnchor;
    }
    if (this.defaultAnchor?.isConnected) {
      return this.defaultAnchor;
    }
    this.defaultAnchor = null;
    return this.host;
  }

  /**
   * Resolves panel size for corner placement, preferring live layout then CSS.
   *
   * @returns Width and height in CSS pixels.
   */
  private resolvePanelSizeForPlacement(): { width: number; height: number } {
    const size = this.root.getBoundingClientRect();
    if (size.width > 0 && size.height > 0) {
      return { width: size.width, height: size.height };
    }
    const styleWidth = parseFloat(this.root.style.width);
    const styleHeight = parseFloat(this.root.style.height);
    return {
      width: Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : 212,
      height: Number.isFinite(styleHeight) && styleHeight > 0 ? styleHeight : 200,
    };
  }

  /**
   * Computes default left/top for the configured corner inside an anchor rect.
   *
   * @param anchorRect Anchor getBoundingClientRect.
   * @param panelWidth Panel width in CSS pixels.
   * @param panelHeight Panel height in CSS pixels.
   * @returns Unclamped left/top.
   */
  private computeDefaultLeftTop(
    anchorRect: DOMRect,
    panelWidth: number,
    panelHeight: number,
  ): { left: number; top: number } {
    const pad = this.paddingPx;
    if (this.corner === 'top-left') {
      const topInset = this.insetBelowViewportToolbar ? Theme.viewportToolbarHeightPx + pad : pad;
      return { left: anchorRect.left + pad, top: anchorRect.top + topInset };
    }
    if (this.corner === 'bottom-left') {
      return {
        left: anchorRect.left + pad,
        top: anchorRect.bottom - panelHeight - pad,
      };
    }
    return {
      left: anchorRect.right - panelWidth - pad,
      top: anchorRect.bottom - panelHeight - pad,
    };
  }
}
