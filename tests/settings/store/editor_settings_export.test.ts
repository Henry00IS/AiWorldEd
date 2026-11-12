import { describe, expect, it } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { clearEditorOwnedKeys } from '@/settings/storage/clear_editor_storage.js';
import { EXPORT_TARGET_DEFAULT_ID, exportTargetFind, exportTargetList } from '@/io/export/export_targets.js';

/**
 * Wraps memory settings storage as a DOM Storage, as Settings → Reset sees it.
 *
 * @param storage Settings storage.
 * @returns Storage view.
 */
function domStorage(storage: MemorySettingsStorage): Storage {
  return {
    get length() {
      return storage.keys().length;
    },
    key: (index: number) => storage.keys()[index] ?? null,
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => storage.setItem(key, value),
    removeItem: (key: string) => storage.removeItem(key),
    clear: () => storage.keys().forEach((key) => storage.removeItem(key)),
  };
}

describe('export targets', () => {
  it('lists the four programs with their axes and units', () => {
    expect(exportTargetList().map((target) => target.label)).toEqual([
      'Godot (Default)',
      'Unity',
      'Blender',
      'Unreal Engine',
    ]);
    expect(exportTargetFind('unreal').space.metricUnit).toBe('centimeter');
    expect(exportTargetFind('unity').space.coordinateSpace.presetId).toBe('unity');
    expect(exportTargetFind('missing').id).toBe(EXPORT_TARGET_DEFAULT_ID);
  });
});

describe('export and import settings persistence', () => {
  it('remembers the export and import choices across reloads', () => {
    const storage = new MemorySettingsStorage();
    const store = new EditorSettingsStore(storage);
    expect(store.getExportSettings()).toMatchObject({ targetId: 'godot', format: 'fbx', texturesFolder: 'Textures' });
    store.setExportSettings({
      ...store.getExportSettings(),
      targetId: 'unity',
      format: 'gltf',
      fbxEncoding: 'ascii',
      textureModes: { fbx: 'copy', gltf: 'embedded', obj: 'copy' },
      texturesFolder: '',
      objMaterials: false,
    });
    store.setImportSettings({ objSourceTargetId: 'blender' });
    const reloaded = new EditorSettingsStore(storage);
    expect(reloaded.getExportSettings()).toEqual({
      targetId: 'unity',
      format: 'gltf',
      fbxEncoding: 'ascii',
      textureModes: { fbx: 'copy', gltf: 'embedded', obj: 'copy' },
      texturesFolder: '',
      objMaterials: false,
    });
    expect(reloaded.getImportSettings()).toEqual({ objSourceTargetId: 'blender' });
  });

  it('forgets them after Settings → Reset clears the editor keys', () => {
    const storage = new MemorySettingsStorage();
    const store = new EditorSettingsStore(storage);
    store.setExportSettings({ ...store.getExportSettings(), format: 'obj', texturesFolder: 'Maps' });
    store.setImportSettings({ objSourceTargetId: 'unreal' });
    storage.setItem('aiworlded.game_profiles.index', '{}');
    clearEditorOwnedKeys(domStorage(storage));
    expect(storage.keys()).toEqual([]);
    const fresh = new EditorSettingsStore(storage);
    expect(fresh.getExportSettings()).toMatchObject({ format: 'fbx', texturesFolder: 'Textures', targetId: 'godot' });
    expect(fresh.getImportSettings()).toEqual({ objSourceTargetId: 'godot' });
  });

  it('falls back to the default target when the remembered target is unknown', () => {
    const storage = new MemorySettingsStorage();
    storage.setItem('aiworlded.settings.export', JSON.stringify({ targetId: 'old-custom-profile' }));
    const store = new EditorSettingsStore(storage);
    expect(exportTargetFind(store.getExportSettings().targetId).id).toBe('godot');
  });
});
