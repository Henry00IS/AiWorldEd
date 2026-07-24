import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorSettingsStore } from '../../src/settings/editor_settings_store.js';
import { MemorySettingsStorage } from '../../src/settings/settings_storage.js';
import { SettingsDialog } from '../../src/ui/settings/settings_dialog.js';
import {
  IMPERIAL_UNIT_LABELS,
  METRIC_UNIT_LABELS
} from '../../src/settings/unit_presets.js';

describe('SettingsDialog', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;
  let dialog: SettingsDialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
    dialog = new SettingsDialog(host, store);
  });

  afterEach(() => {
    dialog.dispose();
    host.remove();
  });

  it('should start hidden until toggled open', () => {
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getBackdropElement().style.display).toBe('none');
    dialog.toggle();
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.getBackdropElement().style.display).toBe('flex');
    dialog.toggle();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should expose Games View Themes Mouse Keyboard and Update tabs', () => {
    dialog.show();
    const labels = Array.from(
      dialog.getPanelElement().querySelectorAll('[role="tab"]')
    ).map((tab) => (tab.textContent || '').trim());
    expect(labels).toEqual([
      'Games',
      'View',
      'Themes',
      'Mouse',
      'Keyboard',
      'Update'
    ]);
  });

  it('should add a game profile from the Games tab plus button', () => {
    dialog.show();
    const before = store.getSnapshot().gameProfiles.length;
    const addButton = dialog
      .getPanelElement()
      .querySelector('[data-settings-action="add-game-profile"]') as HTMLButtonElement;
    expect(addButton).toBeTruthy();
    addButton.click();
    expect(store.getSnapshot().gameProfiles.length).toBe(before + 1);
  });

  it('should place Load Game Profile immediately after Add Game Profile', () => {
    dialog.show();
    const actions = Array.from(
      dialog.getPanelElement().querySelectorAll('[data-settings-action]')
    ).map((element) => element.getAttribute('data-settings-action'));
    expect(actions.slice(0, 3)).toEqual([
      'add-game-profile',
      'load-game-profile',
      'save-game-profile'
    ]);
  });

  it('should list built-in coordinate space presets and create custom ones', () => {
    dialog.show();
    const presetSelect = dialog
      .getContentElement()
      .querySelector(
        '[data-settings-field="coordinate-space-preset"]'
      ) as HTMLSelectElement;
    expect(presetSelect).toBeTruthy();
    const labels = Array.from(presetSelect.options).map((option) => option.text);
    expect(labels).toContain('Blender');
    expect(labels).toContain('Unity');
    expect(labels).toContain('Godot');
    expect(labels).toContain('Unreal Engine');
    expect(labels).toContain('+ Create custom…');

    presetSelect.value = 'blender';
    presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getActiveGameProfile()?.coordinateSpace.presetId).toBe('blender');
    expect(
      dialog
        .getContentElement()
        .querySelector('[data-settings-field="coordinate-space-summary"]')
        ?.textContent
    ).toContain('Forward +Y');

    const createOption = Array.from(presetSelect.options).find((option) =>
      option.text.includes('Create custom')
    );
    expect(createOption).toBeTruthy();
    presetSelect.value = createOption!.value;
    presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getActiveGameProfile()?.coordinateSpace.isCustom).toBe(true);
    expect(
      dialog
        .getContentElement()
        .querySelector('[data-settings-field="coordinate-space-up"]')
    ).toBeTruthy();
  });

  it('should show metric unit options and switch to imperial options', () => {
    dialog.show();
    const systemSelect = dialog
      .getContentElement()
      .querySelector('[data-settings-field="unit-system"]') as HTMLSelectElement;
    const unitSelect = dialog
      .getContentElement()
      .querySelector('[data-settings-field="length-unit"]') as HTMLSelectElement;
    expect(systemSelect).toBeTruthy();
    expect(unitSelect).toBeTruthy();
    const metricLabels = Array.from(unitSelect.options).map((option) => option.text);
    expect(metricLabels).toEqual(Object.values(METRIC_UNIT_LABELS));

    systemSelect.value = 'imperial';
    systemSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const imperialSelect = dialog
      .getContentElement()
      .querySelector('[data-settings-field="length-unit"]') as HTMLSelectElement;
    const imperialLabels = Array.from(imperialSelect.options).map(
      (option) => option.text
    );
    expect(imperialLabels).toEqual(Object.values(IMPERIAL_UNIT_LABELS));
    expect(store.getActiveGameProfile()?.unitSystem).toBe('imperial');
  });

  it('should expose View tab controls for theme brightness panes icon size and font', () => {
    dialog.show();
    dialog.showTab('view');
    const content = dialog.getContentElement();
    expect(content.textContent).toContain('User Interface');
    expect(content.textContent).toContain('Viewports');
    expect(content.textContent).toContain('Material browser');
    expect(content.textContent).toContain('Fonts');

    const theme = content.querySelector(
      '[data-settings-field="theme"]'
    ) as HTMLSelectElement;
    theme.value = 'system';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().theme).toBe('system');

    const brightness = content.querySelector(
      '[data-settings-field="brightness"]'
    ) as HTMLInputElement;
    brightness.value = '140';
    brightness.dispatchEvent(new Event('input', { bubbles: true }));
    expect(store.getViewSettings().brightness).toBe(140);

    const paneCount = content.querySelector(
      '[data-settings-field="viewport-pane-count"]'
    ) as HTMLSelectElement;
    paneCount.value = '3';
    paneCount.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().viewportPaneCount).toBe(3);

    const iconSize = content.querySelector(
      '[data-settings-field="material-icon-size"]'
    ) as HTMLSelectElement;
    iconSize.value = '200';
    iconSize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().materialBrowserIconSizePercent).toBe(200);

    const fontSize = content.querySelector(
      '[data-settings-field="renderer-font-size"]'
    ) as HTMLSelectElement;
    fontSize.value = '18';
    fontSize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().rendererFontSize).toBe(18);
  });

  it('should show placeholder copy on unfinished tabs', () => {
    dialog.show();
    dialog.showTab('keyboard');
    expect(dialog.getContentElement().textContent).toContain(
      'Keyboard settings will appear here.'
    );
  });

  it('should close when Escape is pressed', () => {
    dialog.show();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(dialog.isOpen()).toBe(false);
  });

  it('should inject settings dialog styles once', () => {
    dialog.show();
    expect(document.getElementById('aiworlded-settings-dialog-styles')).toBeTruthy();
  });

  it('should use editor theme tokens for panel chrome', () => {
    dialog.show();
    const panel = dialog.getPanelElement();
    expect(panel.style.background).toContain('26, 26, 26');
    expect(panel.style.fontFamily).toContain('Segoe UI');
    expect(panel.style.color.replace(/\s/g, '')).toMatch(/#e0e0e0|rgb\(224,224,224\)/);
    expect(panel.style.border).toContain('10, 10, 10');
  });
});


