/**
 * Attribute of a region whose text Ctrl+A (Cmd+A) selects as a whole when the
 * selection is inside it, such as the chat messages.
 */
export const NATIVE_SELECT_ALL_SCOPE_ATTRIBUTE = 'data-select-all-scope';

/**
 * Attribute of an element that should keep the browser's own context menu, such
 * as an image in the lightbox. Honored on the element and its descendants.
 */
export const NATIVE_CONTEXT_MENU_ATTRIBUTE = 'data-native-context-menu';

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
 * Keys text fields keep with Ctrl (Cmd): select all, copy, cut, paste, undo,
 * redo.
 */
const NATIVE_TEXT_EDIT_CODES: ReadonlySet<string> = new Set(['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyY', 'KeyZ']);

/** Developer tools with Ctrl+Shift (Cmd+Alt on Apple, which is never caught). */
const NATIVE_DEVTOOLS_CODES: ReadonlySet<string> = new Set(['KeyC', 'KeyI', 'KeyJ']);

/**
 * Function keys the browser acts on alone or with modifiers: help, find,
 * reload, caret browsing.
 */
const NATIVE_BROWSER_FUNCTION_CODES: ReadonlySet<string> = new Set(['F1', 'F3', 'F5', 'F7']);

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
 * field, on an element marked for a native menu, or on text the editor marks as
 * selectable (user-select text or all, like chat messages). Everywhere else the
 * editor's own menus, or none, apply.
 *
 * @param target Right-clicked target.
 * @returns True to let the browser show its menu.
 */
export function nativeContextMenuAllowed(target: EventTarget | null): boolean {
  const element = nativeElementOf(target);
  if (element === null) return false;
  if (nativeTextFieldIs(element)) return true;
  if (element.closest(`[${NATIVE_CONTEXT_MENU_ATTRIBUTE}]`) !== null) return true;
  const view = element.ownerDocument.defaultView;
  if (view === null) return false;
  const select = view.getComputedStyle(element).userSelect;
  return select === 'text' || select === 'all';
}

/**
 * Tells whether a key press is a browser shortcut the editor keeps from the
 * browser: Ctrl (Cmd on Apple) with a letter or 1-9, such as save, reload,
 * print, find, open, history or bookmark, and F1, F3, F5 and F7. Text editing
 * (A, C, V, X, Y, Z), developer tools, zoom, F11, F12 and AltGr characters
 * pass.
 *
 * @param event Key press.
 * @param apple True on Apple systems, where Cmd is the shortcut modifier.
 * @returns True to prevent the browser default.
 */
export function nativeBrowserShortcutIs(event: KeyboardEvent, apple: boolean): boolean {
  if (NATIVE_BROWSER_FUNCTION_CODES.has(event.code)) return true;
  if (!(apple ? event.metaKey : event.ctrlKey) || event.altKey) return false;
  if (!/^(Key[A-Z]|Digit[1-9])$/.test(event.code) || NATIVE_TEXT_EDIT_CODES.has(event.code)) return false;
  return !(event.shiftKey && NATIVE_DEVTOOLS_CODES.has(event.code));
}

/**
 * Stops the browser's context menu and page-wide select-all outside text fields
 * and selectable text, and the browser's own shortcuts everywhere (see
 * nativeBrowserShortcutIs). Only the browser default is prevented, after the
 * editor's own handlers, which read a prevented default as handled, so editor
 * menus and shortcuts keep working; in text fields, which the editor's
 * shortcuts skip, it is prevented at once, before a field can stop the event.
 * Ctrl+A inside a select-all scope selects just that scope. The browser keeps
 * Ctrl+W, T, N, Shift+T and Tab regardless.
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
  const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const shortcutLast = (event: KeyboardEvent): void => {
    if (nativeBrowserShortcutIs(event, apple)) event.preventDefault();
  };
  const shortcutFirst = (event: KeyboardEvent): void => {
    if (!nativeBrowserShortcutIs(event, apple)) return;
    if (nativeTextFieldIs(nativeElementOf(event.target))) {
      event.preventDefault();
      return;
    }
    // Listeners added while the window's capture listeners run do run when the
    // event bubbles back to it, and after every other window listener.
    view.removeEventListener('keydown', shortcutLast);
    view.addEventListener('keydown', shortcutLast);
  };
  view.addEventListener('contextmenu', contextMenu);
  view.addEventListener('keydown', keyDown);
  view.addEventListener('keydown', shortcutFirst, true);
  return () => {
    view.removeEventListener('contextmenu', contextMenu);
    view.removeEventListener('keydown', keyDown);
    view.removeEventListener('keydown', shortcutFirst, true);
    view.removeEventListener('keydown', shortcutLast);
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
