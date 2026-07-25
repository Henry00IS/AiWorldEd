import { describe, expect, it, vi } from 'vitest';

import { showMaximizedWhenReady } from '../../src/desktop/desktop_window_startup.js';

describe('desktop window startup', () => {
  it('waits for the webview before maximizing and showing the window', () => {
    let notifyReady = (): void => {};
    const maximize = vi.fn();
    const show = vi.fn();
    const webview = {
      on: vi.fn((_name: 'dom-ready', handler: () => void) => {
        notifyReady = handler;
      }),
    };

    showMaximizedWhenReady({ maximize, show, webview });

    expect(maximize).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    notifyReady();
    expect(maximize).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledOnce();
    const maximizeInvocationOrder = maximize.mock.invocationCallOrder[0];
    const showInvocationOrder = show.mock.invocationCallOrder[0];
    expect(maximizeInvocationOrder).toBeDefined();
    expect(showInvocationOrder).toBeDefined();
    if (maximizeInvocationOrder === undefined || showInvocationOrder === undefined) {
      throw new Error('Expected both window operations to have invocation orders');
    }
    expect(maximizeInvocationOrder).toBeLessThan(showInvocationOrder);
  });
});
