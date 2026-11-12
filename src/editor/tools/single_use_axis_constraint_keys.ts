import type { EditorServices } from '../window/editor_services.js';

/**
 * Handles Shape Editor single-use axis lock keys. Same key again clears the
 * lock; another axis key switches to that axis (via modal toggle).
 *
 * @param services Map editor services, or null.
 * @param keyCode Key code from OnKeyDown.
 * @param event Optional original browser event for layout-accurate matching.
 * @returns True when X, Y, or Z was handled during an active transform drag.
 */
export function tryHandleSingleUseAxisConstraintKey(
  services: EditorServices | null | undefined,
  keyCode: string,
  event?: KeyboardEvent | null,
): boolean {
  if (!isSingleUseAxisConstraintKeyCode(keyCode)) {
    return false;
  }
  return tryHandleSingleUseModalKey(services, keyCode, event);
}

/**
 * Routes modal transform keys during single-use G/R/S: axis locks, numeric
 * typing, Enter confirm. Escape stays on the tool for full cancel. Prefer the
 * original browser event so main-row Minus (not only NumpadSubtract) and
 * produced characters are matched correctly.
 *
 * @param services Map editor services, or null.
 * @param keyCode Key code from OnKeyDown.
 * @param event Optional original browser event.
 * @returns True when the modal controller consumed the key.
 */
export function tryHandleSingleUseModalKey(
  services: EditorServices | null | undefined,
  keyCode: string,
  event?: KeyboardEvent | null,
): boolean {
  if (!services || !services.isTransformDragActive()) {
    return false;
  }
  const keyboardEvent = event ?? createModalKeyboardEvent(keyCode);
  if (!isSingleUseModalKey(keyCode, keyboardEvent)) {
    return false;
  }
  return services.handleModalKeyDown(keyCode, keyboardEvent) === true;
}

/**
 * Returns whether the key code is a single-use axis lock key.
 *
 * @param keyCode Key code string.
 * @returns True for KeyX, KeyY, or KeyZ.
 */
function isSingleUseAxisConstraintKeyCode(keyCode: string): boolean {
  return keyCode === 'KeyX' || keyCode === 'KeyY' || keyCode === 'KeyZ';
}

/**
 * Returns whether the key participates in single-use modal transform input.
 *
 * @param keyCode Layout-stable key code from the tool router.
 * @param event Browser or synthetic keyboard event.
 * @returns True for axis, digit, decimal, sign, backspace, or confirm keys.
 */
function isSingleUseModalKey(keyCode: string, event: KeyboardEvent): boolean {
  if (isSingleUseModalKeyCode(keyCode)) {
    return true;
  }
  return isSingleUseModalKeyFromEvent(event);
}

/**
 * Returns whether the key code alone is a known modal transform key.
 *
 * @param keyCode Key code string.
 * @returns True for axis, digit, decimal, sign, backspace, or confirm codes.
 */
function isSingleUseModalKeyCode(keyCode: string): boolean {
  if (isSingleUseAxisConstraintKeyCode(keyCode)) {
    return true;
  }
  if (keyCode === 'Backspace' || keyCode === 'Enter' || keyCode === 'NumpadEnter') {
    return true;
  }
  if (keyCode === 'Period' || keyCode === 'NumpadDecimal' || keyCode === 'Comma') {
    return true;
  }
  if (keyCode === 'Minus' || keyCode === 'NumpadSubtract') {
    return true;
  }
  if (/^Digit[0-9]$/.test(keyCode)) {
    return true;
  }
  if (/^Numpad[0-9]$/.test(keyCode)) {
    return true;
  }
  return false;
}

/**
 * Detects modal numeric keys from the live browser event (main-row minus when
 * code mapping is incomplete, produced hyphen characters, etc.).
 *
 * @param event Browser keyboard event.
 * @returns True when the event should reach the modal controller.
 */
function isSingleUseModalKeyFromEvent(event: KeyboardEvent): boolean {
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    return true;
  }
  if (event.key === '-' || event.key === '−' || event.key === '﹣') {
    return true;
  }
  if (event.key === '.' || event.key === ',') {
    return true;
  }
  if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
    return true;
  }
  if (event.key === 'Backspace' || event.key === 'Enter') {
    return true;
  }
  return false;
}

/**
 * Builds a minimal keyboard event for modal axis and numeric matching.
 *
 * @param keyCode Physical key code from the tool router.
 * @returns KeyboardEvent suitable for handleModalKeyDown.
 */
function createModalKeyboardEvent(keyCode: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    code: keyCode,
    key: modalKeyFromKeyCode(keyCode),
  });
}

/**
 * Maps a key code to the KeyboardEvent.key value the modal router expects.
 *
 * @param keyCode Physical key code.
 * @returns Matching key string.
 */
function modalKeyFromKeyCode(keyCode: string): string {
  if (keyCode === 'KeyX') {
    return 'x';
  }
  if (keyCode === 'KeyY') {
    return 'y';
  }
  if (keyCode === 'KeyZ') {
    return 'z';
  }
  if (keyCode === 'Backspace') {
    return 'Backspace';
  }
  if (keyCode === 'Enter' || keyCode === 'NumpadEnter') {
    return 'Enter';
  }
  if (keyCode === 'Period' || keyCode === 'NumpadDecimal' || keyCode === 'Comma') {
    return '.';
  }
  if (keyCode === 'Minus' || keyCode === 'NumpadSubtract') {
    return '-';
  }
  if (keyCode.startsWith('Digit') && keyCode.length === 6) {
    return keyCode.slice(5);
  }
  if (keyCode.startsWith('Numpad') && keyCode.length === 7) {
    const suffix = keyCode.slice(6);
    if (/^[0-9]$/.test(suffix)) {
      return suffix;
    }
  }
  return keyCode;
}
