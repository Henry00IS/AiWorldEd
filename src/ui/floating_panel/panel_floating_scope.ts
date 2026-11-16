/**
 * Keyboard scope of floating windows: while focus sits in a window, or in a
 * popup it hangs on the page, its keys stay there and never reach the scene
 * shortcuts or the scene clipboard. Clicking outside every window and menu,
 * such as on a viewport, gives the keys back to the scene.
 */

/** Attribute naming a window scope; its value says which scene keys pass. */
const PANEL_FLOATING_SCOPE_ATTRIBUTE = 'data-panel-floating-scope';

/** Elements outside any window that keep the focus where it is when clicked. */
const PANEL_FLOATING_SCOPE_KEEPS_FOCUS = `[${PANEL_FLOATING_SCOPE_ATTRIBUTE}], [role="menu"]`;

/** Which scene shortcuts still reach the scene from inside a window. */
export type PanelFloatingScopePass = 'none' | 'undo';

/** Documents that release window focus on outside clicks already. */
const panelFloatingScopeDocuments = new WeakSet<Document>();

/**
 * Marks an element as a window scope, or as part of one when a window hangs a
 * popup on the page outside its own frame.
 *
 * @param element Window root or popup.
 * @param pass Scene shortcuts that still reach the scene from inside.
 */
export function panelFloatingScopeMark(element: HTMLElement, pass: PanelFloatingScopePass = 'none'): void {
  element.setAttribute(PANEL_FLOATING_SCOPE_ATTRIBUTE, pass);
  panelFloatingScopeReleaseListen(element.ownerDocument);
}

/**
 * Returns which scene shortcuts pass from the window scope an event starts in,
 * or null when it starts outside every window.
 *
 * @param target Event target.
 * @returns Pass of the scope, or null outside any.
 */
export function panelFloatingScopeOf(target: EventTarget | null): PanelFloatingScopePass | null {
  const element = target instanceof Element ? target : target instanceof Document ? target.activeElement : null;
  const scope = element?.closest(`[${PANEL_FLOATING_SCOPE_ATTRIBUTE}]`);
  if (!scope) return null;
  return scope.getAttribute(PANEL_FLOATING_SCOPE_ATTRIBUTE) === 'undo' ? 'undo' : 'none';
}

/**
 * Gives the keys back to the scene when a click lands outside every window and
 * menu while a window holds the focus.
 *
 * @param document Document to listen on.
 */
function panelFloatingScopeReleaseListen(document: Document): void {
  if (panelFloatingScopeDocuments.has(document)) return;
  panelFloatingScopeDocuments.add(document);
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(PANEL_FLOATING_SCOPE_KEEPS_FOCUS)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && panelFloatingScopeOf(focused) !== null) focused.blur();
    },
    true,
  );
}

/**
 * Moves the focus to a window when a click inside it lands on a part that takes
 * no focus of its own, so its keys stay in the window.
 *
 * @param root Window root.
 * @param event Pointer down inside the window.
 */
export function panelFloatingScopeFocus(root: HTMLElement, event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, button, a[href], [contenteditable], [tabindex]:not([tabindex="-1"])'))
    return;
  root.focus({ preventScroll: true });
}

/**
 * Returns whether a floating window covers a client point, so the viewport
 * underneath must not react to the pointer there, such as with hover.
 *
 * @param document Document the point belongs to.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @returns True when the topmost element at the point is in a window.
 */
export function panelFloatingScopeCoversPoint(document: Document, clientX: number, clientY: number): boolean {
  if (typeof document.elementFromPoint !== 'function') return false;
  return panelFloatingScopeOf(document.elementFromPoint(clientX, clientY)) !== null;
}
