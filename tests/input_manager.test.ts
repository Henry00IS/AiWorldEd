import { describe, it, expect } from 'vitest';
import { InputManager } from '../src/managers/input_manager.js';

describe('InputManager', () => {
  it('should be instantiable', () => {
    const manager = new InputManager();
    expect(manager).toBeDefined();
  });

  it('should track key state changes', () => {
    const manager = new InputManager();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(false);
  });

  it('should track multiple keys simultaneously', () => {
    const manager = new InputManager();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    expect(manager.isKeyDown('KeyS')).toBe(true);
    expect(manager.isKeyDown('KeyA')).toBe(true);
    expect(manager.isKeyDown('KeyD')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    expect(manager.isKeyDown('KeyW')).toBe(false);
    expect(manager.isKeyDown('KeyS')).toBe(false);
    expect(manager.isKeyDown('KeyA')).toBe(false);
    expect(manager.isKeyDown('KeyD')).toBe(false);
  });

  it('should reset all tracked keys', () => {
    const manager = new InputManager();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    manager.reset();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    expect(manager.isKeyDown('KeyS')).toBe(false);
  });

  it('should track flying camera keys correctly', () => {
    const manager = new InputManager();
    const flyingKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'];
    flyingKeys.forEach((key) => {
      expect(manager.isKeyDown(key)).toBe(false);
    });
    flyingKeys.forEach((key) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: key }));
    });
    flyingKeys.forEach((key) => {
      expect(manager.isKeyDown(key)).toBe(true);
    });
  });

  it('should return false for non-existent keys', () => {
    const manager = new InputManager();
    expect(manager.isKeyDown('NonExistentKey')).toBe(false);
  });

  it('should track mouse button state', () => {
    const manager = new InputManager();
    expect(manager.isRightMouseDown()).toBe(false);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(false);
  });

  it('should clear keys on reset including mouse buttons', () => {
    const manager = new InputManager();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    manager.reset();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    expect(manager.isRightMouseDown()).toBe(false);
  });

  it('should stop tracking input after dispose', () => {
    const manager = new InputManager();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    manager.dispose();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(manager.isKeyDown('KeyA')).toBe(false);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(false);
  });

  it('should allow dispose to be called more than once', () => {
    const manager = new InputManager();
    manager.dispose();
    expect(() => manager.dispose()).not.toThrow();
  });
});
