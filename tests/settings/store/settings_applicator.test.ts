import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsApplicator } from '@/settings/store/settings_applicator.js';
import {
  createDefaultKeyboardShortcutSettings,
  createDefaultMouseSettings,
  createDefaultViewSettings,
} from '@/settings/store/settings_defaults.js';
import type { EditorSettingsSnapshot } from '@/settings/store/settings_types.js';

describe('SettingsApplicator', () => {
  let root: HTMLElement;
  let applicator: SettingsApplicator;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    applicator = new SettingsApplicator(root);
  });

  afterEach(() => {
    applicator.dispose();
    root.remove();
  });

  it('should apply theme brightness font size and icon scale to the root', () => {
    const snapshot: EditorSettingsSnapshot = {
      activeGameProfileId: null,
      gameProfiles: [],
      customCoordinateSpaces: [],
      view: {
        ...createDefaultViewSettings(),
        theme: 'light',
        brightness: 125,
        rendererFontSize: 16,
        materialBrowserIconSizePercent: 150,
      },
      mouse: createDefaultMouseSettings(),
      update: { automaticChecks: true },
      keyboard: createDefaultKeyboardShortcutSettings(),
    };
    applicator.applySnapshot(snapshot);
    expect(root.getAttribute('data-aiworlded-theme')).toBe('light');
    expect(root.style.getPropertyValue('--aiworlded-viewport-brightness')).toBe('1.25');
    expect(root.style.fontSize).toBe('16px');
    expect(root.style.getPropertyValue('--aiworlded-material-icon-scale')).toBe('1.5');
  });

  it('should resolve dark theme preference directly', () => {
    applicator.applyTheme('dark');
    expect(root.getAttribute('data-aiworlded-theme')).toBe('dark');
  });

  it('should install the view settings stylesheet without any !important declarations', () => {
    applicator.applySnapshot({
      activeGameProfileId: null,
      gameProfiles: [],
      customCoordinateSpaces: [],
      view: { ...createDefaultViewSettings(), theme: 'light' },
      mouse: createDefaultMouseSettings(),
      update: { automaticChecks: true },
      keyboard: createDefaultKeyboardShortcutSettings(),
    });
    const style = document.getElementById('aiworlded-view-settings-styles');
    expect(style?.textContent).toContain('--aiworlded-ui-font-size');
    expect(style?.textContent).toContain('--aiworlded-viewport-brightness');
    expect(style?.textContent).toContain('--aiworlded-material-icon-scale');
    expect(style?.textContent).toContain('#editor-container .editor-status-bar-label');
    expect(style?.textContent).toContain('font-size: 11px');
    expect(style?.textContent).toContain('.tb-browser-grid');
    expect(style?.textContent).not.toContain('!important');
  });
});
