/** Mouse buttons supported by configurable viewport gestures. */
const MOUSE_BUTTON_LABELS = ['LMB', 'MMB', 'RMB'] as const;

/**
 * Formats a pointer event as a persisted mouse shortcut.
 *
 * @param event Pointer event containing modifiers and button.
 * @returns Canonical shortcut text.
 */
export function formatMouseShortcut(
  event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'button'>,
): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(MOUSE_BUTTON_LABELS[event.button] ?? `Mouse${event.button}`);
  return parts.join('+');
}

/**
 * Checks whether a pointer event exactly matches a configured shortcut.
 *
 * @param event Pointer event to inspect.
 * @param shortcut Canonical configured shortcut.
 * @returns True when button and all modifiers match.
 */
export function matchesMouseShortcut(
  event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'button'>,
  shortcut: string,
): boolean {
  return formatMouseShortcut(event) === shortcut;
}

/**
 * Validates a persisted mouse shortcut.
 *
 * @param value Candidate shortcut value.
 * @returns True when the value uses the canonical supported format.
 */
export function isValidMouseShortcut(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^(?:(?:Ctrl|Alt|Shift|Meta)\+)*(?:LMB|MMB|RMB|Mouse\d+)$/.test(value);
}
