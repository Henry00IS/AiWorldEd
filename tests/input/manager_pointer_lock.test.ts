import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagerPointerLock, managerPointerLock } from '@/input/manager_pointer_lock.js';

/**
 * Builds a fake lockable element.
 *
 * @returns Element and its document.
 */
function createLockableElement(): {
  element: HTMLElement;
  ownerDocument: Document;
  request: ReturnType<typeof vi.fn>;
} {
  const ownerDocument = document;
  const element = ownerDocument.createElement('div');
  ownerDocument.body.appendChild(element);
  const request = vi.fn(() => {
    Object.defineProperty(ownerDocument, 'pointerLockElement', {
      configurable: true,
      value: element,
    });
  });
  Object.defineProperty(element, 'requestPointerLock', {
    configurable: true,
    value: request,
  });
  return { element, ownerDocument, request };
}

/** Clears browser pointer lock state on the test document. */
function clearBrowserLock(): void {
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    value: null,
  });
}

describe('ManagerPointerLock', () => {
  afterEach(() => {
    managerPointerLock.reset();
    clearBrowserLock();
    document.body.replaceChildren();
  });

  it('locks the browser only on the first lock call (0 to 1)', () => {
    const manager = new ManagerPointerLock();
    const { element, request } = createLockableElement();
    manager.lock(element);
    expect(manager.getLockCount()).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    manager.lock(element);
    expect(manager.getLockCount()).toBe(2);
    expect(request).toHaveBeenCalledTimes(1);
    manager.unlock();
    manager.unlock();
  });

  it('unlocks the browser only when the counter reaches zero', () => {
    const manager = new ManagerPointerLock();
    const { element, ownerDocument } = createLockableElement();
    const exitSpy = vi.fn(() => {
      Object.defineProperty(ownerDocument, 'pointerLockElement', {
        configurable: true,
        value: null,
      });
    });
    Object.defineProperty(ownerDocument, 'exitPointerLock', {
      configurable: true,
      value: exitSpy,
    });
    manager.lock(element);
    manager.lock(element);
    manager.unlock();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(manager.getLockCount()).toBe(1);
    manager.unlock();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(manager.getLockCount()).toBe(0);
  });

  it('stacks nested lock and unlock pairs like ShowCursor', () => {
    const manager = new ManagerPointerLock();
    const { element, ownerDocument, request } = createLockableElement();
    const exitSpy = vi.fn(() => {
      Object.defineProperty(ownerDocument, 'pointerLockElement', {
        configurable: true,
        value: null,
      });
    });
    Object.defineProperty(ownerDocument, 'exitPointerLock', {
      configurable: true,
      value: exitSpy,
    });
    manager.lock(element);
    manager.lock(element);
    expect(manager.getLockCount()).toBe(2);
    expect(request).toHaveBeenCalledTimes(1);
    manager.unlock();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(manager.getLockCount()).toBe(1);
    manager.unlock();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(manager.getLockCount()).toBe(0);
  });

  it('ignores unlock when the counter is already zero', () => {
    const manager = new ManagerPointerLock();
    const { ownerDocument } = createLockableElement();
    const exitSpy = vi.fn();
    Object.defineProperty(ownerDocument, 'exitPointerLock', {
      configurable: true,
      value: exitSpy,
    });
    manager.unlock();
    manager.unlock();
    expect(manager.getLockCount()).toBe(0);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reports browser lock against the active element', () => {
    const manager = new ManagerPointerLock();
    const { element } = createLockableElement();
    manager.lock(element);
    expect(manager.isBrowserLocked()).toBe(true);
    expect(manager.getActiveElement()).toBe(element);
    clearBrowserLock();
    expect(manager.isBrowserLocked()).toBe(false);
    manager.unlock();
  });
});
