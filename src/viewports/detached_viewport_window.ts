import type { EditorViewport } from './editor_viewport.js';
import { SharedWebGLSurface } from './shared_webgl_surface.js';
import {
  DetachedViewportSession,
  type DetachedSurfaceFactory,
  type DetachedViewportSessionHooks,
} from './detached_viewport_session.js';
import type { DetachedViewportRenderSource } from './detached_viewport_render_source.js';

export type { DetachedViewportRenderSource } from './detached_viewport_render_source.js';

/**
 * Optional construction hooks. Tests inject a surface factory because jsdom
 * cannot create a real WebGL context.
 */
export interface DetachedViewportWindowOptions {
  /**
   * Builds the popup workspace surface. Defaults to a real SharedWebGLSurface.
   *
   * @param workspaceElement Pane host element in the popup document.
   * @returns Surface used for multi-view scissor rendering.
   */
  createSurface?: DetachedSurfaceFactory;

  /** Lifecycle hooks applied to every opened detached session. */
  hooks?: DetachedViewportSessionHooks;
}

/**
 * Opens one or more detached viewport windows for multi-monitor use. Each open
 * allocates an independent popup and GPU surface; closing a popup disposes its
 * resources so closed windows cost no render budget.
 */
export class DetachedViewportWindow {
  private readonly sessions: Map<string, DetachedViewportSession>;
  private readonly createSurface: DetachedSurfaceFactory;
  private readonly hooks: DetachedViewportSessionHooks;
  private readonly onHostPageHide: () => void;
  private renderSource: DetachedViewportRenderSource | null;
  private isDisposed: boolean;
  private nextSessionSerial: number;

  /**
   * Creates an idle multi-window controller (no windows or GPU yet).
   *
   * @param options Optional surface factory and lifecycle hooks for tests/host.
   */
  constructor(options: DetachedViewportWindowOptions = {}) {
    this.sessions = new Map();
    this.createSurface =
      options.createSurface ??
      ((element: HTMLElement) => new SharedWebGLSurface(element, { ownerName: 'detached_viewport' }));
    this.hooks = options.hooks ?? {};
    this.renderSource = null;
    this.isDisposed = false;
    this.nextSessionSerial = 1;
    this.onHostPageHide = () => this.close();
    this.bindHostUnloadListeners();
  }

  /**
   * Binds the shared scene used while any popup is open.
   *
   * @param source Scene (and optional seed camera / world) accessors, or null.
   */
  setRenderSource(source: DetachedViewportRenderSource | null): void {
    this.renderSource = source;
  }

  /**
   * Opens a new detached viewport window. Each call creates another popup when
   * allowed; existing popups stay open and keep rendering independently.
   *
   * @returns True when a new window opened successfully.
   */
  open(): boolean {
    if (this.isDisposed) return false;
    if (!this.renderSource) return false;
    const sessionId = this.allocateSessionId();
    const session = new DetachedViewportSession({
      sessionId,
      renderSource: this.renderSource,
      createSurface: this.createSurface,
      hooks: this.buildSessionHooks(),
    });
    this.sessions.set(sessionId, session);
    const opened = session.open();
    if (!opened) {
      this.sessions.delete(sessionId);
      session.dispose();
      return false;
    }
    return true;
  }

  /**
   * Returns whether at least one detached window is currently open.
   *
   * @returns True when any popup exists and is not closed.
   */
  isOpen(): boolean {
    this.pruneClosedSessions();
    return this.sessions.size > 0;
  }

  /**
   * Returns whether any live viewport instance is allocated for a popup.
   *
   * @returns True when at least one detached viewport exists.
   */
  hasRenderer(): boolean {
    this.pruneClosedSessions();
    for (const session of this.sessions.values()) {
      if (session.hasRenderer()) return true;
    }
    return false;
  }

  /**
   * Returns the most recently opened live viewport when any popup is open.
   * Prefer {@link getViewports} when multiple windows may be open.
   *
   * @returns Latest editor viewport or null.
   */
  getViewport(): EditorViewport | null {
    const viewports = this.getViewports();
    return viewports[viewports.length - 1] ?? null;
  }

  /**
   * Returns every live detached viewport currently open.
   *
   * @returns Detached editor viewports in open order.
   */
  getViewports(): EditorViewport[] {
    this.pruneClosedSessions();
    const viewports: EditorViewport[] = [];
    for (const session of this.sessions.values()) {
      const viewport = session.getViewport();
      if (viewport) viewports.push(viewport);
    }
    return viewports;
  }

  /**
   * Returns the number of open detached sessions.
   *
   * @returns Open popup count.
   */
  getOpenCount(): number {
    this.pruneClosedSessions();
    return this.sessions.size;
  }

  /** Closes every detached window and releases GPU resources. */
  close(): void {
    const openSessions = Array.from(this.sessions.values());
    this.sessions.clear();
    openSessions.forEach((session) => session.close());
  }

  /** Closes all popups and marks the controller disposed. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.unbindHostUnloadListeners();
    this.close();
    this.renderSource = null;
  }

  /**
   * Closes every detached popup when the editor page unloads or reloads (Vite
   * full reload, tab close, navigation).
   */
  private bindHostUnloadListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('pagehide', this.onHostPageHide);
    window.addEventListener('beforeunload', this.onHostPageHide);
  }

  /** Removes host unload listeners registered by this controller. */
  private unbindHostUnloadListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pagehide', this.onHostPageHide);
    window.removeEventListener('beforeunload', this.onHostPageHide);
  }

  /**
   * Builds per-session hooks that forward host callbacks and drop closed maps.
   *
   * @returns Hooks object for new sessions.
   */
  private buildSessionHooks(): DetachedViewportSessionHooks {
    return {
      onViewportReady: (viewport) => this.hooks.onViewportReady?.(viewport),
      onViewportDisposed: (viewport) => this.hooks.onViewportDisposed?.(viewport),
      onPopupWindowReady: (popup, sessionId) => this.hooks.onPopupWindowReady?.(popup, sessionId),
      onPopupWindowClosed: (popup, sessionId) => this.hooks.onPopupWindowClosed?.(popup, sessionId),
      prepareViewportPass: (viewport) => this.hooks.prepareViewportPass?.(viewport),
      finalizeViewportPass: (viewport) => this.hooks.finalizeViewportPass?.(viewport),
      onSessionClosed: (sessionId) => {
        this.sessions.delete(sessionId);
        this.hooks.onSessionClosed?.(sessionId);
      },
    };
  }

  /**
   * Allocates a unique session id for window.open target names.
   *
   * @returns New session id string.
   */
  private allocateSessionId(): string {
    const serial = this.nextSessionSerial;
    this.nextSessionSerial += 1;
    return `${Date.now()}_${serial}`;
  }

  /** Drops map entries whose popups closed without firing unload hooks. */
  private pruneClosedSessions(): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.isOpen()) {
        this.sessions.delete(sessionId);
        session.dispose();
      }
    }
  }
}
