/** Modifier keys for synthetic pointer events. */
export interface SyntheticPointerModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Default modifiers with all keys released. */
const SYNTHETIC_POINTER_MODIFIERS_NONE: SyntheticPointerModifiers = {
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
};

/**
 * Builds a synthetic pointerdown for gizmo and transform hit tests.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param modifiers Optional modifier keys (defaults to none held).
 * @returns Synthetic mouse event shaped for handler hit tests.
 */
export function createSyntheticPointerDown(
  clientX: number,
  clientY: number,
  modifiers: SyntheticPointerModifiers = SYNTHETIC_POINTER_MODIFIERS_NONE,
): MouseEvent {
  return createSyntheticPointerEvent('pointerdown', clientX, clientY, 0, 1, modifiers);
}

/**
 * Builds a synthetic pointermove for hover hit tests.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param modifiers Optional modifier keys (defaults to none held).
 * @returns Synthetic mouse event shaped for hover hit tests.
 */
export function createSyntheticPointerMove(
  clientX: number,
  clientY: number,
  modifiers: SyntheticPointerModifiers = SYNTHETIC_POINTER_MODIFIERS_NONE,
): MouseEvent {
  return createSyntheticPointerEvent('pointermove', clientX, clientY, -1, 0, modifiers);
}

/**
 * Builds a synthetic pointer event with fixed button state.
 *
 * @param type Event type string.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param button Button index.
 * @param buttons Buttons bitfield.
 * @param modifiers Modifier keys.
 * @returns Synthetic mouse event.
 */
function createSyntheticPointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  button: number,
  buttons: number,
  modifiers: SyntheticPointerModifiers,
): MouseEvent {
  return {
    type,
    clientX,
    clientY,
    button,
    buttons,
    shiftKey: modifiers.shiftKey,
    ctrlKey: modifiers.ctrlKey,
    altKey: modifiers.altKey,
    metaKey: modifiers.metaKey,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as MouseEvent;
}
