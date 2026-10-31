import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  applyFlyingCameraMoveSpeed,
  applyLayoutTextureFilterSettings,
  runEditorFactoryResetAndReload,
} from '@/layout/setup/layout_settings_system.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { ViewSettings } from '@/settings/store/settings_types.js';
import {
  allowEditorStorageWritesForTests,
  areEditorStorageWritesSuppressed,
  EDITOR_STORAGE_KEY_PREFIX,
} from '@/settings/storage/clear_editor_storage.js';

afterEach(() => {
  allowEditorStorageWritesForTests();
  vi.unstubAllGlobals();
});

describe('layout_settings_system orthographic-only safety', () => {
  it('does not throw when applying flying camera speed without a perspective viewport', () => {
    expect(() => applyFlyingCameraMoveSpeed(null, 1.5)).not.toThrow();
  });

  it('applies flying camera speed when a perspective viewport is present', () => {
    const setFlyingCameraMoveSpeed = vi.fn();
    const viewport = { setFlyingCameraMoveSpeed } as unknown as Viewport3D;
    applyFlyingCameraMoveSpeed(viewport, 2.25);
    expect(setFlyingCameraMoveSpeed).toHaveBeenCalledWith(2.25);
  });

  it('does not throw when applying texture filters without a renderer host', () => {
    const view = {
      textureFilterMode: 'linear',
      anisotropyPreference: 'off',
    } as unknown as ViewSettings;
    expect(() => applyLayoutTextureFilterSettings(null, view)).not.toThrow();
  });
});

describe('runEditorFactoryResetAndReload', () => {
  it('wipes editor keys, suppresses further writes, allows the unload, and reloads', () => {
    const values = new Map<string, string>();
    values.set(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`, '{"layout":"custom"}');
    values.set(`${EDITOR_STORAGE_KEY_PREFIX}settings.view`, '{}');
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const reload = vi.fn();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('location', { reload });

    const allowReload = vi.fn(() => {
      expect(reload).not.toHaveBeenCalled();
    });

    runEditorFactoryResetAndReload(allowReload);

    expect(areEditorStorageWritesSuppressed()).toBe(true);
    expect(values.size).toBe(0);
    expect(allowReload).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});
