import * as THREE from 'three';
import { Theme } from '../theme.js';
import { InputManager } from '../managers/input/input_manager.js';
import { createViewportForKind } from './viewport_factory.js';
import { ViewportKind, getViewportKindDisplayLabel } from './viewport_kind.js';
import type { EditorViewport } from './editor_viewport.js';
import { isPerspectiveViewport } from './editor_viewport.js';
import { SharedWebGLSurface } from './shared_webgl_surface.js';
import { MultiViewComposer } from './multi_view_composer.js';
import { disposeEditorViewport } from './viewport_dispose.js';
import { applyDetachedWindowFavicon, embedDetachedWindowFaviconDataUrl } from './detached_window_favicon.js';
import { DETACHED_HOST_WATCH_INTERVAL_MS, isDetachedHostGone } from './detached_host_liveness.js';
import type { DetachedViewportRenderSource } from './detached_viewport_render_source.js';

/**
 * Builds the popup workspace surface. Defaults to a real SharedWebGLSurface.
 *
 * @param workspaceElement Pane host element in the popup document.
 * @returns Surface used for multi-view scissor rendering.
 */
export type DetachedSurfaceFactory = (workspaceElement: HTMLElement) => SharedWebGLSurface;

/**
 * Lifecycle hooks so the main editor can wire selection, tools, and gizmo onto
 * each detached pane with the same code paths as in-window panes.
 */
export interface DetachedViewportSessionHooks {
  /**
   * Invoked after a live viewport is created or recreated (kind change).
   *
   * @param viewport New editor viewport instance.
   */
  onViewportReady?: (viewport: EditorViewport) => void;

  /**
   * Invoked just before a viewport is disposed (kind change or window close).
   *
   * @param viewport Viewport about to be torn down.
   */
  onViewportDisposed?: (viewport: EditorViewport) => void;

  /**
   * Invoked after the popup window exists and is ready for host listeners.
   *
   * @param popup Opened popup window.
   * @param sessionId Stable id of this session.
   */
  onPopupWindowReady?: (popup: Window, sessionId: string) => void;

  /**
   * Invoked just before popup resources are released so host listeners can
   * detach from that window.
   *
   * @param popup Popup window being closed.
   * @param sessionId Stable id of this session.
   */
  onPopupWindowClosed?: (popup: Window, sessionId: string) => void;

  /**
   * Invoked after the session fully closes and releases GPU resources.
   *
   * @param sessionId Stable id of the closed session.
   */
  onSessionClosed?: (sessionId: string) => void;

  /**
   * Invoked immediately before drawing a detached pane, matching the main
   * layout multi-view prepare path (CAD ruler isolation, etc.).
   *
   * @param viewport Detached viewport about to render.
   */
  prepareViewportPass?: (viewport: EditorViewport) => void;

  /**
   * Invoked immediately after drawing a detached pane, matching the main layout
   * multi-view finalize path.
   *
   * @param viewport Detached viewport that just rendered.
   */
  finalizeViewportPass?: (viewport: EditorViewport) => void;
}

/** Construction options for one detached popup session. */
export interface DetachedViewportSessionOptions {
  sessionId: string;
  renderSource: DetachedViewportRenderSource;
  createSurface: DetachedSurfaceFactory;
  hooks?: DetachedViewportSessionHooks;
  initialKind?: ViewportKind;
}

/**
 * One detached multi-monitor viewport popup. Hosts a real editor viewport
 * through {@link createViewportForKind} so toolbar, grid, shading, navigation,
 * selection, and tools share the same code as in-window panes.
 */
export class DetachedViewportSession {
  private readonly sessionId: string;
  private readonly renderSource: DetachedViewportRenderSource;
  private readonly createSurface: DetachedSurfaceFactory;
  private readonly hooks: DetachedViewportSessionHooks;
  private popup: Window | null;
  private paneHost: HTMLElement | null;
  private surface: SharedWebGLSurface | null;
  private multiViewComposer: MultiViewComposer | null;
  private viewport: EditorViewport | null;
  private popupInputManager: InputManager | null;
  private animationFrameId: number | null;
  private hostWatchIntervalId: number | null;
  private lastFrameTime: number;
  private isDisposed: boolean;
  private hasClosedPopup: boolean;
  private currentKind: ViewportKind;

  /**
   * Creates an idle session that does not open a window until {@link open}.
   *
   * @param options Session identity, scene source, and optional hooks.
   */
  constructor(options: DetachedViewportSessionOptions) {
    this.sessionId = options.sessionId;
    this.renderSource = options.renderSource;
    this.createSurface = options.createSurface;
    this.hooks = options.hooks ?? {};
    this.popup = null;
    this.paneHost = null;
    this.surface = null;
    this.multiViewComposer = null;
    this.viewport = null;
    this.popupInputManager = null;
    this.animationFrameId = null;
    this.hostWatchIntervalId = null;
    this.lastFrameTime = 0;
    this.isDisposed = false;
    this.hasClosedPopup = false;
    this.currentKind = options.initialKind ?? ViewportKind.PERSPECTIVE;
  }

  /**
   * Returns the stable id for this popup session.
   *
   * @returns Session id string.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Opens the popup and allocates a live viewport. No-ops when already open.
   *
   * @returns True when a window is open after the call.
   */
  open(): boolean {
    if (this.isDisposed) return false;
    if (this.popup && !this.popup.closed) {
      this.popup.focus();
      return true;
    }
    if (!this.canOpenPopup()) return false;
    const opened = this.openPopupWindow();
    if (!opened) return false;
    this.popup = opened;
    this.hasClosedPopup = false;
    this.paneHost = this.writeDetachedShell(opened);
    this.popupInputManager = new InputManager(opened);
    this.surface = this.createSurface(this.paneHost);
    this.surface.getRenderer().setPixelRatio(Math.min(opened.devicePixelRatio || 1, 1.5));
    this.multiViewComposer = new MultiViewComposer(this.surface);
    this.installViewport(this.currentKind);
    this.resizeViewport();
    this.hooks.onPopupWindowReady?.(opened, this.sessionId);
    opened.addEventListener('beforeunload', () => this.onPopupUnload());
    this.startHostWatch(opened);
    this.startRenderLoop(opened);
    return this.viewport !== null;
  }

  /**
   * Returns the live popup window when open.
   *
   * @returns Popup window or null.
   */
  getPopupWindow(): Window | null {
    if (!this.popup || this.popup.closed) return null;
    return this.popup;
  }

  /**
   * Returns whether this session's popup is currently open.
   *
   * @returns True when the popup exists and is not closed.
   */
  isOpen(): boolean {
    return this.popup !== null && !this.popup.closed;
  }

  /**
   * Returns whether a live viewport and surface are allocated.
   *
   * @returns True when renderer resources exist.
   */
  hasRenderer(): boolean {
    return this.surface !== null && this.viewport !== null;
  }

  /**
   * Returns the live viewport when open.
   *
   * @returns Editor viewport or null.
   */
  getViewport(): EditorViewport | null {
    return this.viewport;
  }

  /**
   * Focuses the popup when open.
   *
   * @returns True when a live popup was focused.
   */
  focus(): boolean {
    if (!this.popup || this.popup.closed) return false;
    this.popup.focus();
    return true;
  }

  /** Closes the popup and releases GPU and viewport resources. */
  close(): void {
    if (this.hasClosedPopup) return;
    this.hasClosedPopup = true;
    this.stopHostWatch();
    this.stopRenderLoop();
    this.notifyPopupWindowClosed();
    this.disposeViewportResources();
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.popup = null;
    this.paneHost = null;
    this.hooks.onSessionClosed?.(this.sessionId);
  }

  /** Closes the popup and marks the session disposed. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.close();
  }

  /**
   * Returns true when window.open is available in this environment.
   *
   * @returns Whether a popup can be attempted.
   */
  private canOpenPopup(): boolean {
    return typeof window !== 'undefined' && typeof window.open === 'function';
  }

  /**
   * Opens a uniquely named browser popup so multiple detached views coexist.
   *
   * @returns Opened window, or null when blocked.
   */
  private openPopupWindow(): Window | null {
    const uniqueName = `aiworlded_detached_viewport_${this.sessionId}`;
    return window.open(
      'about:blank',
      uniqueName,
      'popup=yes,width=960,height=720,menubar=no,toolbar=no,location=no,status=no',
    );
  }

  /**
   * Writes a pane-shaped host document matching main-window viewport chrome.
   *
   * @param target Popup window whose document is replaced.
   * @returns Pane host element for surface + viewport.
   */
  private writeDetachedShell(target: Window): HTMLElement {
    const doc = target.document;
    doc.open();
    doc.write(this.buildDetachedDocumentHtml());
    doc.close();
    this.applyPopupDocumentChrome(doc);
    const host = doc.createElement('div');
    host.classList.add('editor-viewport-area', 'editor-detached-viewport-pane');
    host.style.position = 'relative';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.overflow = 'hidden';
    host.style.background = `#${Theme.viewportBackground.toString(16).padStart(6, '0')}`;
    doc.body.appendChild(host);
    return host;
  }

  /**
   * Sets title and favicon on the popup with live DOM APIs (not only HTML
   * text).
   *
   * @param popupDocument Written about:blank document.
   */
  private applyPopupDocumentChrome(popupDocument: Document): void {
    popupDocument.title = 'AI World Editor — Detached Viewport';
    if (typeof document === 'undefined') return;
    applyDetachedWindowFavicon(popupDocument, document);
    void embedDetachedWindowFaviconDataUrl(popupDocument, document).catch(() => undefined);
  }

  /**
   * Builds the HTML document string for the detached popup shell.
   *
   * @returns Complete HTML source for about:blank replacement.
   */
  private buildDetachedDocumentHtml(): string {
    const background = `#${Theme.viewportBackground.toString(16).padStart(6, '0')}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AI World Editor — Detached Viewport</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${background}; }
  </style>
</head>
<body></body>
</html>`;
  }

  /**
   * Creates or replaces the live viewport for the requested kind.
   *
   * @param kind Viewport kind to host in this popup.
   */
  private installViewport(kind: ViewportKind): void {
    if (!this.paneHost || !this.surface || !this.popupInputManager) {
      throw new Error('Detached viewport shell is not ready');
    }
    this.disposeLiveViewportOnly();
    this.clearPaneHostChildrenPreservingSurface();
    this.currentKind = kind;
    const created = createViewportForKind(kind, this.paneHost, {
      inputManager: this.popupInputManager,
      sharedScene: this.renderSource.getScene(),
      surface: this.surface,
    });
    const world = this.renderSource.getWorldObject?.() ?? null;
    if (world) {
      created.setWorldGroup(world);
    }
    this.viewport = created;
    this.wireViewportChrome(created);
    if (kind === ViewportKind.PERSPECTIVE) {
      this.seedCameraFromSource(created);
    }
    this.hooks.onViewportReady?.(created);
  }

  /** Removes previous chrome from the pane host while keeping the shared canvas. */
  private clearPaneHostChildrenPreservingSurface(): void {
    if (!this.paneHost || !this.surface) return;
    const canvas = this.surface.getCanvas();
    Array.from(this.paneHost.children).forEach((child) => {
      if (child !== canvas) {
        this.paneHost!.removeChild(child);
      }
    });
  }

  /** Disposes the live viewport without tearing down the popup surface. */
  private disposeLiveViewportOnly(): void {
    if (!this.viewport) return;
    const previousViewport = this.viewport;
    this.viewport = null;
    this.hooks.onViewportDisposed?.(previousViewport);
    disposeEditorViewport(previousViewport);
  }

  /**
   * Wires the standard viewport toolbar callbacks for shading and type switch.
   *
   * @param viewport Detached editor viewport.
   */
  private wireViewportChrome(viewport: EditorViewport): void {
    const toolbar = viewport.getViewportToolbar();
    toolbar.setViewportKind(this.currentKind);
    toolbar.setTitle(getViewportKindDisplayLabel(this.currentKind));
    toolbar.setOnShadingMode((mode) => {
      viewport.setShadingMode(mode);
      toolbar.setActiveShadingMode(mode);
    });
    toolbar.setOnFit(() => {
      // Fit is wired by the layout host via onViewportReady when available.
    });
    toolbar.setOnToggleMaximize(() => {
      // Maximize is a main-window layout concern.
    });
    toolbar.setOnViewportKindChange((kind) => this.changeViewportKind(kind));
    toolbar.setActiveShadingMode(viewport.getShadingMode());
  }

  /**
   * Switches the detached pane to another viewport kind in place.
   *
   * @param kind Requested kind from the type menu.
   */
  private changeViewportKind(kind: ViewportKind): void {
    if (this.isDisposed || !this.isOpen() || kind === this.currentKind) return;
    this.installViewport(kind);
    this.resizeViewport();
  }

  /**
   * Seeds a perspective camera from the main view once when opening.
   *
   * @param viewport Detached viewport that may be perspective.
   */
  private seedCameraFromSource(viewport: EditorViewport): void {
    const seed = this.renderSource.getSeedCamera?.() ?? null;
    if (!seed) return;
    const camera = viewport.getCamera();
    camera.position.copy(seed.position);
    camera.quaternion.copy(seed.quaternion);
    if (camera instanceof THREE.PerspectiveCamera && seed instanceof THREE.PerspectiveCamera) {
      camera.fov = seed.fov;
      camera.near = seed.near;
      camera.far = seed.far;
      camera.updateProjectionMatrix();
    }
  }

  /** Resizes the surface and viewport camera to the popup content size. */
  private resizeViewport(): void {
    if (!this.popup || !this.surface || !this.viewport || !this.paneHost) return;
    const width = Math.max(1, this.paneHost.clientWidth || this.popup.innerWidth || 1);
    const height = Math.max(1, this.paneHost.clientHeight || this.popup.innerHeight || 1);
    this.surface.resize(width, height);
    const contentRect = this.viewport.getContentElement().getBoundingClientRect();
    const contentWidth = contentRect.width > 0 ? contentRect.width : width;
    const contentHeight =
      contentRect.height > 0 ? contentRect.height : Math.max(1, height - Theme.viewportToolbarHeightPx);
    this.viewport.resize(contentWidth, contentHeight);
  }

  /**
   * Starts the detached animation frame loop on the popup window.
   *
   * @param target Popup window providing requestAnimationFrame.
   */
  private startRenderLoop(target: Window): void {
    this.stopRenderLoop();
    this.lastFrameTime = performance.now();
    const schedule = target.requestAnimationFrame.bind(target);
    const tick = () => {
      this.animationFrameId = null;
      if (!this.isOpen() || this.isDisposed) {
        this.onPopupUnload();
        return;
      }
      this.renderFrame();
      if (this.hasClosedPopup) return;
      this.animationFrameId = schedule(tick);
    };
    this.animationFrameId = schedule(tick);
  }

  /** Cancels the detached animation frame loop. */
  private stopRenderLoop(): void {
    if (this.animationFrameId === null || !this.popup) {
      this.animationFrameId = null;
      return;
    }
    this.popup.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  /**
   * Watches the opener host so the popup closes when the editor reloads (Vite)
   * or the parent tab is closed. Uses the popup's timer so checks continue even
   * when requestAnimationFrame is throttled.
   *
   * @param target Popup window providing setInterval.
   */
  private startHostWatch(target: Window): void {
    this.stopHostWatch();
    const schedule = target.setInterval.bind(target);
    this.hostWatchIntervalId = schedule(() => this.closeIfHostGone(), DETACHED_HOST_WATCH_INTERVAL_MS);
  }

  /** Cancels the host-liveness interval on the popup window. */
  private stopHostWatch(): void {
    if (this.hostWatchIntervalId === null || !this.popup) {
      this.hostWatchIntervalId = null;
      return;
    }
    this.popup.clearInterval(this.hostWatchIntervalId);
    this.hostWatchIntervalId = null;
  }

  /**
   * Closes this session when the opener host is gone.
   *
   * @returns True when the host was gone and close was invoked.
   */
  private closeIfHostGone(): boolean {
    if (!this.popup || this.hasClosedPopup) return false;
    if (!isDetachedHostGone(this.popup)) return false;
    this.close();
    return true;
  }

  /**
   * Advances the viewport simulation and draws through MultiViewComposer — the
   * same prepare/render/finalize path as in-window panes.
   */
  private renderFrame(): void {
    if (!this.popup || !this.viewport || !this.multiViewComposer || !this.surface) {
      return;
    }
    if (this.popup.closed) {
      this.onPopupUnload();
      return;
    }
    if (this.closeIfHostGone()) return;
    const now = performance.now();
    const delta = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.resizeViewport();
    const liveViewport = this.viewport;
    if (isPerspectiveViewport(liveViewport)) {
      liveViewport.update(delta);
    }
    this.multiViewComposer.render(this.renderSource.getScene(), [
      {
        camera: liveViewport.getCamera(),
        contentElement: liveViewport.getContentElement(),
        syncCameraSize: (width, height) => liveViewport.resize(width, height),
        prepare: () => this.prepareDetachedViewportPass(liveViewport),
        finalize: () => this.finalizeDetachedViewportPass(liveViewport),
      },
    ]);
  }

  /**
   * Runs host prepare hooks then the viewport's own render prep (same order as
   * {@link LayoutRenderLoop} multi-view passes).
   *
   * @param viewport Detached pane being drawn.
   */
  private prepareDetachedViewportPass(viewport: EditorViewport): void {
    this.hooks.prepareViewportPass?.(viewport);
    viewport.prepareRender();
  }

  /**
   * Ends the viewport pass then host finalize hooks so shared-scene overlays
   * (CAD rulers) hide after this popup's scissor draw.
   *
   * @param viewport Detached pane that finished drawing.
   */
  private finalizeDetachedViewportPass(viewport: EditorViewport): void {
    viewport.endRenderPass();
    this.hooks.finalizeViewportPass?.(viewport);
  }

  /** Handles popup close by releasing resources without re-closing the window. */
  private onPopupUnload(): void {
    this.close();
  }

  /** Notifies the host that the popup window is about to lose its listeners. */
  private notifyPopupWindowClosed(): void {
    if (!this.popup) return;
    this.hooks.onPopupWindowClosed?.(this.popup, this.sessionId);
  }

  /** Disposes the hosted viewport, surface, and popup input manager. */
  private disposeViewportResources(): void {
    this.disposeLiveViewportOnly();
    this.multiViewComposer = null;
    this.surface?.dispose();
    this.surface = null;
    this.popupInputManager?.dispose();
    this.popupInputManager = null;
  }
}
