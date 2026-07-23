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

  it('should activate Unity transform modes on W E R T without modifiers', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' }));
    expect(onMode).toHaveBeenNthCalledWith(1, TransformMode.TRANSLATE);
    expect(onMode).toHaveBeenNthCalledWith(2, TransformMode.ROTATE);
    expect(onMode).toHaveBeenNthCalledWith(3, TransformMode.SCALE);
    expect(onMode).toHaveBeenNthCalledWith(4, TransformMode.BOUNDS);
  });

  it('should not activate scale mode while right mouse fly is held', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    expect(onMode).not.toHaveBeenCalled();
  });

  it('should not activate transform tools when navigation guard is active', () => {
    const onMode = vi.fn();
    handler.setOnTransformMode(onMode);
    handler.setNavigationActiveCallback(() => true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(onMode).not.toHaveBeenCalled();
  });

  it('should extrude on Shift+E rather than plain E', () => {
    const onExtrude = vi.fn();
    const onMode = vi.fn();
    handler.setOnExtrudeFaces(onExtrude);
    handler.setOnTransformMode(onMode);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    expect(onMode).toHaveBeenCalledWith(TransformMode.ROTATE);
    expect(onExtrude).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyE', shiftKey: true })
    );
    expect(onExtrude).toHaveBeenCalled();
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
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
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
