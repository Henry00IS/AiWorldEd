/**
 * Resolves the Window that owns a viewport pick element. Falls back to the main
 * window when the content element is a test mock without a document.
 *
 * @param viewport Object exposing getContentElement, or null.
 * @returns Owner window for pointer capture.
 */
export function resolveViewportOwnerWindow(
  viewport: {
    getContentElement?: () => HTMLElement;
  } | null,
): Window {
  const content = viewport?.getContentElement?.();
  const ownerDocument = content?.ownerDocument;
  return ownerDocument?.defaultView ?? window;
}
