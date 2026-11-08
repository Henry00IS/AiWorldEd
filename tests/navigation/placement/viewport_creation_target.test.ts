import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AudioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { resolveViewportCreationTarget } from '@/navigation/placement/viewport_creation_target.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Creates input roots and a camera without allocating a renderer.
 *
 * @param perspective Whether the viewport is perspective rather than
 *   orthographic.
 * @param ownerDocument Document hosting the viewport, including separate
 *   pop-outs.
 * @returns Viewport and its content/chrome input roots.
 */
function createViewport(perspective: boolean, ownerDocument = document) {
  const container = ownerDocument.createElement('div');
  const content = ownerDocument.createElement('div');
  container.append(content);
  const camera = perspective ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera();
  const viewport = {
    getCamera: () => camera,
    getContentElement: () => content,
  } as unknown as ViewportEditor;
  Object.setPrototypeOf(viewport, perspective ? Viewport3D.prototype : Viewport2D.prototype);
  return { viewport, content, container };
}

describe('creation viewport from real input', () => {
  const focus = new AudioViewportFocus();
  afterEach(() => focus.clearAll());

  it('defaults to perspective even when Top is the first pane and hovered', () => {
    const top = createViewport(false);
    const perspective = createViewport(true);
    const live = [top.viewport, perspective.viewport];
    focus.registerViewports(live);
    top.content.dispatchEvent(new Event('pointerenter'));
    top.content.dispatchEvent(new Event('pointermove'));
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(perspective.viewport);
  });

  it('keeps a clicked perspective target while the pointer crosses Top to reach Add', () => {
    const top = createViewport(false);
    const perspective = createViewport(true);
    const live = [top.viewport, perspective.viewport];
    focus.registerViewports(live);
    perspective.content.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    top.content.dispatchEvent(new Event('pointerenter'));
    top.content.dispatchEvent(new Event('pointermove'));
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(perspective.viewport);
    top.content.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(top.viewport);
  });

  it('changes target for viewport wheel input and chrome presses, not hover', () => {
    const top = createViewport(false);
    const perspective = createViewport(true);
    focus.registerViewports([top.viewport, perspective.viewport]);
    perspective.container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(focus.getLastViewport()).toBe(perspective.viewport);
    top.content.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    expect(focus.getLastViewport()).toBe(top.viewport);
    perspective.content.dispatchEvent(new Event('pointermove'));
    expect(focus.getLastViewport()).toBe(top.viewport);
  });

  it('uses real input from a detached document and falls back when that viewport closes', () => {
    const main = createViewport(true);
    const detached = createViewport(true, document.implementation.createHTMLDocument('Pop-out'));
    const live = [main.viewport, detached.viewport];
    focus.registerViewports(live);
    detached.content.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(detached.viewport);
    detached.content.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(detached.viewport);
    focus.registerViewports([main.viewport]);
    expect(resolveViewportCreationTarget([main.viewport], focus.getLastViewport())).toBe(main.viewport);
    main.content.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    detached.content.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    detached.content.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(focus.getLastViewport()).toBe(main.viewport);
  });

  it('retains handled keyboard-tool focus through registry refreshes', () => {
    const top = createViewport(false);
    const main = createViewport(true);
    const live = [top.viewport, main.viewport];
    focus.registerViewports(live);
    focus.recordFromContentElement(top.content);
    focus.registerViewports(live);
    expect(resolveViewportCreationTarget(live, focus.getLastViewport())).toBe(top.viewport);
    focus.clearAll();
    main.content.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    expect(focus.getLastViewport()).toBeNull();
  });

  it('uses an available orthographic pane if no perspective exists, or null with no panes', () => {
    const top = createViewport(false);
    expect(resolveViewportCreationTarget([top.viewport], null)).toBe(top.viewport);
    expect(resolveViewportCreationTarget([], top.viewport)).toBeNull();
  });
});
