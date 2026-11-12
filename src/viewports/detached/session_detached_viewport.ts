import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerInput } from '@/input/manager_input.js';
import { createViewportForKind } from '@/viewports/core/factory_viewport.js';
import { ViewportKind, getViewportKindDisplayLabel } from '@/viewports/core/viewport_kind.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';
import { MultiViewComposer, type MultiViewPanePass } from '@/viewports/core/multi_view_composer.js';
import { disposeEditorViewport } from '@/viewports/core/viewport_dispose.js';
import { applyDetachedWindowFavicon, embedDetachedWindowFaviconDataUrl } from './detached_window_favicon.js';
import { DETACHED_HOST_WATCH_INTERVAL_MS, isDetachedHostGone } from './detached_host_liveness.js';
import type { DetachedViewportRenderSource } from './detached_viewport_render_source.js';
import { DetachedViewportPanes } from './detached_viewport_panes.js';
import { createAreaLeafNode, type AreaTreeNode } from '@/layout/area/area_tree_node.js';
import { createViewportLeafPayload } from '@/layout/area/area_editor_type.js';
import { bindViewportToolbarShadingControls } from '@/ui/viewport_chrome/viewport_toolbar_shading_bind.js';
import { nativeBrowserDefaultsInstall } from '@/ui/input/native_browser_defaults.js';

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
  onViewportReady?: (viewport: ViewportEditor) => void;

  /**
   * Invoked just before a viewport is disposed (kind change or window close).
   *
   * @param viewport Viewport about to be torn down.
   */
  onViewportDisposed?: (viewport: ViewportEditor) => void;

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
  prepareViewportPass?: (viewport: ViewportEditor) => void;

  /**
   * Invoked immediately after drawing a detached pane, matching the main layout
   * multi-view finalize path.
   *
   * @param viewport Detached viewport that just rendered.
   */
  finalizeViewportPass?: (viewport: ViewportEditor) => void;

  /**
   * Invoked when an area is dragged out of the popup so it can open in a window
   * of its own.
   *
   * @param kind Viewport kind of the dragged area.
   * @returns True when the new window opened.
   */
  onDetachArea?: (kind: ViewportKind) => boolean;

  /**
   * Invoked after the split layout of the popup changes.
   *
   * @param root Logical layout tree.
   */
  onLayoutChanged?: (root: AreaTreeNode) => void;
}

/** Construction options for one detached popup session. */
export interface DetachedViewportSessionOptions {
  sessionId: string;
  renderSource: DetachedViewportRenderSource;
  createSurface: DetachedSurfaceFactory;
  hooks?: DetachedViewportSessionHooks;
  initialKind?: ViewportKind;
  initialLayout?: AreaTreeNode;
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
  private panes: DetachedViewportPanes | null;
  private popupInputManager: ManagerInput | null;
  private animationFrameId: number | null;
  private hostWatchIntervalId: number | null;
  private lastFrameTime: number;
  private isDisposed: boolean;
  private hasClosedPopup: boolean;
  private readonly initialLayout: AreaTreeNode;

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
    this.panes = null;
    this.popupInputManager = null;
    this.animationFrameId = null;
    this.hostWatchIntervalId = null;
    this.lastFrameTime = 0;
    this.isDisposed = false;
    this.hasClosedPopup = false;
    this.initialLayout =
      options.initialLayout ??
      createAreaLeafNode(createViewportLeafPayload('pane_detached', options.initialKind ?? ViewportKind.PERSPECTIVE));
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
    this.popupInputManager = new ManagerInput(opened);
    this.surface = this.createSurface(this.paneHost);
    this.surface.getRenderer().setPixelRatio(Math.min(opened.devicePixelRatio || 1, 1.5));
    this.multiViewComposer = new MultiViewComposer(this.surface);
    this.resizeSurface();
    this.panes = this.createPanes(this.paneHost);
    this.panes.start();
    this.hooks.onPopupWindowReady?.(opened, this.sessionId);
    opened.addEventListener('beforeunload', () => this.onPopupUnload());
    this.startHostWatch(opened);
    this.startRenderLoop(opened);
    return this.hasRenderer();
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
    return this.surface !== null && this.getViewports().length > 0;
  }

  /**
   * Returns the first live viewport of the popup when open.
   *
   * @returns Editor viewport or null.
   */
  getViewport(): ViewportEditor | null {
    return this.getViewports()[0] ?? null;
  }

  /**
   * Returns every live viewport of the popup in layout order.
   *
   * @returns Editor viewports, empty when closed.
   */
  getViewports(): ViewportEditor[] {
    return this.panes?.getViewports() ?? [];
  }

  /**
   * Returns the popup document when the window is open.
   *
   * @returns Popup document, or null.
   */
  getOwnerDocument(): Document | null {
    if (!this.popup || this.popup.closed) {
      return null;
    }
    return this.popup.document;
  }

  /**
   * Returns the last pointer client position recorded in this popup.
   *
   * @returns Client coordinates, or null before any pointer sample.
   */
  getLastPointerClientPosition(): { clientX: number; clientY: number } | null {
    return this.popupInputManager?.getLastPointerClientPosition() ?? null;
  }

  /**
   * Returns the popup input manager that tracks keys and pointer state for this
   * window.
   *
   * @returns Live ManagerInput, or null when the popup is closed.
   */
  getInputManager(): ManagerInput | null {
    return this.popupInputManager;
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
    nativeBrowserDefaultsInstall(target);
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
   * Builds the split pane layer and its viewports inside the popup host.
   *
   * @param host Pane host element that also holds the shared canvas.
   * @returns Split pane layout.
   */
  private createPanes(host: HTMLElement): DetachedViewportPanes {
    const layer = host.ownerDocument.createElement('div');
    layer.classList.add('editor-detached-viewport-areas');
    host.appendChild(layer);
    return new DetachedViewportPanes(layer, this.initialLayout, {
      createViewport: (kind, container) => this.createPaneViewport(kind, container),
      onViewportAdded: (viewport) => this.hooks.onViewportReady?.(viewport),
      disposeViewport: (viewport) => this.disposePaneViewport(viewport),
      detachArea: (kind) => this.hooks.onDetachArea?.(kind) ?? false,
      onLayoutChanged: (root) => this.hooks.onLayoutChanged?.(root),
    });
  }

  /**
   * Creates one live viewport inside an area container.
   *
   * @param kind Viewport kind to host.
   * @param container Area host element.
   * @returns New editor viewport.
   */
  private createPaneViewport(kind: ViewportKind, container: HTMLElement): ViewportEditor {
    if (!this.surface || !this.popupInputManager) {
      throw new Error('Detached viewport shell is not ready');
    }
    const created = createViewportForKind(kind, container, {
      inputManager: this.popupInputManager,
      sharedScene: this.renderSource.getScene(),
      surface: this.surface,
    });
    const world = this.renderSource.getWorldObject?.() ?? null;
    if (world) created.setWorldGroup(world);
    this.wireViewportChrome(created, kind);
    if (kind === ViewportKind.PERSPECTIVE) this.seedCameraFromSource(created);
    return created;
  }

  /**
   * Disposes one viewport after telling the host.
   *
   * @param viewport Viewport leaving the popup.
   */
  private disposePaneViewport(viewport: ViewportEditor): void {
    this.hooks.onViewportDisposed?.(viewport);
    disposeEditorViewport(viewport);
  }

  /**
   * Wires the standard viewport toolbar title and shading controls.
   *
   * @param viewport Detached editor viewport.
   * @param kind Viewport kind.
   */
  private wireViewportChrome(viewport: ViewportEditor, kind: ViewportKind): void {
    const toolbar = viewport.getViewportToolbar();
    toolbar.setViewportKind(kind);
    toolbar.setTitle(getViewportKindDisplayLabel(kind));
    bindViewportToolbarShadingControls(viewport);
  }

  /**
   * Seeds a perspective camera from the main view once when opening.
   *
   * @param viewport Detached viewport that may be perspective.
   */
  private seedCameraFromSource(viewport: ViewportEditor): void {
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

  /** Resizes the shared surface to the popup content size. */
  private resizeSurface(): void {
    if (!this.popup || !this.surface || !this.paneHost) return;
    const width = Math.max(1, this.paneHost.clientWidth || this.popup.innerWidth || 1);
    const height = Math.max(1, this.paneHost.clientHeight || this.popup.innerHeight || 1);
    this.surface.resize(width, height);
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
    if (!this.popup || !this.panes || !this.multiViewComposer || !this.surface) return;
    if (this.popup.closed) {
      this.onPopupUnload();
      return;
    }
    if (this.closeIfHostGone()) return;
    const now = performance.now();
    const delta = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.resizeSurface();
    this.panes.syncLayerSize();
    const visible = this.panes.getVisibleViewports();
    visible.forEach((viewport) => {
      if (isPerspectiveViewport(viewport)) viewport.update(delta);
    });
    this.multiViewComposer.render(
      this.renderSource.getScene(),
      visible.map((viewport) => this.buildPanePass(viewport)),
    );
  }

  /**
   * Builds the draw pass of one visible pane.
   *
   * @param viewport Visible detached viewport.
   * @returns Multi-view pane pass.
   */
  private buildPanePass(viewport: ViewportEditor): MultiViewPanePass {
    return {
      camera: viewport.getCamera(),
      contentElement: viewport.getContentElement(),
      syncCameraSize: (width, height) => viewport.resize(width, height),
      prepare: () => this.prepareDetachedViewportPass(viewport),
      finalize: () => this.finalizeDetachedViewportPass(viewport),
    };
  }

  /**
   * Runs host prepare hooks then the viewport's own render prep (same order as
   * {@link LayoutRenderLoop} multi-view passes).
   *
   * @param viewport Detached pane being drawn.
   */
  private prepareDetachedViewportPass(viewport: ViewportEditor): void {
    this.hooks.prepareViewportPass?.(viewport);
    viewport.prepareRender();
  }

  /**
   * Ends the viewport pass then host finalize hooks so shared-scene overlays
   * (CAD rulers) hide after this popup's scissor draw.
   *
   * @param viewport Detached pane that finished drawing.
   */
  private finalizeDetachedViewportPass(viewport: ViewportEditor): void {
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
    this.panes?.dispose();
    this.panes = null;
    this.multiViewComposer = null;
    this.surface?.dispose();
    this.surface = null;
    this.popupInputManager?.dispose();
    this.popupInputManager = null;
  }
}
