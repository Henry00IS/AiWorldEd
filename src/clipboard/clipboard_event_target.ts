import { panelFloatingScopeOf } from '@/ui/floating_panel/panel_floating_scope.js';

/**
 * Returns whether a native copy or paste belongs to the editor rather than to
 * text: not inside a text field, an editable element, an open dialog or a
 * floating window, and with no page text selected.
 *
 * @param event Copy or paste event.
 * @returns True when the editor should handle it.
 */
export function clipboardEventForEditor(event: ClipboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"]'))
    return false;
  if (panelFloatingScopeOf(target) !== null) return false;
  const selection = target?.ownerDocument.getSelection() ?? null;
  return !selection || selection.isCollapsed || selection.toString() === '';
}

/**
 * Sends native copy and paste events of a document to the editor.
 *
 * @param target Document to listen on.
 * @param actions Copy and paste handlers; each returns whether it handled the
 *   event.
 * @returns Removes the listeners.
 */
export function clipboardEventsListen(
  target: Document,
  actions: { copy: (event: ClipboardEvent) => boolean; paste: (event: ClipboardEvent) => boolean },
): () => void {
  const copy = (event: ClipboardEvent) => {
    if (clipboardEventForEditor(event)) actions.copy(event);
  };
  const paste = (event: ClipboardEvent) => {
    if (clipboardEventForEditor(event) && actions.paste(event)) event.preventDefault();
  };
  target.addEventListener('copy', copy);
  target.addEventListener('paste', paste);
  return () => {
    target.removeEventListener('copy', copy);
    target.removeEventListener('paste', paste);
  };
}
