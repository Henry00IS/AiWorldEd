import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { EditorWindowTitle, editorWindowTitleInstall, editorWindowTitleUninstall } from '@/ui/window_title.js';

describe('SceneIOHandler window title', () => {
  const titles: string[] = [];
  const world = new THREE.Group();
  const handler = new HandlerSceneIo();

  afterEach(() => {
    editorWindowTitleUninstall();
    titles.length = 0;
    handler.getSceneFileSession().forget();
    vi.restoreAllMocks();
  });

  function install(): void {
    editorWindowTitleInstall(
      new EditorWindowTitle({
        includeVersion: false,
        setTitle: (title) => {
          titles.push(title);
        },
      }),
    );
  }

  function sceneFile(name: string): File {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = 'Block';
    const group = new THREE.Group();
    group.add(mesh);
    return new File([JSON.stringify(new SceneSerializer().serialize(group))], name);
  }

  it('updates the title when a level is opened, saved as a new name, or cleared', async () => {
    install();
    const session = handler.getSceneFileSession();
    vi.spyOn(session, 'open').mockImplementation(async () => {
      session.rememberName('start.aiworld');
      return { file: sceneFile('start.aiworld'), filename: 'start.aiworld' };
    });
    vi.spyOn(session, 'saveAs').mockImplementation(async () => {
      session.rememberName('alley.aiworld');
      return 'alley.aiworld';
    });

    await handler.loadScene(world, () => undefined, null);
    expect(titles.at(-1)).toBe('start - AI World Editor');

    await expect(handler.saveScene(world, null, true)).resolves.toBe(true);
    expect(titles.at(-1)).toBe('alley - AI World Editor');

    handler.clearScene(world, null);
    expect(titles.at(-1)).toBe('AI World Editor');
  });

  it('remembers the project file name after loading a scene from elsewhere', async () => {
    install();
    const target = new THREE.Group();
    const loaded = await handler.loadSceneFile(
      sceneFile('start.aiworld'),
      target,
      () => undefined,
      null,
      'start.aiworld (autosave)',
      'maps/start.aiworld',
    );
    expect(loaded).toBe(true);
    expect(handler.getSceneFileSession().getCurrentFilename()).toBe('start.aiworld');
    expect(titles.at(-1)).toBe('start - AI World Editor');
  });
});
