import { describe, it, expect } from 'vitest';
import {
  doesElementBelongToPointerDocument,
  findPickSurfaceAtClientPoint,
  findSmallestElementContainingClientPoint,
  isClientPointInsideElementBounds,
} from '@/utils/pointer_client_hit.js';
import { panelFloatingScopeMark } from '@/ui/floating_panel/panel_floating_scope.js';

describe('pointer_client_hit', () => {
  it('finds no viewport under a point a floating window covers, so hover stays off the scene', () => {
    const pane = createElementWithRect(0, 0, 400, 400);
    const window = document.createElement('div');
    panelFloatingScopeMark(window);
    const field = document.createElement('span');
    window.append(field);
    document.body.append(pane, window);
    const original = document.elementFromPoint;
    try {
      document.elementFromPoint = () => field;
      expect(findPickSurfaceAtClientPoint([pane], (surface) => surface, 40, 50)).toBeNull();
      document.elementFromPoint = () => pane;
      expect(findPickSurfaceAtClientPoint([pane], (surface) => surface, 40, 50)).toBe(pane);
    } finally {
      document.elementFromPoint = original;
      pane.remove();
      window.remove();
    }
  });

  it('reports whether a client point is inside element bounds', () => {
    const element = createElementWithRect(10, 20, 100, 50);
    expect(isClientPointInsideElementBounds(10, 20, element)).toBe(true);
    expect(isClientPointInsideElementBounds(110, 70, element)).toBe(true);
    expect(isClientPointInsideElementBounds(9, 20, element)).toBe(false);
    expect(isClientPointInsideElementBounds(10, 71, element)).toBe(false);
  });

  it('filters elements by owner document when a document is provided', () => {
    const main = createElementWithRect(0, 0, 200, 200);
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const detached = detachedDocument.createElement('div');
    Object.defineProperty(detached, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
    });
    expect(doesElementBelongToPointerDocument(main, document)).toBe(true);
    expect(doesElementBelongToPointerDocument(main, detachedDocument)).toBe(false);
    expect(doesElementBelongToPointerDocument(detached, detachedDocument)).toBe(true);
    expect(doesElementBelongToPointerDocument(main, null)).toBe(true);
  });

  it('never cross-matches detached client coordinates onto a main pane at 0,0', () => {
    const main = createElementWithRect(0, 0, 400, 400);
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const detached = detachedDocument.createElement('div');
    Object.defineProperty(detached, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }),
    });
    const hit = findSmallestElementContainingClientPoint(40, 50, [main, detached], detachedDocument);
    expect(hit).toBe(detached);
    expect(findSmallestElementContainingClientPoint(40, 50, [main, detached], document)).toBe(main);
  });

  it('finds the first pick surface whose content contains the point in the owner document', () => {
    const mainSurface = {
      id: 'main',
      getContentElement: () => createElementWithRect(0, 0, 300, 300),
    };
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const detachedElement = detachedDocument.createElement('div');
    Object.defineProperty(detachedElement, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300 }),
    });
    const detachedSurface = {
      id: 'detached',
      getContentElement: () => detachedElement,
    };
    const hit = findPickSurfaceAtClientPoint(
      [mainSurface, detachedSurface],
      (surface) => surface.getContentElement(),
      12,
      18,
      detachedDocument,
    );
    expect(hit).toBe(detachedSurface);
  });

  it('prefers the smallest overlapping element', () => {
    const large = createElementWithRect(0, 0, 400, 400);
    const small = createElementWithRect(100, 100, 50, 50);
    expect(findSmallestElementContainingClientPoint(120, 120, [large, small])).toBe(small);
  });
});

/**
 * Creates a mock element with fixed bounds in the main document.
 *
 * @param left Rect left.
 * @param top Rect top.
 * @param width Rect width.
 * @param height Rect height.
 * @returns Element with a fixed getBoundingClientRect.
 */
function createElementWithRect(left: number, top: number, width: number, height: number): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    }),
  });
  return element;
}
