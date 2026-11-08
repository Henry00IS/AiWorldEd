import { vi } from 'vitest';

/** Viewport stand-in whose press handler prevents the default mouse events. */
export interface MenuPopoverDismissProbeViewport {
  canvas: HTMLCanvasElement;
  remove: () => void;
}

/** Editor shortcut stand-in listening on the window like the real handler. */
export interface MenuPopoverDismissProbeShortcuts {
  keydown: ReturnType<typeof vi.fn<(event: KeyboardEvent) => void>>;
  remove: () => void;
}

/**
 * Creates a canvas that calls preventDefault on pointerdown, like the 3D
 * camera, so browsers skip the compatibility mousedown that follows.
 *
 * @returns Canvas and its cleanup.
 */
export function menuPopoverDismissProbeViewportCreate(): MenuPopoverDismissProbeViewport {
  const canvas = document.createElement('canvas');
  canvas.addEventListener('pointerdown', (event) => event.preventDefault());
  document.body.appendChild(canvas);
  return { canvas, remove: () => canvas.remove() };
}

/**
 * Presses an element the way a browser does: pointerdown first, then a
 * mousedown only when the pointerdown was not default-prevented.
 *
 * @param target Pressed element.
 * @returns True when the compatibility mousedown was dispatched.
 */
export function menuPopoverDismissProbePress(target: Element): boolean {
  const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  target.dispatchEvent(pointerDown);
  if (pointerDown.defaultPrevented) return false;
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  return true;
}

/**
 * Installs a bubbling window keydown spy that stands in for the editor's tool
 * and selection shortcuts, which Escape must never reach while a popover is
 * open.
 *
 * @returns Spy and its cleanup.
 */
export function menuPopoverDismissProbeShortcutsInstall(): MenuPopoverDismissProbeShortcuts {
  const keydown = vi.fn<(event: KeyboardEvent) => void>();
  window.addEventListener('keydown', keydown);
  return { keydown, remove: () => window.removeEventListener('keydown', keydown) };
}

/**
 * Dispatches an Escape keydown at an element.
 *
 * @param target Focused element; defaults to the document body.
 */
export function menuPopoverDismissProbeEscape(target: Element = document.body): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
  );
}
