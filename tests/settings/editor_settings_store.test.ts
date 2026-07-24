import { describe, it, expect, beforeEach } from 'vitest';
import { EditorSettingsStore } from '../../src/settings/editor_settings_store.js';
import {
  GAME_PROFILE_INDEX_KEY,
  GAME_PROFILE_STORAGE_PREFIX
} from '../../src/settings/game_profile_repository.js';
import { MemorySettingsStorage } from '../../src/settings/settings_storage.js';
import { parseGameProfileJson } from '../../src/settings/game_profile_json.js';

describe('EditorSettingsStore', () => {
  let storage: MemorySettingsStorage;
  let store: EditorSettingsStore;

  beforeEach(() => {
    storage = new MemorySettingsStorage();
    store = new EditorSettingsStore(storage);
  });

  it('should seed a default metric meter game profile', () => {
    const snapshot = store.getSnapshot();
    expect(snapshot.gameProfiles).toHaveLength(1);
    expect(snapshot.gameProfiles[0].name).toBe('Default');
    expect(snapshot.gameProfiles[0].unitSystem).toBe('metric');
    expect(snapshot.gameProfiles[0].metricUnit).toBe('meter');
    expect(snapshot.activeGameProfileId).toBe(snapshot.gameProfiles[0].id);
  });

  it('should persist each game profile as its own JSON document', () => {
    const first = store.getActiveGameProfile();
    expect(first).toBeTruthy();
    const firstKey = `${GAME_PROFILE_STORAGE_PREFIX}${first!.id}`;
    const firstJson = storage.getItem(firstKey);
    expect(firstJson).toBeTruthy();
    expect(parseGameProfileJson(firstJson!)).toEqual(first);

    const second = store.addGameProfile('Second Game');
    const secondKey = `${GAME_PROFILE_STORAGE_PREFIX}${second.id}`;
    expect(storage.getItem(secondKey)).toContain('"Second Game"');
    expect(storage.getItem(GAME_PROFILE_INDEX_KEY)).toContain(second.id);
  });

  it('should import a profile JSON file as a new active profile', () => {
    const source = store.getActiveGameProfile()!;
    store.renameGameProfile(source.id, 'Portable Profile');
    store.setGameProfileMetricUnit(source.id, 'centimeter');
    const json = store.getGameProfileJson(source.id)!;

    const imported = store.importGameProfileJson(json);

    expect(imported.id).not.toBe(source.id);
    expect(imported.name).toBe('Portable Profile');
    expect(imported.metricUnit).toBe('centimeter');
    expect(store.getActiveGameProfile()).toEqual(imported);
    expect(store.getSnapshot().gameProfiles).toHaveLength(2);
    expect(parseGameProfileJson(store.getGameProfileJson(imported.id)!)).toEqual(
      imported
    );
  });

  it('should register an imported custom coordinate space as editable', () => {
    const source = store.getActiveGameProfile()!;
    const custom = store.addCustomCoordinateSpace(source.id, 'Portable Space')!;
    store.setCustomCoordinateSpaceAxis(custom.presetId, 'forward', '+z');

    const imported = store.importGameProfileJson(
      store.getGameProfileJson(source.id)!
    );

    expect(imported.coordinateSpace.isCustom).toBe(true);
    expect(imported.coordinateSpace.presetId).not.toBe(custom.presetId);
    expect(
      store.setCustomCoordinateSpaceAxis(
        imported.coordinateSpace.presetId,
        'forward',
        '-z'
      )
    ).toBe(true);
    expect(store.getActiveGameProfile()!.coordinateSpace.handedness).toBe('right');
  });

  it('should switch metric and imperial unit options on a profile', () => {
    const profile = store.getActiveGameProfile()!;
    store.setGameProfileUnitSystem(profile.id, 'imperial');
    store.setGameProfileImperialUnit(profile.id, 'yard');
    const updated = store.getActiveGameProfile()!;
    expect(updated.unitSystem).toBe('imperial');
    expect(updated.imperialUnit).toBe('yard');

    store.setGameProfileUnitSystem(profile.id, 'metric');
    store.setGameProfileMetricUnit(profile.id, 'kilometer');
    expect(store.getActiveGameProfile()!.metricUnit).toBe('kilometer');
  });

  it('should store view defaults and update theme brightness icon size font and pane count', () => {
    const view = store.getViewSettings();
    expect(view.theme).toBe('dark');
    expect(view.brightness).toBe(100);
    expect(view.materialBrowserIconSizePercent).toBe(100);
    expect(view.rendererFontSize).toBe(13);
    expect(view.viewportPaneCount).toBe(4);

    store.setTheme('light');
    store.setBrightness(150);
    store.setMaterialBrowserIconSizePercent(200);
    store.setRendererFontSize(18);
    store.setViewportPaneCount(2);
    const next = store.getViewSettings();
    expect(next.theme).toBe('light');
    expect(next.brightness).toBe(150);
    expect(next.materialBrowserIconSizePercent).toBe(200);
    expect(next.rendererFontSize).toBe(18);
    expect(next.viewportPaneCount).toBe(2);
  });

  it('should clamp brightness font size and viewport panes into supported ranges', () => {
    store.setBrightness(-20);
    store.setRendererFontSize(200);
    store.setViewportPaneCount(9);
    expect(store.getViewSettings().brightness).toBe(0);
    expect(store.getViewSettings().rendererFontSize).toBe(72);
    expect(store.getViewSettings().viewportPaneCount).toBe(4);
  });

  it('should reload profiles and view settings from storage', () => {
    const profile = store.addGameProfile('Persisted');
    store.setTheme('system');
    store.setRendererFontSize(20);
    store.setViewportPaneCount(3);

    const reloaded = new EditorSettingsStore(storage);
    const snapshot = reloaded.getSnapshot();
    expect(snapshot.gameProfiles.map((entry) => entry.name)).toContain(
      'Persisted'
    );
    expect(snapshot.activeGameProfileId).toBe(profile.id);
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

  it('should refuse to remove the last remaining game profile', () => {
    const only = store.getActiveGameProfile()!;
    expect(store.removeGameProfile(only.id)).toBe(false);
    expect(store.getSnapshot().gameProfiles).toHaveLength(1);
  });

  it('should default new profiles to the Godot coordinate space', () => {
    const profile = store.getActiveGameProfile()!;
    expect(profile.coordinateSpace.presetId).toBe('godot');
    expect(profile.coordinateSpace.handedness).toBe('right');
    expect(profile.coordinateSpace.forward).toBe('-z');
  });

  it('should apply built-in coordinate space presets to a profile', () => {
    const profile = store.getActiveGameProfile()!;
    store.setGameProfileCoordinateSpacePreset(profile.id, 'blender');
    const updated = store.getActiveGameProfile()!;
    expect(updated.coordinateSpace.presetId).toBe('blender');
    expect(updated.coordinateSpace.up).toBe('+z');
    expect(updated.coordinateSpace.forward).toBe('+y');
    expect(updated.coordinateSpace.handedness).toBe('right');

    store.setGameProfileCoordinateSpacePreset(profile.id, 'unity');
    expect(store.getActiveGameProfile()!.coordinateSpace.handedness).toBe('left');
    store.setGameProfileCoordinateSpacePreset(profile.id, 'unreal');
    expect(store.getActiveGameProfile()!.coordinateSpace.right).toBe('+y');
  });

  it('should create edit and remove custom coordinate space presets', () => {
    const profile = store.getActiveGameProfile()!;
    const custom = store.addCustomCoordinateSpace(profile.id, 'Quake-like')!;
    expect(custom.isCustom).toBe(true);
    expect(store.getActiveGameProfile()!.coordinateSpace.name).toBe('Quake-like');
    expect(store.listCoordinateSpacePresets().some((space) => space.isCustom)).toBe(
      true
    );

    expect(
      store.setCustomCoordinateSpaceAxis(custom.presetId, 'forward', '+z')
    ).toBe(true);
    expect(store.getActiveGameProfile()!.coordinateSpace.forward).toBe('+z');
    expect(store.getActiveGameProfile()!.coordinateSpace.handedness).toBe('left');

    store.renameCustomCoordinateSpace(custom.presetId, 'My Engine');
    expect(store.getActiveGameProfile()!.coordinateSpace.name).toBe('My Engine');

    expect(store.removeCustomCoordinateSpace(custom.presetId)).toBe(true);
    expect(store.getActiveGameProfile()!.coordinateSpace.presetId).toBe('godot');
    expect(store.getSnapshot().customCoordinateSpaces).toHaveLength(0);
  });

  it('should persist custom coordinate spaces across reloads', () => {
    const profile = store.getActiveGameProfile()!;
    const custom = store.addCustomCoordinateSpace(profile.id, 'Saved Space')!;
    expect(
      store.setCustomCoordinateSpaceAxis(custom.presetId, 'forward', '+z')
    ).toBe(true);

    const reloaded = new EditorSettingsStore(storage);
    expect(reloaded.getSnapshot().customCoordinateSpaces).toHaveLength(1);
    expect(reloaded.getActiveGameProfile()!.coordinateSpace.name).toBe(
      'Saved Space'
    );
    expect(reloaded.getActiveGameProfile()!.coordinateSpace.forward).toBe('+z');
    expect(reloaded.getActiveGameProfile()!.coordinateSpace.handedness).toBe(
      'left'
    );
  });

});
