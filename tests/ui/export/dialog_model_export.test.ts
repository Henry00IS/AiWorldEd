import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import type { ModelExportDestination } from '@/io/export/model_export_destination.js';
import {
  modelExportDialogShow,
  type ModelExportDialogAnswer,
  type ModelExportDialogOptions,
} from '@/ui/export/dialog_model_export.js';

/**
 * Builds a destination that remembers written paths.
 *
 * @param label Shown name.
 * @param existing Paths that already exist.
 * @returns Destination.
 */
function memoryDestination(label: string, existing: string[] = []): ModelExportDestination {
  return {
    label,
    exists: async (path) => existing.includes(path),
    write: async () => undefined,
  };
}

/**
 * Finds a dialog element by its data name.
 *
 * @param name Data name.
 * @returns Element.
 */
function part<T extends HTMLElement = HTMLElement>(name: string): T {
  const element = document.querySelector<T>(`[data-model-export="${name}"]`);
  if (element === null) throw new Error(`missing ${name}`);
  return element;
}

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Types into a text field.
 *
 * @param name Data name.
 * @param value Text.
 */
function type(name: string, value: string): void {
  const input = part<HTMLInputElement>(name);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Picks a select option.
 *
 * @param name Data name.
 * @param value Option value.
 */
function choose(name: string, value: string): void {
  const select = part<HTMLSelectElement>(name);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Export dialog', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
  });

  afterEach(() => {
    host.remove();
    document.body.replaceChildren();
  });

  /**
   * Opens the dialog.
   *
   * @param overrides Option overrides.
   * @returns Answer promise.
   */
  function open(overrides: Partial<ModelExportDialogOptions> = {}): Promise<ModelExportDialogAnswer | null> {
    return modelExportDialogShow({
      host,
      store,
      pickFolder: async () => memoryDestination('Exports'),
      ...overrides,
    });
  }

  it('starts with the target program and offers Embedded and Copy Into Directory', async () => {
    void open();
    const fields = [...document.querySelectorAll('[data-model-export-row]')].map((row) =>
      row.getAttribute('data-model-export-row'),
    );
    expect(fields[0]).toBe('target');
    const textures = part<HTMLSelectElement>('textures');
    expect(textures.value).toBe('embedded');
    expect([...textures.options].map((option) => option.textContent)).toEqual([
      'Embedded (Default)',
      'Copy Into Directory',
    ]);
  });

  it('starts in the folder of the last export and keeps it until another is picked', async () => {
    const answer = open({ folder: memoryDestination('UnityGame') });
    expect(part<HTMLButtonElement>('folder').textContent).toBe('UnityGame');
    expect(part<HTMLButtonElement>('export').disabled).toBe(false);
    part<HTMLButtonElement>('export').click();
    await settle();
    expect((await answer)?.destination.label).toBe('UnityGame');
  });

  it('asks for access to the remembered folder again on export and explains a refusal', async () => {
    let settled = false;
    const access = vi.fn(async () => false);
    void open({ folder: { ...memoryDestination('UnityGame'), access } }).then(() => (settled = true));
    part<HTMLButtonElement>('export').click();
    await settle();
    expect(access).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(part('error').textContent).toBe('UnityGame: Allow access to the folder, or choose another one.');
  });

  it('shows only the fields of the chosen format', async () => {
    void open();
    const rows = () =>
      [...document.querySelectorAll('[data-model-export-row]')].map((row) => row.getAttribute('data-model-export-row'));
    expect(rows()).toEqual(['target', 'format', 'encoding', 'textures', 'folder', 'file-name']);
    choose('textures', 'copy');
    expect(rows()).toEqual(['target', 'format', 'encoding', 'textures', 'folder', 'file-name', 'textures-folder']);
    choose('format', 'obj');
    expect(rows()).toEqual(['target', 'format', 'materials', 'textures', 'folder', 'file-name', 'textures-folder']);
    part<HTMLInputElement>('materials').click();
    expect(rows()).toEqual(['target', 'format', 'materials', 'textures', 'folder', 'file-name']);
    expect(part<HTMLSelectElement>('textures').disabled).toBe(true);
    choose('format', 'glb');
    expect(rows()).toEqual(['format', 'textures', 'folder', 'file-name']);
    expect(part<HTMLSelectElement>('textures').disabled).toBe(true);
  });

  it('hides the Target Program for glTF and brings it back with its choice for FBX and OBJ', async () => {
    void open();
    const rows = () =>
      [...document.querySelectorAll('[data-model-export-row]')].map((row) => row.getAttribute('data-model-export-row'));
    choose('target', 'unity');
    choose('format', 'gltf');
    expect(rows()).not.toContain('target');
    expect(document.querySelector('[data-model-export="target"]')).toBeNull();
    choose('format', 'fbx');
    expect(rows()[0]).toBe('target');
    expect(part<HTMLSelectElement>('target').value).toBe('unity');
    choose('format', 'glb');
    choose('format', 'obj');
    expect(part<HTMLSelectElement>('target').value).toBe('unity');
  });

  it('explains an invalid name and blocks the export', async () => {
    void open();
    part<HTMLButtonElement>('folder').click();
    await settle();
    type('file-name', 'bad:name');
    expect(part('error').textContent).toBe('File name: Use letters, digits, _, - and . only.');
    expect(part<HTMLButtonElement>('export').disabled).toBe(true);
    type('file-name', 'level');
    expect(part('error').textContent).toBe('');
    expect(part<HTMLButtonElement>('export').disabled).toBe(false);
  });

  it('asks before replacing an existing file and answers with the choices', async () => {
    const answer = open({ pickFolder: async () => memoryDestination('Exports', ['level.fbx']) });
    choose('textures', 'copy');
    part<HTMLButtonElement>('folder').click();
    await settle();
    type('file-name', 'level');
    type('textures-folder', '');
    part<HTMLButtonElement>('export').click();
    await settle();
    const replace = document.querySelector<HTMLButtonElement>('[data-message-box-accept="true"]');
    expect(replace?.textContent).toBe('Replace');
    replace!.click();
    const result = await answer;
    expect(result).toMatchObject({ format: 'fbx', fileName: 'level.fbx', textureMode: 'copy', texturesFolder: '' });
    expect(store.getExportSettings()).toMatchObject({ texturesFolder: '', textureModes: { fbx: 'copy' } });
  });

  it('blocks a nested textures folder that climbs out of the model folder', async () => {
    void open();
    choose('textures', 'copy');
    part<HTMLButtonElement>('folder').click();
    await settle();
    type('textures-folder', '../shared');
    expect(part('error').textContent).toBe('Textures folder: Names cannot be "." or "..".');
    expect(part<HTMLButtonElement>('export').disabled).toBe(true);
  });

  it('keeps the dialog open when Escape dismisses the replace question', async () => {
    let settled = false;
    void open({ pickFolder: async () => memoryDestination('Exports', ['level.fbx']) }).then(() => (settled = true));
    choose('textures', 'copy');
    part<HTMLButtonElement>('folder').click();
    await settle();
    type('file-name', 'level');
    part<HTMLButtonElement>('export').click();
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(document.querySelector('[data-message-box-accept="true"]')).toBeNull();
    expect(settled).toBe(false);
    expect(part<HTMLButtonElement>('export').disabled).toBe(false);
  });

  it('starts Unity FBX exports with Copy Into Directory and follows the target until the user picks', async () => {
    store.setExportSettings({ ...store.getExportSettings(), targetId: 'unity' });
    void open();
    const textures = part<HTMLSelectElement>('textures');
    expect(textures.value).toBe('copy');
    expect(textures.selectedOptions[0]?.textContent).toBe('Copy Into Directory (Default)');
    expect([...textures.options].map((option) => option.textContent)).toEqual([
      'Embedded',
      'Copy Into Directory (Default)',
    ]);
    choose('target', 'godot');
    expect(part<HTMLSelectElement>('textures').value).toBe('embedded');
    expect(part<HTMLSelectElement>('textures').selectedOptions[0]?.textContent).toBe('Embedded (Default)');
    choose('textures', 'embedded');
    choose('target', 'unity');
    expect(part<HTMLSelectElement>('textures').value).toBe('embedded');
  });
});
