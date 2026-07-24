import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsApplicator } from '../../src/settings/settings_applicator.js';
import { createDefaultViewSettings } from '../../src/settings/settings_defaults.js';
import type { EditorSettingsSnapshot } from '../../src/settings/settings_types.js';

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
      view: {
        ...createDefaultViewSettings(),
        theme: 'light',
        brightness: 125,
        rendererFontSize: 16,
        materialBrowserIconSizePercent: 150
      }
    };
    applicator.applySnapshot(snapshot);
    expect(root.getAttribute('data-aiworlded-theme')).toBe('light');
    expect(root.style.getPropertyValue('--aiworlded-viewport-brightness')).toBe(
      '1.25'
    );
    expect(root.style.fontSize).toBe('16px');
    expect(root.style.getPropertyValue('--aiworlded-material-icon-scale')).toBe(
      '1.5'
    );
  });

  it('should resolve dark theme preference directly', () => {
    applicator.applyTheme('dark');
    expect(root.getAttribute('data-aiworlded-theme')).toBe('dark');
  });

  it('should install the neutral light palette with a Windows-blue interaction accent', () => {
    applicator.applySnapshot({
      activeGameProfileId: null,
      gameProfiles: [],
      view: { ...createDefaultViewSettings(), theme: 'light' }
    });
    const style = document.getElementById('aiworlded-view-settings-styles');
    expect(style?.textContent).toContain('--aiworlded-ui-font-size');
    expect(style?.textContent).toContain('--aiworlded-viewport-brightness');
    expect(style?.textContent).toContain('--aiworlded-material-icon-scale');
    expect(style?.textContent).toContain("data-aiworlded-theme='light'");
    expect(style?.textContent).toContain('background: #ffffff !important');
    expect(style?.textContent).toContain('background: #f3f3f3 !important');
    expect(style?.textContent).toContain('.editor-toolbar');
    expect(style?.textContent).toContain('.editor-properties-panel');
    expect(style?.textContent).toContain('.editor-viewport-title');
    expect(style?.textContent).toContain('.editor-status-bar *');
    expect(style?.textContent).toContain('.editor-context-menu');
    expect(style?.textContent).toContain('.editor-context-menu-item:hover');
    expect(style?.textContent).toContain('.editor-context-menu-item-disabled');
    expect(style?.textContent).toContain('.settings-dialog-header');
    expect(style?.textContent).toContain('.settings-dialog-content');
    expect(style?.textContent).toContain('.settings-dialog-category');
    expect(style?.textContent).toContain(
      "[data-settings-field='coordinate-space-summary']"
    );
    expect(style?.textContent).toContain('color: #424242 !important');
    expect(style?.textContent).toContain('background: #e5e5e5 !important');
    expect(style?.textContent).toContain('color: #0a0a0a !important');
    expect(style?.textContent).toContain('border-color: #0078d4 !important');
    expect(style?.textContent).toContain('background: #cce8ff !important');
    expect(style?.textContent).toContain('.settings-dialog-panel');
    expect(style?.textContent).not.toContain("[role='dialog']");
    expect(style?.textContent).not.toContain('.tb-browser-root');
    expect(style?.textContent).toContain(
      ".tb-browser-tile[aria-selected='true']"
    );
  });
});
