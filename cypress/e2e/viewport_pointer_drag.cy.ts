import type { E2eCameraSummary } from '../../src/e2e_bridge/test_bridge_types.js';

describe('viewport pointer dragging', () => {
  it('pans the perspective camera through real pointer events', () => {
    let cameraBefore: E2eCameraSummary;
    cy.visit('/?e2e=1');
    cy.waitForEditor();
    cy.editorApi().then((api) => {
      cameraBefore = requireCameraSummary(api.getPerspectiveCameraSummary());
    });

    cy.contains('.editor-viewport-title', 'Perspective').then(($title) => {
      dispatchMiddleButtonDrag(findViewportContent($title[0]!));
    });

    cy.editorApi().then((api) => {
      const cameraAfter = requireCameraSummary(api.getPerspectiveCameraSummary());
      expect(positionDistance(cameraBefore.position, cameraAfter.position)).to.be.greaterThan(0);
    });
  });
});

/**
 * Resolves the perspective pane's real pointer-event target.
 *
 * @param title Perspective viewport title element.
 * @returns Content overlay receiving navigation events.
 */
function findViewportContent(title: HTMLElement): HTMLElement {
  const pane = title.closest('.editor-viewport-toolbar')?.parentElement;
  const content = pane?.querySelector<HTMLElement>('.editor-viewport-content');
  if (!content) throw new Error('Perspective viewport content was not found.');
  return content;
}

/**
 * Dispatches a middle-button pan derived from the live viewport dimensions.
 *
 * @param content Perspective viewport pointer-event target.
 */
function dispatchMiddleButtonDrag(content: HTMLElement): void {
  const bounds = content.getBoundingClientRect();
  const startX = bounds.left + bounds.width / 2;
  const startY = bounds.top + bounds.height / 2;
  const movementX = Math.max(1, bounds.width / 8);
  content.requestPointerLock = () => Promise.resolve();
  content.dispatchEvent(createPointerEvent('pointerdown', startX, startY, 1, 4, 0));
  content.dispatchEvent(createPointerEvent('pointermove', startX + movementX, startY, -1, 4, movementX));
  content.dispatchEvent(createPointerEvent('pointerup', startX + movementX, startY, 1, 0, 0));
}

/**
 * Creates one bubbling pointer event for the navigation drag sequence.
 *
 * @param type Pointer event type.
 * @param clientX Horizontal client coordinate.
 * @param clientY Vertical client coordinate.
 * @param button Changed mouse button.
 * @param buttons Active mouse-button bitmask.
 * @param movementX Horizontal movement delta.
 * @returns Configured pointer event.
 */
function createPointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  button: number,
  buttons: number,
  movementX: number,
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY, button, buttons, movementX });
}

/**
 * Requires a perspective camera summary for a default editor layout.
 *
 * @param summary Nullable bridge camera summary.
 * @returns Available camera summary.
 */
function requireCameraSummary(summary: E2eCameraSummary | null): E2eCameraSummary {
  if (!summary) throw new Error('Perspective camera was not available.');
  return summary;
}

/**
 * Calculates Euclidean distance between serialized camera positions.
 *
 * @param before Position before interaction.
 * @param after Position after interaction.
 * @returns Distance between positions.
 */
function positionDistance(before: number[], after: number[]): number {
  return Math.hypot(...before.map((value, index) => value - after[index]!));
}
