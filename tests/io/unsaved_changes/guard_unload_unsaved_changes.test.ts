import { describe, it, expect, afterEach } from 'vitest';
import { GuardUnloadUnsavedChanges } from '@/io/unsaved_changes/guard_unload_unsaved_changes.js';

/**
 * Dispatches a cancelable beforeunload event on the window. The event gets an
 * own writable returnValue like a browser BeforeUnloadEvent, since jsdom only
 * offers the legacy boolean Event.returnValue.
 *
 * @param target Window that receives the event.
 * @returns The dispatched event, for inspecting prevent state.
 */
function dispatchBeforeUnload(target: Window): BeforeUnloadEvent {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(event, 'returnValue', { value: '', writable: true });
  target.dispatchEvent(event);
  return event;
}

const createdGuards: GuardUnloadUnsavedChanges[] = [];

/**
 * Creates a guard on the jsdom window and remembers it for cleanup.
 *
 * @param hasUnsavedChanges Dirty-state callback.
 * @returns The attached guard.
 */
function createGuard(hasUnsavedChanges: () => boolean): GuardUnloadUnsavedChanges {
  const guard = new GuardUnloadUnsavedChanges(window, hasUnsavedChanges);
  createdGuards.push(guard);
  return guard;
}

describe('GuardUnloadUnsavedChanges', () => {
  afterEach(() => {
    createdGuards.splice(0).forEach((guard) => guard.dispose());
  });

  it('requests the browser confirmation when there are unsaved changes', () => {
    createGuard(() => true);
    const event = dispatchBeforeUnload(window);
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(true);
  });

  it('lets the unload through without a prompt when the scene is clean', () => {
    createGuard(() => false);
    const event = dispatchBeforeUnload(window);
    expect(event.defaultPrevented).toBe(false);
    expect(event.returnValue).toBe('');
  });

  it('reads the dirty state at unload time rather than at construction', () => {
    let dirty = false;
    createGuard(() => dirty);
    expect(dispatchBeforeUnload(window).defaultPrevented).toBe(false);
    dirty = true;
    expect(dispatchBeforeUnload(window).defaultPrevented).toBe(true);
  });

  it('skips exactly one prompt after allowNextUnload', () => {
    const guard = createGuard(() => true);
    guard.allowNextUnload();
    expect(dispatchBeforeUnload(window).defaultPrevented).toBe(false);
    expect(dispatchBeforeUnload(window).defaultPrevented).toBe(true);
  });

  it('stops prompting after dispose and tolerates a second dispose', () => {
    const guard = createGuard(() => true);
    guard.dispose();
    guard.dispose();
    expect(dispatchBeforeUnload(window).defaultPrevented).toBe(false);
  });

  it('only listens on the window it was given', () => {
    const otherWindow = new EventTarget() as unknown as Window;
    createGuard(() => true);
    expect(dispatchBeforeUnload(otherWindow).defaultPrevented).toBe(false);
  });
});
