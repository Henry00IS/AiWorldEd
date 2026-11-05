import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearUiThemeChromeRefreshCallbacks,
  onUiThemeChromeRefresh,
  runUiThemeChromeRefresh,
} from '@/ui/theme/theme_ui_refresh.js';

describe('theme_ui_refresh', () => {
  const unregisters: Array<() => void> = [];

  beforeEach(() => {
    clearUiThemeChromeRefreshCallbacks();
  });

  afterEach(() => {
    unregisters.forEach((unregister) => unregister());
    unregisters.length = 0;
    clearUiThemeChromeRefreshCallbacks();
  });

  it('should run registered callbacks when the theme changes', () => {
    const callback = vi.fn();
    unregisters.push(onUiThemeChromeRefresh(callback));

    runUiThemeChromeRefresh();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should run every registered callback once', () => {
    const first = vi.fn();
    const second = vi.fn();
    unregisters.push(onUiThemeChromeRefresh(first));
    unregisters.push(onUiThemeChromeRefresh(second));

    runUiThemeChromeRefresh();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('should stop running a callback after unregistering it', () => {
    const callback = vi.fn();
    const unregister = onUiThemeChromeRefresh(callback);
    unregister();

    runUiThemeChromeRefresh();

    expect(callback).not.toHaveBeenCalled();
  });

  it('should return a function that unregisters the callback', () => {
    const callback = vi.fn();
    const unregister = onUiThemeChromeRefresh(callback);
    expect(unregister).toBeTypeOf('function');

    unregister();
    runUiThemeChromeRefresh();

    expect(callback).not.toHaveBeenCalled();
  });
});
