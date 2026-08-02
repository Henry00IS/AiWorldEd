import * as THREE from 'three';
import { ManagerInput } from '@/input/manager_input.js';
import { Viewport2D } from './viewport_2d.js';
import { Viewport3D } from './viewport_3d.js';
import {
  ViewportKind,
  getViewportKindDisplayLabel,
  getViewportKindMetadata,
  isPerspectiveViewportKind,
} from './viewport_kind.js';
import type { ViewportEditor } from './viewport_editor.js';
import type { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/** Dependencies required to construct any viewport kind. */
export interface ViewportFactoryDependencies {
  inputManager: ManagerInput;
  sharedScene: THREE.Scene;
  surface: SharedWebGLSurface;
  presentationContext?: ViewportPresentationContext;
  getCameraWidgetSizePx?: () => number;
}

/**
 * Creates a live viewport instance for the given kind inside a pane container.
 *
 * @param kind Viewport kind to instantiate.
 * @param container DOM element that hosts chrome for this pane.
 * @param dependencies Shared construction dependencies.
 * @returns Configured 2D or 3D viewport with kind assigned.
 */
export function createViewportForKind(
  kind: ViewportKind,
  container: HTMLElement,
  dependencies: ViewportFactoryDependencies,
): ViewportEditor {
  const contentElement = ensureContentElement(container);
  if (isPerspectiveViewportKind(kind)) {
    const cameraWidgetSizePx = dependencies.getCameraWidgetSizePx?.();
    const viewport = new Viewport3D({
      container,
      contentElement,
      name: getViewportKindDisplayLabel(kind),
      sharedScene: dependencies.sharedScene,
      surface: dependencies.surface,
      inputManager: dependencies.inputManager,
      ...(dependencies.presentationContext ? { presentationContext: dependencies.presentationContext } : {}),
      ...(cameraWidgetSizePx === undefined ? {} : { cameraWidgetSizePx }),
    });
    viewport.setViewportKind(kind);
    return viewport;
  }
  return createOrthographicViewport(kind, container, contentElement, dependencies);
}

/**
 * Builds an orthographic viewport for top, front, or side.
 *
 * @param kind Orthographic viewport kind.
 * @param container Host DOM container.
 * @param contentElement Content hit target.
 * @param dependencies Shared factory dependencies.
 * @returns Configured Viewport2D.
 */
function createOrthographicViewport(
  kind: ViewportKind,
  container: HTMLElement,
  contentElement: HTMLElement,
  dependencies: ViewportFactoryDependencies,
): Viewport2D {
  const metadata = getViewportKindMetadata(kind);
  const label = getViewportKindDisplayLabel(kind);
  const presentationContext = dependencies.presentationContext ?? new ViewportPresentationContext();
  const cameraPosition = resolveDefaultOrthoCameraPosition(kind, presentationContext);
  const viewport = new Viewport2D({
    container,
    contentElement,
    name: label,
    sharedScene: dependencies.sharedScene,
    surface: dependencies.surface,
    plane: metadata.gridPlane,
    cameraPosition,
    presentationContext,
  });
  viewport.setViewportKind(kind);
  return viewport;
}

/**
 * Ensures a pane has a content element below the toolbar for picking/scissor.
 *
 * @param container Pane container.
 * @returns Content element.
 */
function ensureContentElement(container: HTMLElement): HTMLElement {
  const existing = container.querySelector('.editor-viewport-content') as HTMLElement | null;
  if (existing) return existing;
  const ownerDocument = container.ownerDocument;
  const content = ownerDocument.createElement('div');
  content.classList.add('editor-viewport-content');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.position = 'relative';
  container.appendChild(content);
  return content;
}

/**
 * Resolves the default orthographic camera position for a kind.
 *
 * @param kind Orthographic kind.
 * @returns Default world-space camera position.
 */
function resolveDefaultOrthoCameraPosition(
  kind: ViewportKind,
  presentationContext: ViewportPresentationContext,
): THREE.Vector3 {
  if (kind === ViewportKind.TOP) return presentationContext.getOrthographicCameraPosition('top', 50);
  if (kind === ViewportKind.FRONT) return presentationContext.getOrthographicCameraPosition('front', 50);
  return presentationContext.getOrthographicCameraPosition('side', 50);
}
