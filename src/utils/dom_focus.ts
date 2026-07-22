/**
 * Removes focus from an active form field so keyboard input returns to the app.
 * Safe to call when nothing is focused or focus is not a form control.
 */
export function blurActiveFormField(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!isFormFieldElement(active)) return;
  active.blur();
}

/**
 * Returns whether an element is a form field that captures typing.
 * @param element Element to test.
 * @returns True for input, textarea, select, or contenteditable.
 */
function isFormFieldElement(element: HTMLElement): boolean {
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}
