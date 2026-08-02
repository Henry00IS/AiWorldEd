import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ViewportToolbar } from '@/ui/viewport_chrome/viewport_toolbar.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { ViewportKind } from './viewport_kind.js';
import type { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/** Construction options for a pane that shares one scene and WebGL surface. */
export interface ViewportBaseOptions {
  container: HTMLElement;
  contentElement: HTMLElement;
  name: string;
  sharedScene: THREE.Scene;
  surface: SharedWebGLSurface;
  presentationContext?: ViewportPresentationContext;
  initialShadingMode?: ShadingMode;
}

/**
 * Places the pane drawable/hit target strictly below the title bar so
 * multi-view scissor and camera aspect never include chrome pixels.
 *
 * @param contentElement Pane content element receiving layout styles.
 */
export function applyViewportContentDrawableStyles(contentElement: HTMLElement): void {
  contentElement.style.position = 'absolute';
  contentElement.style.left = '0';
  contentElement.style.right = '0';
  contentElement.style.top = `${Theme.viewportToolbarHeightPx}px`;
  contentElement.style.bottom = '0';
  contentElement.style.background = 'transparent';
}

/**
 * Returns whether a pane host is geometry-managed by the area tiling layout.
 *
 * @param container Pane host element.
 * @returns True when the host carries a stable area id.
 */
export function isLayoutManagedAreaContainer(container: HTMLElement): boolean {
  const areaId = container.dataset['areaId'];
  return typeof areaId === 'string' && areaId.length > 0;
}

/**
 * Applies chrome styles to a pane host without clobbering area-tiling geometry.
 * Layout-managed containers keep their absolute left/top/width/height; other
 * hosts (detached popups) fill their parent with relative 100%.
 *
 * @param container Pane host element.
 */
export function applyViewportContainerChromeStyles(container: HTMLElement): void {
  container.style.overflow = 'hidden';
  container.style.zIndex = '1';
  container.style.background = 'transparent';
  container.style.minWidth = '0';
  container.style.minHeight = '0';
  if (isLayoutManagedAreaContainer(container)) {
    return;
  }
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.height = '100%';
}

/**
 * Pane viewport without a private WebGL context. Cameras and helpers live in a
 * shared scene; drawing is performed by MultiViewComposer through the surface.
 */
export abstract class BaseViewport {
  protected container: HTMLElement;
  protected contentElement: HTMLElement;
  protected scene: THREE.Scene;
  protected surface: SharedWebGLSurface;
  protected name: string;
  protected presentationContext: ViewportPresentationContext;
  private viewportToolbar: ViewportToolbar;
  private viewportKind: ViewportKind;
  private isDisposed: boolean;

  /**
   * Creates a viewport pane with chrome and a content hit target.
   *
   * @param options Shared scene/surface wiring and DOM hosts.
   */
  constructor(options: ViewportBaseOptions) {
    this.container = options.container;
    this.contentElement = options.contentElement;
    this.scene = options.sharedScene;
    this.surface = options.surface;
    this.name = options.name;
    this.presentationContext = options.presentationContext ?? new ViewportPresentationContext();
    this.viewportKind = ViewportKind.PERSPECTIVE;
    this.isDisposed = false;
    this.setupContainer();
    this.viewportToolbar = new ViewportToolbar(
      this.container,
      options.name,
      options.initialShadingMode ?? ShadingMode.SOLID,
    );
  }

  /**
   * Configures chrome host and drawable content. Content sits strictly below
   * the pane title bar so scissor/camera never spend pixels under the toolbar.
   */
  protected setupContainer(): void {
    this.applyContainerChromeStyles();
    this.applyContentDrawableStyles();
    if (!this.contentElement.parentElement) {
      this.container.appendChild(this.contentElement);
    }
  }

  /**
   * Styles the pane host that owns the title bar and content stack. Area-tiled
   * panes already have absolute left/top/width/height from the layout
   * controller; overwriting those with relative 100% breaks split geometry.
   * Detached / non-tiled hosts still fill their parent with relative 100%.
   */
  private applyContainerChromeStyles(): void {
    applyViewportContainerChromeStyles(this.container);
  }

  /** Places the hit/scissor target in the visible region under the title bar. */
  private applyContentDrawableStyles(): void {
    applyViewportContentDrawableStyles(this.contentElement);
  }

  abstract resize(width: number, height: number): void;
  abstract getCamera(): THREE.Camera;

  /** Applies the shared profile-aware viewport presentation context. */
  setPresentationContext(context: ViewportPresentationContext): void {
    this.presentationContext = context;
  }

  /**
   * Prepares this pane for a multi-view pass (grids, depth, overlays). Drawing
   * is performed by the shared multi-view composer.
   */
  abstract prepareRender(): void;

  /** Legacy no-op render entry; the shared composer draws this pane. */
  render(): void {
    this.prepareRender();
  }

  /**
   * Assigns the semantic viewport kind for this instance.
   *
   * @param kind Kind metadata key (top, front, side, perspective).
   */
  setViewportKind(kind: ViewportKind): void {
    this.viewportKind = kind;
  }

  /**
   * Returns the semantic viewport kind for this instance.
   *
   * @returns Current ViewportKind value.
   */
  getViewportKind(): ViewportKind {
    return this.viewportKind;
  }

  /**
   * Returns the host DOM container for chrome and layout.
   *
   * @returns Container element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the content hit target used for picking and scissor measurement.
   *
   * @returns Content element.
   */
  getContentElement(): HTMLElement {
    return this.contentElement;
  }

  /**
   * Returns the shared Three.js scene.
   *
   * @returns The scene instance.
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Returns the shared WebGL renderer from the workspace surface.
   *
   * @returns The renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.surface.getRenderer();
  }

  /**
   * Returns the shared workspace surface.
   *
   * @returns SharedWebGLSurface instance.
   */
  getSurface(): SharedWebGLSurface {
    return this.surface;
  }

  /**
   * Returns the display name of this viewport.
   *
   * @returns The viewport name string.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Updates the display name and toolbar title text.
   *
   * @param name New display name.
   */
  setName(name: string): void {
    this.name = name;
    this.viewportToolbar.setTitle(name);
  }

  /**
   * Returns the overlay toolbar for this viewport.
   *
   * @returns The ViewportToolbar instance.
   */
  getViewportToolbar(): ViewportToolbar {
    return this.viewportToolbar;
  }

  /**
   * Returns the toolbar root element.
   *
   * @returns The toolbar container element.
   */
  getLabelElement(): HTMLElement {
    return this.viewportToolbar.getElement();
  }

  /**
   * Returns whether this viewport has already been disposed.
   *
   * @returns True after dispose completes.
   */
  getIsDisposed(): boolean {
    return this.isDisposed;
  }

  /** Releases pane-owned resources. Subclasses dispose helpers first. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.viewportToolbar.dispose();
  }
}
