/** Supported modifier keys for configurable mouse-drag gestures. */
export type MouseDragModifier = 'none' | 'alt' | 'control' | 'shift';

/** Supported mouse buttons for configurable mouse-drag gestures. */
export type MouseDragButton = 'left' | 'middle' | 'right';

/** Serializable mouse-drag gesture binding. */
export type MouseDragBinding = `${MouseDragModifier}+${MouseDragButton}`;

/** Default gesture used to orbit around the current selection. */
export const DEFAULT_ORBIT_SELECTION_BINDING: MouseDragBinding = 'alt+left';

/** All gestures offered by the Mouse settings menu. */
export const MOUSE_DRAG_BINDING_OPTIONS: readonly MouseDragBinding[] = Object.freeze(
  ['none', 'alt', 'control', 'shift'].flatMap((modifier) =>
    ['left', 'middle', 'right'].map((button) => `${modifier}+${button}` as MouseDragBinding),
  ),
);

/**
 * Tests whether a pointer event matches a configured drag binding.
 *
 * @param event Pointer event to inspect.
 * @param binding Configured modifier and mouse button.
 * @returns True when the event exactly matches the gesture.
 */
export function matchesMouseDragBinding(event: MouseEvent, binding: MouseDragBinding): boolean {
  const [modifier, button] = binding.split('+') as [MouseDragModifier, MouseDragButton];
  return event.button === getMouseButtonNumber(button) && matchesModifier(event, modifier);
}

/**
 * Formats a mouse-drag gesture for settings UI.
 *
 * @param binding Gesture to format.
 * @returns Human-readable gesture label.
 */
export function formatMouseDragBinding(binding: MouseDragBinding): string {
  const [modifier, button] = binding.split('+');
  const modifierLabel = modifier === 'none' ? '' : `${capitalize(modifier)} + `;
  return `${modifierLabel}${capitalize(button)} mouse`;
}

/**
 * Validates an unknown persisted mouse binding.
 *
 * @param value Candidate value.
 * @returns True when the value is a supported binding.
 */
export function isMouseDragBinding(value: unknown): value is MouseDragBinding {
  return typeof value === 'string' && MOUSE_DRAG_BINDING_OPTIONS.includes(value as MouseDragBinding);
}

/**
 * Maps a named mouse button to the browser button number.
 *
 * @param button Named mouse button.
 * @returns Browser MouseEvent button number.
 */
function getMouseButtonNumber(button: MouseDragButton): number {
  return { left: 0, middle: 1, right: 2 }[button];
}

/**
 * Tests exact modifier state for a gesture.
 *
 * @param event Mouse event to inspect.
 * @param modifier Required modifier.
 * @returns True when only the configured modifier is active.
 */
function matchesModifier(event: MouseEvent, modifier: MouseDragModifier): boolean {
  return (
    event.altKey === (modifier === 'alt') &&
    event.ctrlKey === (modifier === 'control') &&
    event.shiftKey === (modifier === 'shift') &&
    !event.metaKey
  );
}

/**
 * Capitalizes the first character of a label.
 *
 * @param value Label value.
 * @returns Capitalized label.
 */
function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
