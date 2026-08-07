/**
 * Appends a subtle dropdown caret matching toolbar and options-bar menus.
 *
 * @param button Button receiving the caret.
 * @param ownerDocument Document that owns the caret element.
 * @param marginLeft Optional left margin CSS (viewport title uses a small
 *   inset).
 */
export function appendMenuDropdownCaret(
  button: HTMLButtonElement,
  ownerDocument: Document = document,
  marginLeft?: string,
): HTMLElement {
  const caret = ownerDocument.createElement('span');
  caret.textContent = '▾';
  caret.style.fontSize = '9px';
  caret.style.opacity = '0.7';
  if (marginLeft !== undefined) {
    caret.style.marginLeft = marginLeft;
  }
  button.appendChild(caret);
  return caret;
}
