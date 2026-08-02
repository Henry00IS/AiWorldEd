import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { runLayoutExportFbx, runLayoutExportGlb, runLayoutExportObj } from '@/layout/setup/layout_scene_io_actions.js';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';

describe('layout scene export actions', () => {
  let worldObject: THREE.Group;
  let sceneIoHandler: HandlerSceneIo;
  let settingsStore: EditorSettingsStore;

  beforeEach(() => {
    worldObject = new THREE.Group();
    sceneIoHandler = {
      exportGlb: vi.fn(),
      exportObj: vi.fn(),
      exportFbx: vi.fn(),
    } as unknown as HandlerSceneIo;
    settingsStore = new EditorSettingsStore(new MemorySettingsStorage());
  });

  it('should forward the selected profile only to profile-aware export formats', () => {
    const firstProfile = settingsStore.getActiveGameProfile();
    if (!firstProfile) {
      throw new Error('Expected a seeded active game profile');
    }
    const secondProfile = settingsStore.addGameProfile('Unity');
    settingsStore.setGameProfileCoordinateSpacePreset(secondProfile.id, 'unity');
    settingsStore.setGameProfileMetricUnit(secondProfile.id, 'meter');
    const selectedProfile = settingsStore.getActiveGameProfile();
    if (!selectedProfile) {
      throw new Error('Expected the added profile to be active');
    }

    runLayoutExportGlb(sceneIoHandler, worldObject, null);
    runLayoutExportObj(sceneIoHandler, worldObject, null, selectedProfile);
    runLayoutExportFbx(sceneIoHandler, worldObject, null, selectedProfile);

    expect(sceneIoHandler.exportGlb).toHaveBeenCalledWith(worldObject, null);
    expect(sceneIoHandler.exportObj).toHaveBeenCalledWith(worldObject, null, selectedProfile);
    expect(sceneIoHandler.exportFbx).toHaveBeenCalledWith(worldObject, null, selectedProfile);
    expect(selectedProfile.id).not.toBe(firstProfile.id);
    expect(selectedProfile.coordinateSpace.presetId).toBe('unity');
  });
});
