import { describe, it, expect, beforeEach } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';

describe('EditorSettingsStore', () => {
  let storage: MemorySettingsStorage;
  let store: EditorSettingsStore;

  beforeEach(() => {
    storage = new MemorySettingsStorage();
    store = new EditorSettingsStore(storage);
  });

  it('should store view defaults and update theme brightness icon size font and pane count', () => {
    const view = store.getViewSettings();
    expect(view.theme).toBe('dark');
    expect(view.brightness).toBe(100);
    expect(view.materialBrowserIconSizePercent).toBe(100);
    expect(view.rendererFontSize).toBe(13);
    expect(view.viewportPaneCount).toBe(4);
    expect(view.textureFilterMode).toBe('trilinear');
    expect(view.anisotropyPreference).toBe('max');
    expect(view.toolbarButtonLabels).toBe(true);

    store.setTheme('light');
    store.setBrightness(150);
    store.setMaterialBrowserIconSizePercent(200);
    store.setRendererFontSize(18);
    store.setViewportPaneCount(2);
    store.setTextureFilterMode('point');
    store.setAnisotropyPreference('4x');
    store.setToolbarButtonLabels(false);
    const next = store.getViewSettings();
    expect(next.theme).toBe('light');
    expect(next.brightness).toBe(150);
    expect(next.materialBrowserIconSizePercent).toBe(200);
    expect(next.rendererFontSize).toBe(18);
    expect(next.viewportPaneCount).toBe(2);
    expect(next.textureFilterMode).toBe('point');
    expect(next.anisotropyPreference).toBe('4x');
    expect(next.toolbarButtonLabels).toBe(false);
  });

  it('should persist texture filter preferences across reloads', () => {
    store.setTextureFilterMode('bilinear');
    store.setAnisotropyPreference('8x');

    const reloaded = new EditorSettingsStore(storage);
    expect(reloaded.getViewSettings().textureFilterMode).toBe('bilinear');
    expect(reloaded.getViewSettings().anisotropyPreference).toBe('8x');
  });

  it('should clamp brightness font size and viewport panes into supported ranges', () => {
    store.setBrightness(-20);
    store.setRendererFontSize(200);
    store.setViewportPaneCount(9);
    expect(store.getViewSettings().brightness).toBe(0);
    expect(store.getViewSettings().rendererFontSize).toBe(72);
    expect(store.getViewSettings().viewportPaneCount).toBe(4);
  });

  it('should persist validated mouse navigation settings across reloads', () => {
    store.updateMouseSettings({
      lookSensitivity: 61,
      moveSpeed: 8,
      panInvertXAxis: true,
      moveCameraTowardsCursor: true,
    });
    store.updateMouseSettings({ moveSensitivity: 500 });

    const mouse = store.getMouseSettings();
    expect(mouse.lookSensitivity).toBe(61);
    expect(mouse.moveSpeed).toBe(8);
    expect(mouse.panInvertXAxis).toBe(true);
    expect(mouse.moveCameraTowardsCursor).toBe(true);
    expect(mouse.moveSensitivity).toBe(100);

    const reloaded = new EditorSettingsStore(storage);
    expect(reloaded.getMouseSettings()).toEqual(mouse);
  });

  it('should default automatic update checks Off and persist a user toggle On', () => {
    expect(store.getUpdateSettings().automaticChecks).toBe(false);

    store.setAutomaticUpdateChecksEnabled(true);

    expect(store.getSnapshot().update.automaticChecks).toBe(true);
    expect(new EditorSettingsStore(storage).getUpdateSettings().automaticChecks).toBe(true);
  });

  it('should persist rebindable keyboard shortcuts across reloads', () => {
    expect(store.getKeyboardShortcutSettings().move.code).toBe('KeyW');
    expect(store.getKeyboardShortcutSettings().delete_selected.code).toBe('Delete');
    store.setKeyboardShortcut('move', createShortcut('KeyM'));
    store.setKeyboardShortcut('face', createShortcut('KeyF', true, true));

    const reloaded = new EditorSettingsStore(storage);

    expect(reloaded.getKeyboardShortcutSettings().move.code).toBe('KeyM');
    expect(reloaded.getKeyboardShortcutSettings().face.code).toBe('KeyF');
    expect(reloaded.getKeyboardShortcutSettings().face.ctrl).toBe(true);
    expect(reloaded.getKeyboardShortcutSettings().face.shift).toBe(true);
  });

  it('should reload view settings from storage and ignore keys of removed features', () => {
    storage.setItem('aiworlded.game_profiles.index', '{"activeGameProfileId":"x","profileIds":["x"]}');
    storage.setItem('aiworlded.game_profile.x', '{"id":"x"}');
    store.setTheme('system');
    store.setRendererFontSize(20);
    store.setViewportPaneCount(3);

    const reloaded = new EditorSettingsStore(storage);
    const snapshot = reloaded.getSnapshot();
    expect(Object.keys(snapshot).sort()).toEqual(['keyboard', 'mouse', 'update', 'view']);
    expect(snapshot.view.theme).toBe('system');
    expect(snapshot.view.rendererFontSize).toBe(20);
    expect(snapshot.view.viewportPaneCount).toBe(3);
  });

  it('should notify subscribers when settings change', () => {
    const events: string[] = [];
    store.subscribe((snapshot) => {
      events.push(snapshot.view.theme);
    });
    store.setTheme('light');
    expect(events).toEqual(['light']);
  });
});

/**
 * Creates a shortcut binding for store tests.
 *
 * @param code KeyboardEvent.code value.
 * @returns Shortcut binding without modifiers.
 */
function createShortcut(code: string, ctrl: boolean = false, shift: boolean = false) {
  return { code, ctrl, shift, alt: false, meta: false };
}
