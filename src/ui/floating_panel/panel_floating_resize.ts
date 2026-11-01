import { clampFloatingPanelRectToScreen } from './panel_floating_screen_bounds.js';

/** Smallest size and placement hooks of a resizable panel. */
export interface FloatingPanelResizeOptions {
  minWidth: number;
  minHeight: number;
  /** Moves the panel to a top/left position. */
  place: (left: number, top: number) => void;
  /** Runs when the resize ends. */
  done: () => void;
}

/**
 * Creates the southeast resize grip used by floating tool panels.
 *
 * @param root Panel root that is resized.
 * @param options Size limits and placement hooks.
 * @returns Grip element to append to the panel.
 */
export function createFloatingPanelResizeGrip(root: HTMLElement, options: FloatingPanelResizeOptions): HTMLElement {
  const handle = root.ownerDocument.createElement('div');
  handle.setAttribute('aria-label', 'Resize panel');
  handle.title = 'Resize';
  Object.assign(handle.style, {
    position: 'absolute',
    right: '0',
    bottom: '0',
    width: '14px',
    height: '14px',
    cursor: 'nwse-resize',
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, transparent 50%, rgba(232,106,23,0.55) 50%)',
    borderBottomRightRadius: '5px',
  });
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    floatingPanelResizeBegin(root, event, options);
  });
  return handle;
}

/**
 * Follows the pointer until release and resizes the panel.
 *
 * @param root Panel root.
 * @param event Pointer down event.
 * @param options Size limits and placement hooks.
 */
function floatingPanelResizeBegin(root: HTMLElement, event: PointerEvent, options: FloatingPanelResizeOptions): void {
  const start = root.getBoundingClientRect();
  options.place(start.left, start.top);
  const view = root.ownerDocument.defaultView ?? window;
  const onMove = (move: PointerEvent) =>
    floatingPanelResizeMove(root, start, move.clientX - event.clientX, move.clientY - event.clientY, options);
  const onUp = () => {
    view.removeEventListener('pointermove', onMove);
    view.removeEventListener('pointerup', onUp);
    options.done();
  };
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
}

/**
 * Applies one resize step and keeps the panel on screen.
 *
 * @param root Panel root.
 * @param start Panel rect when the resize began.
 * @param deltaX Horizontal pointer travel.
 * @param deltaY Vertical pointer travel.
 * @param options Size limits and placement hooks.
 */
function floatingPanelResizeMove(
  root: HTMLElement,
  start: DOMRect,
  deltaX: number,
  deltaY: number,
  options: FloatingPanelResizeOptions,
): void {
  const view = root.ownerDocument.defaultView ?? window;
  const width = Math.max(options.minWidth, start.width + deltaX);
  const height = Math.max(options.minHeight, start.height + deltaY);
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  const rect = root.getBoundingClientRect();
  const clamped = clampFloatingPanelRectToScreen(
    { left: rect.left, top: rect.top, width, height },
    view.innerWidth,
    view.innerHeight,
  );
  options.place(clamped.left, clamped.top);
}
