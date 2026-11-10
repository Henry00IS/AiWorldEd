/**
 * Attribute of a region whose text Ctrl+A (Cmd+A) selects as a whole when the
 * selection is inside it, such as the chat messages.
 */
export const NATIVE_SELECT_ALL_SCOPE_ATTRIBUTE = 'data-select-all-scope';

/** Input types that hold text the user types, reads or copies. */
const NATIVE_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

/**
 * Tells whether an element is a text field: a text-like input, a textarea or
 * editable content.
 *
 * @param element Element, or null.
 * @returns True for text fields.
 */
export function nativeTextFieldIs(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return NATIVE_TEXT_INPUT_TYPES.has((element as HTMLInputElement).type);
  return (element as HTMLElement).isContentEditable === true;
}

/**
 * Tells whether the browser's own context menu helps at a target: in a text
 * field, or on text the editor marks as selectable (user-select text or all,
 * like chat messages). Everywhere else the editor's own menus, or none, apply.
 *
 * @param target Right-clicked target.
 * @returns True to let the browser show its menu.
 */
export function nativeContextMenuAllowed(target: EventTarget | null): boolean {
  const element = nativeElementOf(target);
  if (element === null) return false;
  if (nativeTextFieldIs(element)) return true;
  const view = element.ownerDocument.defaultView;
  if (view === null) return false;
  const select = view.getComputedStyle(element).userSelect;
  return select === 'text' || select === 'all';
}

/**
 * Stops the browser's context menu and page-wide select-all outside text fields
 * and selectable text. Runs after the editor's own handlers (window, bubbling)
 * and only prevents the browser default, so editor menus and the editor's own
 * Ctrl+A keep working. Ctrl+A inside a select-all scope selects just that
 * scope.
 *
 * @param view Editor window.
 * @returns Uninstall.
 */
export function nativeBrowserDefaultsInstall(view: Window): () => void {
  const contextMenu = (event: MouseEvent): void => {
    if (!nativeContextMenuAllowed(event.target)) event.preventDefault();
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (!nativeSelectAllIs(event) || event.defaultPrevented) return;
    const document = view.document;
    if (nativeTextFieldIs(document.activeElement)) return;
    event.preventDefault();
    const selection = view.getSelection();
    const anchor = nativeElementOf(selection?.anchorNode ?? null);
    const scope = anchor?.closest(`[${NATIVE_SELECT_ALL_SCOPE_ATTRIBUTE}]`) ?? null;
    if (selection === null || scope === null) return;
    const range = document.createRange();
    range.selectNodeContents(scope);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  view.addEventListener('contextmenu', contextMenu);
  view.addEventListener('keydown', keyDown);
  return () => {
    view.removeEventListener('contextmenu', contextMenu);
    view.removeEventListener('keydown', keyDown);
  };
}

/**
 * Tells whether a key press is the browser's select-all (Ctrl+A or Cmd+A).
 *
 * @param event Key press.
 * @returns True for select-all.
 */
function nativeSelectAllIs(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a';
}

/**
 * Returns the element of an event target or a text node.
 *
 * @param target Target or node.
 * @returns Element, or null.
 */
function nativeElementOf(target: EventTarget | Node | null): Element | null {
  if (target === null || typeof (target as Node).nodeType !== 'number') return null;
  const node = target as Node;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}
