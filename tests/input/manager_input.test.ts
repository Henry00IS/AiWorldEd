import { describe, it, expect } from 'vitest';
import { ManagerInput } from '@/input/manager_input.js';

describe('InputManager', () => {
  it('should track key state changes', () => {
    const manager = new ManagerInput();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(false);
  });

  it('should track QWERTZ Z only under layout-stable KeyZ for isKeyDown queries', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', key: 'z' }));
    expect(manager.isKeyDown('KeyZ')).toBe(true);
    expect(manager.isKeyDown('KeyY')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyY', key: 'z' }));
    expect(manager.isKeyDown('KeyZ')).toBe(false);
  });

  it('should track QWERTZ Y only under layout-stable KeyY for isKeyDown queries', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'y' }));
    expect(manager.isKeyDown('KeyY')).toBe(true);
    expect(manager.isKeyDown('KeyZ')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'y' }));
    expect(manager.isKeyDown('KeyY')).toBe(false);
  });

  it('should track AZERTY W under layout-stable KeyW for isKeyDown queries', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'w' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    expect(manager.isKeyDown('KeyZ')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'w' }));
    expect(manager.isKeyDown('KeyW')).toBe(false);
  });

  it('should track AZERTY A under layout-stable KeyA for isKeyDown queries', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'a' }));
    expect(manager.isKeyDown('KeyA')).toBe(true);
    expect(manager.isKeyDown('KeyQ')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'a' }));
    expect(manager.isKeyDown('KeyA')).toBe(false);
  });

  it('tracks Colemak physical S separately from the typed letter R', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 'r' }));
    expect(manager.isPhysicalKeyDown('KeyS')).toBe(true);
    expect(manager.isKeyDown('KeyR')).toBe(true);
    expect(manager.isKeyDown('KeyS')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', key: 'r' }));
    expect(manager.isPhysicalKeyDown('KeyS')).toBe(false);
    expect(manager.isKeyDown('KeyR')).toBe(false);
    manager.dispose();
  });

  it('tracks Colemak physical D separately from the typed letter S', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 's' }));
    expect(manager.isPhysicalKeyDown('KeyD')).toBe(true);
    expect(manager.isKeyDown('KeyS')).toBe(true);
    expect(manager.isKeyDown('KeyD')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 's' }));
    expect(manager.isPhysicalKeyDown('KeyD')).toBe(false);
    expect(manager.isKeyDown('KeyS')).toBe(false);
    manager.dispose();
  });

  it('releases Colemak physical S without clearing a held physical D', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 'r' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 's' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', key: 'r' }));
    expect(manager.isPhysicalKeyDown('KeyS')).toBe(false);
    expect(manager.isPhysicalKeyDown('KeyD')).toBe(true);
    expect(manager.isKeyDown('KeyR')).toBe(false);
    expect(manager.isKeyDown('KeyS')).toBe(true);
    manager.dispose();
  });

  it('ignores an empty physical code while still storing the typed letter', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: '', key: 'w' }));
    expect(manager.isPhysicalKeyDown('')).toBe(false);
    expect(manager.isKeyDown('KeyW')).toBe(true);
    manager.dispose();
  });

  it('should release QWERTZ Y and Z independently without cross-clearing holds', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'y' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', key: 'z' }));
    expect(manager.isKeyDown('KeyY')).toBe(true);
    expect(manager.isKeyDown('KeyZ')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'y' }));
    expect(manager.isKeyDown('KeyY')).toBe(false);
    expect(manager.isKeyDown('KeyZ')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyY', key: 'z' }));
    expect(manager.isKeyDown('KeyZ')).toBe(false);
  });

  it('should track multiple keys simultaneously', () => {
    const manager = new ManagerInput();
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
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    manager.reset();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    expect(manager.isKeyDown('KeyS')).toBe(false);
  });

  it('should track flying camera keys correctly', () => {
    const manager = new ManagerInput();
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
    const manager = new ManagerInput();
    expect(manager.isKeyDown('NonExistentKey')).toBe(false);
  });

  it('should track mouse button state', () => {
    const manager = new ManagerInput();
    expect(manager.isRightMouseDown()).toBe(false);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(false);
  });

  it('should clear keys on reset including mouse buttons', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    manager.reset();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    expect(manager.isRightMouseDown()).toBe(false);
  });

  it('should stop tracking input after dispose', () => {
    const manager = new ManagerInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(manager.isKeyDown('KeyW')).toBe(true);
    manager.dispose();
    expect(manager.isKeyDown('KeyW')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(manager.isKeyDown('KeyA')).toBe(false);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 2 }));
    expect(manager.isRightMouseDown()).toBe(false);
  });
});
