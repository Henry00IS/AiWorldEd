import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { ModelExportFolderMemory } from '@/io/export/model_export_folder_memory.js';
import { SceneFileRecent } from '@/io/scene_file/recent/scene_file_recent.js';
import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import {
  SceneFileRecentFakeStorage,
  sceneFileRecentFakeHandle,
} from '../../io/scene_file/recent/scene_file_recent_fakes.js';

/**
 * Creates a scene handler with an in-memory Recent list.
 *
 * @returns Handler and its Recent storage.
 */
function handlerCreate() {
  const storage = new SceneFileRecentFakeStorage();
  const handler = new HandlerSceneIo(new ModelExportFolderMemory(), new SceneFileRecent(storage));
  return { handler, storage };
}

/**
 * Creates a level file handle holding one named mesh.
 *
 * @param name File name.
 * @returns Handle.
 */
function levelHandle(name: string): SceneFileHandle {
  const world = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'FromRecent';
  world.add(mesh);
  const json = JSON.stringify(new SceneSerializer().serialize(world));
  const handle = sceneFileRecentFakeHandle(name);
  handle.getFile = async () => new File([json], name);
  return handle;
}

describe('HandlerSceneIo Recent files', () => {
  it('puts a level opened through Load at the top of Recent', async () => {
    const { handler, storage } = handlerCreate();
    const handle = levelHandle('castle.aiworld');
    vi.spyOn(handler.getSceneFileSession(), 'open').mockImplementation(() =>
      handler.getSceneFileSession().openHandle(handle),
    );
    await handler.loadScene(new THREE.Group(), () => undefined, null);
    await handler.getRecentFiles().refresh();

    expect(storage.saved.map((entry) => entry.handle)).toEqual([handle]);
    expect(handler.getRecentFiles().accessible()).toHaveLength(1);
  });

  it('loads a Recent level and remembers it for Save', async () => {
    const { handler } = handlerCreate();
    const handle = levelHandle('tower.aiworld');
    const target = new THREE.Group();
    await handler.loadRecentScene(handle, target, () => undefined, null);

    expect(target.children[0]!.name).toBe('FromRecent');
    expect(handler.getSceneFileSession().getCurrentHandle()).toBe(handle);
    expect(handler.getSceneFileSession().getCurrentFilename()).toBe('tower.aiworld');
  });

  it('moves a Recent level opened again to the top', async () => {
    const { handler, storage } = handlerCreate();
    const castle = levelHandle('castle.aiworld');
    const tower = levelHandle('tower.aiworld');
    await handler.getRecentFiles().remember(tower);
    await handler.getRecentFiles().remember(castle);
    await handler.loadRecentScene(tower, new THREE.Group(), () => undefined, null);
    await handler.getRecentFiles().refresh();

    expect(storage.saved.map((entry) => entry.handle.name)).toEqual(['tower.aiworld', 'castle.aiworld']);
    expect(
      handler
        .getRecentFiles()
        .accessible()
        .map((item) => item.entry.handle.name),
    ).toEqual(['tower.aiworld', 'castle.aiworld']);
  });

  it('takes a Recent level that can no longer be read off the list', async () => {
    const { handler, storage } = handlerCreate();
    const handle = sceneFileRecentFakeHandle('gone.aiworld');
    await handler.getRecentFiles().remember(handle);
    handle.exists = false;
    const setErrorText = vi.fn();
    await handler.loadRecentScene(handle, new THREE.Group(), () => undefined, { setErrorText } as unknown as StatusBar);

    expect(storage.saved).toEqual([]);
    expect(setErrorText).toHaveBeenCalledWith(expect.stringContaining('gone.aiworld'));
  });
});
