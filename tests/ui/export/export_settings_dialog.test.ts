import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorSettingsStore } from '../../../src/settings/editor_settings_store.js';
import { MemorySettingsStorage } from '../../../src/settings/settings_storage.js';
import { ExportSettingsDialog } from '../../../src/ui/export/export_settings_dialog.js';

describe('ExportSettingsDialog', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;
  let dialog: ExportSettingsDialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
    dialog = new ExportSettingsDialog(host, store);
  });

  afterEach(() => {
    dialog.dispose();
    host.remove();
  });

  it('returns transient profile, coordinate, and unit overrides', async () => {
    const storedBefore = store.getSnapshot();
    const resultPromise = dialog.show('fbx');
    changeSelect(host, 'export-coordinate-preset', 'blender');
    changeSelect(host, 'export-unit-system', 'imperial');
    changeSelect(host, 'export-length-unit', 'foot');
    clickAction(host, 'confirm');
    const result = await resultPromise;
    expect(result.confirmed).toBe(true);
    if (!result.confirmed) return;
    expect(result.profile.coordinateSpace.presetId).toBe('blender');
    expect(result.profile.unitSystem).toBe('imperial');
    expect(result.profile.imperialUnit).toBe('foot');
    expect(store.getSnapshot()).toEqual(storedBefore);
  });

  it('distinguishes cancellation from a confirmed export profile', async () => {
    const resultPromise = dialog.show('glb');
    clickAction(host, 'cancel');
    await expect(resultPromise).resolves.toEqual({ confirmed: false });
  });

  it('disables export while custom axes are invalid', async () => {
    const resultPromise = dialog.show('obj');
    changeSelect(host, 'export-coordinate-preset', '__export_custom__');
    changeSelect(host, 'export-coordinate-up', '+x');
    const confirm = queryAction(host, 'confirm');
    expect(confirm.disabled).toBe(true);
    expect(host.querySelector('[data-export-settings-summary="true"]')?.textContent).toContain(
      'different perpendicular',
    );
    clickAction(host, 'cancel');
    await resultPromise;
  });
});

/**
 * Changes one export settings select.
 *
 * @param host Dialog host.
 * @param field Stable field id.
 * @param value New value.
 */
function changeSelect(host: HTMLElement, field: string, value: string): void {
  const select = host.querySelector(`[data-export-settings-field="${field}"]`) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Clicks one export settings action.
 *
 * @param host Dialog host.
 * @param action Stable action id.
 */
function clickAction(host: HTMLElement, action: string): void {
  queryAction(host, action).click();
}

/**
 * Finds one export settings action button.
 *
 * @param host Dialog host.
 * @param action Stable action id.
 * @returns Matching button.
 */
function queryAction(host: HTMLElement, action: string): HTMLButtonElement {
  return host.querySelector(`[data-export-settings-action="${action}"]`) as HTMLButtonElement;
}
