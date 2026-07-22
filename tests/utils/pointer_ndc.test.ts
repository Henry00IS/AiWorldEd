import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pointerEventToNdc } from '../../src/utils/pointer_ndc.js';

describe('pointerEventToNdc', () => {
  it('should map canvas center to origin NDC', () => {
    const element = createElementWithRect(0, 0, 800, 600);
    const event = createMouseEvent(400, 300);
    const ndc = pointerEventToNdc(event, element);
    expect(ndc.x).toBeCloseTo(0, 5);
    expect(ndc.y).toBeCloseTo(0, 5);
  });

  it('should map top-left corner to negative X and positive Y', () => {
    const element = createElementWithRect(0, 0, 800, 600);
    const event = createMouseEvent(0, 0);
    const ndc = pointerEventToNdc(event, element);
    expect(ndc.x).toBeCloseTo(-1, 5);
    expect(ndc.y).toBeCloseTo(1, 5);
  });

  it('should account for canvas offset within the page', () => {
    const element = createElementWithRect(100, 50, 800, 600);
    const event = createMouseEvent(500, 350);
    const ndc = pointerEventToNdc(event, element);
    expect(ndc.x).toBeCloseTo(0, 5);
    expect(ndc.y).toBeCloseTo(0, 5);
  });

  it('should write into a provided target vector', () => {
    const element = createElementWithRect(0, 0, 100, 100);
    const event = createMouseEvent(50, 50);
    const target = new THREE.Vector2(9, 9);
    const result = pointerEventToNdc(event, element, target);
    expect(result).toBe(target);
    expect(target.x).toBeCloseTo(0, 5);
    expect(target.y).toBeCloseTo(0, 5);
  });

  it('should avoid division by zero for zero-sized rects', () => {
    const element = createElementWithRect(0, 0, 0, 0);
    const event = createMouseEvent(0, 0);
    const ndc = pointerEventToNdc(event, element);
    expect(Number.isFinite(ndc.x)).toBe(true);
    expect(Number.isFinite(ndc.y)).toBe(true);
  });
});

/**
 * Creates a mock HTMLElement with a fixed getBoundingClientRect result.
 * @param left Rect left edge.
 * @param top Rect top edge.
 * @param width Rect width.
 * @param height Rect height.
 * @returns A mock element usable with pointerEventToNdc.
 */
function createElementWithRect(
  left: number,
  top: number,
  width: number,
  height: number
): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left, top, width, height, right: left + width, bottom: top + height })
  });
  return element;
}

/**
 * Creates a mouse event at client coordinates.
 * @param clientX Horizontal client position.
 * @param clientY Vertical client position.
 * @returns A MouseEvent for testing.
 */
function createMouseEvent(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('pointerdown', { clientX, clientY });
}
