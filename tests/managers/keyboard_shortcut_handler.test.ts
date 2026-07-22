import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager } from '../../src/managers/input_manager.js';
import { KeyboardShortcutHandler } from '../../src/managers/keyboard_shortcut_handler.js';
import { TransformMode } from '../../src/types/transform_mode.js';

describe('KeyboardShortcutHandler', () => {
  let inputManager: InputManager;
  let handler: KeyboardShortcutHandler;

  beforeEach(() => {
    inputManager = new InputManager();
    handler = new KeyboardShortcutHandler(inputManager);
    handler.register();
  });

  it('should activate scale mode on S without modifiers', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    expect(onMode).toHaveBeenCalledWith(TransformMode.SCALE);
  });

  it('should not activate scale mode while right mouse fly is held', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    expect(onMode).not.toHaveBeenCalled();
  });

  it('should not activate transform tools when navigation guard is active', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    handler.setNavigationActiveCallback(() => true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    expect(onMode).not.toHaveBeenCalled();
  });

  it('should still allow Ctrl+D duplicate while flying', () => {
    const onDuplicate = vi.fn();
    handler.setOnDuplicateSelected(onDuplicate);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyD', ctrlKey: true })
    );
    expect(onDuplicate).toHaveBeenCalled();
  });

  it('should ignore tool keys while typing in an input field', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    expect(onMode).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('should invoke escape callback on Escape', () => {
    const onEscape = vi.fn();
    handler.setOnEscape(onEscape);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(onEscape).toHaveBeenCalled();
  });

  it('should undo on Ctrl+Z', () => {
    const onUndo = vi.fn();
    handler.setOnUndo(onUndo);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true })
    );
    expect(onUndo).toHaveBeenCalled();
  });

  it('should redo on Ctrl+Y', () => {
    const onRedo = vi.fn();
    handler.setOnRedo(onRedo);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', code: 'KeyY', ctrlKey: true })
    );
    expect(onRedo).toHaveBeenCalled();
  });

  it('should redo on Ctrl+Shift+Z', () => {
    const onRedo = vi.fn();
    handler.setOnRedo(onRedo);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Z',
        code: 'KeyZ',
        ctrlKey: true,
        shiftKey: true
      })
    );
    expect(onRedo).toHaveBeenCalled();
  });

  it('should undo when key is z even if code is KeyY (QWERTZ)', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    handler.setOnUndo(onUndo);
    handler.setOnRedo(onRedo);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', code: 'KeyY', ctrlKey: true })
    );
    expect(onUndo).toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });
});
