import { describe, it, expect, vi } from 'vitest';
import {
  tryHandleSingleUseAxisConstraintKey,
  tryHandleSingleUseModalKey,
} from '@/editor/tools/single_use_axis_constraint_keys.js';
import type { EditorServices } from '@/editor/window/editor_services.js';

/**
 * Builds a minimal services stub for modal-key tests.
 *
 * @param overrides Service overrides.
 * @returns Partial services used by the helper.
 */
function createServices(overrides: Partial<EditorServices> = {}): EditorServices {
  return {
    isTransformDragActive: () => true,
    handleModalKeyDown: () => true,
    ...overrides,
  } as EditorServices;
}

describe('tryHandleSingleUseAxisConstraintKey (Shape Editor X Y Z)', () => {
  it('forwards KeyX KeyY KeyZ to modal while a transform drag is active', () => {
    const handleModalKeyDown = vi.fn((_keyCode: string, _event: KeyboardEvent) => true);
    const services = createServices({ handleModalKeyDown });
    expect(tryHandleSingleUseAxisConstraintKey(services, 'KeyX')).toBe(true);
    expect(tryHandleSingleUseAxisConstraintKey(services, 'KeyY')).toBe(true);
    expect(tryHandleSingleUseAxisConstraintKey(services, 'KeyZ')).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledTimes(3);
    expect(handleModalKeyDown.mock.calls[0]?.[0]).toBe('KeyX');
    expect(handleModalKeyDown.mock.calls[1]?.[0]).toBe('KeyY');
    expect(handleModalKeyDown.mock.calls[2]?.[0]).toBe('KeyZ');
  });

  it('ignores non-axis keys', () => {
    const handleModalKeyDown = vi.fn(() => true);
    const services = createServices({ handleModalKeyDown });
    expect(tryHandleSingleUseAxisConstraintKey(services, 'Escape')).toBe(false);
    expect(tryHandleSingleUseAxisConstraintKey(services, 'KeyG')).toBe(false);
    expect(tryHandleSingleUseAxisConstraintKey(services, 'Digit1')).toBe(false);
    expect(handleModalKeyDown).not.toHaveBeenCalled();
  });

  it('does nothing when no transform drag is active', () => {
    const handleModalKeyDown = vi.fn(() => true);
    const services = createServices({
      isTransformDragActive: () => false,
      handleModalKeyDown,
    });
    expect(tryHandleSingleUseAxisConstraintKey(services, 'KeyX')).toBe(false);
    expect(handleModalKeyDown).not.toHaveBeenCalled();
  });

  it('does nothing when services are missing', () => {
    expect(tryHandleSingleUseAxisConstraintKey(null, 'KeyX')).toBe(false);
    expect(tryHandleSingleUseAxisConstraintKey(undefined, 'KeyZ')).toBe(false);
  });
});

describe('tryHandleSingleUseModalKey (axis + numeric typing)', () => {
  it('forwards digits decimal sign backspace and enter with matching key values', () => {
    const handleModalKeyDown = vi.fn((_keyCode: string, _event: KeyboardEvent) => true);
    const services = createServices({ handleModalKeyDown });
    expect(tryHandleSingleUseModalKey(services, 'Digit0')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Digit2')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Period')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Minus')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Backspace')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Enter')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'Numpad5')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'NumpadDecimal')).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'NumpadEnter')).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledTimes(9);
    expect(handleModalKeyDown.mock.calls[0]?.[1].key).toBe('0');
    expect(handleModalKeyDown.mock.calls[1]?.[1].key).toBe('2');
    expect(handleModalKeyDown.mock.calls[2]?.[1].key).toBe('.');
    expect(handleModalKeyDown.mock.calls[3]?.[1].key).toBe('-');
    expect(handleModalKeyDown.mock.calls[4]?.[1].key).toBe('Backspace');
    expect(handleModalKeyDown.mock.calls[5]?.[1].key).toBe('Enter');
    expect(handleModalKeyDown.mock.calls[6]?.[1].key).toBe('5');
    expect(handleModalKeyDown.mock.calls[7]?.[1].key).toBe('.');
    expect(handleModalKeyDown.mock.calls[8]?.[1].key).toBe('Enter');
  });

  it('still forwards axis locks', () => {
    const handleModalKeyDown = vi.fn(() => true);
    const services = createServices({ handleModalKeyDown });
    expect(tryHandleSingleUseModalKey(services, 'KeyX')).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledWith('KeyX', expect.any(KeyboardEvent));
  });

  it('forwards main-row Minus via original browser event (not only NumpadSubtract)', () => {
    const handleModalKeyDown = vi.fn((_keyCode: string, _event: KeyboardEvent) => true);
    const services = createServices({ handleModalKeyDown });
    const mainRowMinus = new KeyboardEvent('keydown', { code: 'Minus', key: '-' });
    expect(tryHandleSingleUseModalKey(services, 'Minus', mainRowMinus)).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledWith('Minus', mainRowMinus);
    expect(handleModalKeyDown.mock.calls[0]?.[1].code).toBe('Minus');
    expect(handleModalKeyDown.mock.calls[0]?.[1].key).toBe('-');
  });

  it('forwards main-row hyphen when only event.key is set (code mapping incomplete)', () => {
    const handleModalKeyDown = vi.fn((_keyCode: string, _event: KeyboardEvent) => true);
    const services = createServices({ handleModalKeyDown });
    const hyphenOnly = new KeyboardEvent('keydown', { code: '', key: '-' });
    expect(tryHandleSingleUseModalKey(services, '', hyphenOnly)).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledWith('', hyphenOnly);
  });

  it('forwards numpad subtract as well as main-row minus', () => {
    const handleModalKeyDown = vi.fn((_keyCode: string, _event: KeyboardEvent) => true);
    const services = createServices({ handleModalKeyDown });
    const numpad = new KeyboardEvent('keydown', { code: 'NumpadSubtract', key: '-' });
    expect(tryHandleSingleUseModalKey(services, 'NumpadSubtract', numpad)).toBe(true);
    expect(tryHandleSingleUseModalKey(services, 'NumpadSubtract')).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated keys and inactive drag', () => {
    const handleModalKeyDown = vi.fn(() => true);
    const services = createServices({ handleModalKeyDown });
    expect(tryHandleSingleUseModalKey(services, 'KeyG')).toBe(false);
    expect(tryHandleSingleUseModalKey(services, 'Escape')).toBe(false);
    expect(
      tryHandleSingleUseModalKey(createServices({ isTransformDragActive: () => false, handleModalKeyDown }), 'Digit1'),
    ).toBe(false);
    expect(handleModalKeyDown).not.toHaveBeenCalled();
  });
});
