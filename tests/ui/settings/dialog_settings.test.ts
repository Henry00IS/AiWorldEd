import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { DialogSettings } from '@/ui/settings/dialog_settings.js';
import { IMPERIAL_UNIT_LABELS, METRIC_UNIT_LABELS } from '@/settings/units/unit_presets.js';

describe('SettingsDialog', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;
  let dialog: DialogSettings;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
    dialog = new DialogSettings(host, store);
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

  it('should expose settings tabs without the removed Themes tab', () => {
    dialog.show();
    const panel = dialog.getPanelElement();
    const labels = Array.from(panel.querySelectorAll('[role="tab"]')).map((tab) => (tab.textContent || '').trim());
    expect(labels).toEqual(['Games', 'View', 'Mouse', 'Keyboard', 'Update']);
    expect(panel.querySelector('[data-settings-tab="themes"]')).toBeNull();
  });

  it('should place a Reset... control on the right of the tab bar', () => {
    dialog.show();
    const panel = dialog.getPanelElement();
    const reset = panel.querySelector('[data-settings-action="reset-all-settings"]') as HTMLButtonElement;
    expect(reset).toBeTruthy();
    expect(reset.textContent).toBe('Reset...');
    expect(reset.style.marginLeft).toBe('auto');
  });

  it('should confirm before invoking the reset host callback', async () => {
    let resetCalls = 0;
    dialog.dispose();
    dialog = new DialogSettings(host, store, {
      onResetAllSettings: () => {
        resetCalls += 1;
      },
    });
    dialog.show();
    const reset = dialog
      .getPanelElement()
      .querySelector('[data-settings-action="reset-all-settings"]') as HTMLButtonElement;
    reset.click();
    await Promise.resolve();
    const yes = host.querySelector('[data-message-box-accept="true"]') as HTMLButtonElement;
    expect(yes).toBeTruthy();
    expect(resetCalls).toBe(0);
    yes.click();
    await Promise.resolve();
    expect(resetCalls).toBe(1);
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
    const actions = Array.from(dialog.getContentElement().querySelectorAll('[data-settings-action]')).map((element) =>
      element.getAttribute('data-settings-action'),
    );
    expect(actions.slice(0, 3)).toEqual(['add-game-profile', 'load-game-profile', 'save-game-profile']);
  });

  it('should list built-in coordinate space presets and create custom ones', () => {
    dialog.show();
    const presetSelect = dialog
      .getContentElement()
      .querySelector('[data-settings-field="coordinate-space-preset"]') as HTMLSelectElement;
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
      dialog.getContentElement().querySelector('[data-settings-field="coordinate-space-summary"]')?.textContent,
    ).toContain('Forward +Y');

    const createOption = Array.from(presetSelect.options).find((option) => option.text.includes('Create custom'));
    expect(createOption).toBeTruthy();
    presetSelect.value = createOption!.value;
    presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getActiveGameProfile()?.coordinateSpace.isCustom).toBe(true);
    expect(dialog.getContentElement().querySelector('[data-settings-field="coordinate-space-up"]')).toBeTruthy();
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
    const imperialLabels = Array.from(imperialSelect.options).map((option) => option.text);
    expect(imperialLabels).toEqual(Object.values(IMPERIAL_UNIT_LABELS));
    expect(store.getActiveGameProfile()?.unitSystem).toBe('imperial');
  });

  it('should expose View tab controls for theme brightness widget size textures icon size and font', () => {
    dialog.show();
    dialog.showTab('view');
    const content = dialog.getContentElement();
    expect(content.textContent).toContain('User Interface');
    expect(content.textContent).toContain('Orientation widget');
    expect(content.textContent).not.toContain('Viewports');
    expect(content.querySelector('[data-settings-field="viewport-pane-count"]')).toBeNull();
    expect(content.textContent).toContain('Textures');
    expect(content.textContent).toContain('Material browser');
    expect(content.textContent).toContain('Fonts');

    const theme = content.querySelector('[data-settings-field="theme"]') as HTMLSelectElement;
    theme.value = 'system';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().theme).toBe('system');

    const brightness = content.querySelector('[data-settings-field="brightness"]') as HTMLInputElement;
    brightness.value = '140';
    brightness.dispatchEvent(new Event('input', { bubbles: true }));
    expect(store.getViewSettings().brightness).toBe(140);

    const widgetSize = content.querySelector('[data-settings-field="camera-widget-size"]') as HTMLInputElement;
    widgetSize.value = '144';
    widgetSize.dispatchEvent(new Event('input', { bubbles: true }));
    expect(store.getViewSettings().cameraWidgetSizePx).toBe(144);

    const toolbarLabels = content.querySelector('[data-settings-field="toolbar-button-labels"]') as HTMLInputElement;
    toolbarLabels.checked = false;
    toolbarLabels.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().toolbarButtonLabels).toBe(false);

    const textureFilter = content.querySelector('[data-settings-field="texture-filter-mode"]') as HTMLSelectElement;
    expect(textureFilter.value).toBe('trilinear');
    textureFilter.value = 'point';
    textureFilter.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().textureFilterMode).toBe('point');

    const refreshedContent = dialog.getContentElement();
    const anisotropy = refreshedContent.querySelector(
      '[data-settings-field="anisotropy-preference"]',
    ) as HTMLSelectElement;
    expect(anisotropy.value).toBe('max');
    expect(anisotropy.disabled).toBe(true);

    store.setTextureFilterMode('trilinear');
    const afterFilterReset = dialog.getContentElement();
    const enabledAnisotropy = afterFilterReset.querySelector(
      '[data-settings-field="anisotropy-preference"]',
    ) as HTMLSelectElement;
    expect(enabledAnisotropy.disabled).toBe(false);
    enabledAnisotropy.value = '8x';
    enabledAnisotropy.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().anisotropyPreference).toBe('8x');

    const afterAnisotropy = dialog.getContentElement();
    const iconSize = afterAnisotropy.querySelector('[data-settings-field="material-icon-size"]') as HTMLSelectElement;
    iconSize.value = '200';
    iconSize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().materialBrowserIconSizePercent).toBe(200);

    const afterIconSize = dialog.getContentElement();
    const fontSize = afterIconSize.querySelector('[data-settings-field="renderer-font-size"]') as HTMLSelectElement;
    fontSize.value = '18';
    fontSize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getViewSettings().rendererFontSize).toBe(18);
  });

  it('should capture and persist keyboard shortcuts from the Keyboard tab', () => {
    dialog.show();
    dialog.showTab('keyboard');
    const moveInput = dialog
      .getContentElement()
      .querySelector('[data-settings-field="keyboard-shortcut-move"]') as HTMLInputElement;
    const deleteInput = dialog
      .getContentElement()
      .querySelector('[data-settings-field="keyboard-shortcut-delete_selected"]') as HTMLInputElement;
    const saveInput = dialog
      .getContentElement()
      .querySelector('[data-settings-field="keyboard-shortcut-save"]') as HTMLInputElement;
    const clipInput = dialog
      .getContentElement()
      .querySelector('[data-settings-field="keyboard-shortcut-clip_commit"]') as HTMLInputElement;

    moveInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
    deleteInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));
    saveInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', ctrlKey: true, bubbles: true }));

    expect(store.getKeyboardShortcutSettings().move.code).toBe('KeyM');
    expect(store.getKeyboardShortcutSettings().delete_selected.code).toBe('Backspace');
    expect(store.getKeyboardShortcutSettings().save.code).toBe('KeyP');
    expect(store.getKeyboardShortcutSettings().save.ctrl).toBe(true);
    expect(clipInput.value).toBe('Enter');
  });

  it('should show fixed reminders for UV smear and 3D fly navigation keys', () => {
    dialog.show();
    dialog.showTab('keyboard');
    const content = dialog.getContentElement();
    const categoryTitles = Array.from(content.querySelectorAll('.settings-dialog-category-title')).map((element) =>
      (element.textContent || '').trim(),
    );
    const reminders = Array.from(content.querySelectorAll('[data-settings-reminder]')).map((element) => ({
      id: element.getAttribute('data-settings-reminder'),
      value: (element as HTMLInputElement).value,
      readOnly: (element as HTMLInputElement).readOnly,
    }));

    expect(categoryTitles).toContain('Navigation & Modifiers');
    expect(categoryTitles).not.toContain('Navigation & Modifiers (Fixed)');
    expect(reminders).toEqual([
      { id: 'keyboard-reminder-uv-smear', value: 'G', readOnly: true },
      { id: 'keyboard-reminder-fly-forward-backward', value: 'W / S', readOnly: true },
      { id: 'keyboard-reminder-fly-left-right', value: 'A / D', readOnly: true },
      { id: 'keyboard-reminder-fly-down-up', value: 'Q / E', readOnly: true },
      { id: 'keyboard-reminder-fly-speed-boost', value: 'Shift', readOnly: true },
    ]);
  });

  it('should persist Mouse tab sensitivities and navigation options', () => {
    dialog.show();
    dialog.showTab('mouse');
    const content = dialog.getContentElement();
    expect(content.textContent).toContain('Mouse Look');
    expect(content.textContent).toContain('Mouse Pan');
    expect(content.textContent).toContain('Mouse Move');

    const moveSpeed = content.querySelector('[data-settings-field="move-speed"]') as HTMLInputElement;
    moveSpeed.value = '8';
    moveSpeed.dispatchEvent(new Event('input', { bubbles: true }));
    const rebuiltLookSensitivity = content.querySelector(
      '[data-settings-field="look-sensitivity"]',
    ) as HTMLInputElement;
    rebuiltLookSensitivity.value = '61';
    rebuiltLookSensitivity.dispatchEvent(new Event('input', { bubbles: true }));
    const panInvertYAxis = content.querySelector('[data-settings-field="pan-invert-y-axis"]') as HTMLInputElement;
    panInvertYAxis.click();
    const moveTowardsCursor = content.querySelector(
      '[data-settings-field="move-camera-towards-cursor"]',
    ) as HTMLInputElement;
    moveTowardsCursor.click();

    const mouse = store.getMouseSettings();
    expect(mouse.moveSpeed).toBe(8);
    expect(mouse.lookSensitivity).toBe(61);
    expect(mouse.panInvertYAxis).toBe(true);
    expect(mouse.moveCameraTowardsCursor).toBe(true);
  });

  it('should close when Escape is pressed', () => {
    dialog.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
