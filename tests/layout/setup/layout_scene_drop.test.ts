import { describe, expect, it } from 'vitest';
import { layoutSceneDropOpen, type LayoutSceneDropContext } from '@/layout/setup/layout_scene_drop.js';
import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';

/**
 * Opening a dropped level follows File > Open: it waits while a room blocks
 * scene changes, asks before unsaved changes are lost, and keeps the file
 * handle when the browser gives one so Save writes back to it.
 */
describe('opening a dropped level file', () => {
  it('opens the dropped file straight away when nothing is unsaved', async () => {
    const probe = buildContext({ unsaved: false });
    await layoutSceneDropOpen(probe.context, { file: new File(['{}'], 'castle.aiworld'), handle: null });
    expect(probe.confirms).toBe(0);
    expect(probe.loadedFiles).toEqual(['castle.aiworld']);
    expect(probe.opened).toBe(1);
  });

  it('asks before replacing unsaved changes and does nothing when cancelled', async () => {
    const probe = buildContext({ unsaved: true, confirm: false });
    await layoutSceneDropOpen(probe.context, { file: new File(['{}'], 'castle.aiworld'), handle: null });
    expect(probe.confirms).toBe(1);
    expect(probe.loadedFiles).toEqual([]);
    expect(probe.opened).toBe(0);
  });

  it('opens after the user confirms losing unsaved changes', async () => {
    const probe = buildContext({ unsaved: true, confirm: true });
    await layoutSceneDropOpen(probe.context, { file: new File(['{}'], 'castle.aiworld'), handle: null });
    expect(probe.loadedFiles).toEqual(['castle.aiworld']);
  });

  it('does nothing while the scene must not be replaced', async () => {
    const probe = buildContext({ unsaved: false, blocked: true });
    await layoutSceneDropOpen(probe.context, { file: new File(['{}'], 'castle.aiworld'), handle: null });
    expect(probe.confirms).toBe(0);
    expect(probe.loadedFiles).toEqual([]);
  });

  it('opens through the dropped file handle when the browser provides one', async () => {
    const probe = buildContext({ unsaved: false });
    const handle = { name: 'castle.aiworld' } as SceneFileHandle;
    await layoutSceneDropOpen(probe.context, {
      file: new File(['{}'], 'castle.aiworld'),
      handle: Promise.resolve(handle),
    });
    expect(probe.loadedHandles).toEqual([handle]);
    expect(probe.loadedFiles).toEqual([]);
  });
});

interface DropProbe {
  context: LayoutSceneDropContext;
  confirms: number;
  loadedFiles: string[];
  loadedHandles: SceneFileHandle[];
  opened: number;
}

/**
 * Builds a drop context that records what it was asked to do.
 *
 * @param options Unsaved state, confirm answer, and room block.
 * @returns Context plus counters.
 */
function buildContext(options: { unsaved: boolean; confirm?: boolean; blocked?: boolean }): DropProbe {
  const probe: DropProbe = {
    context: null as unknown as LayoutSceneDropContext,
    confirms: 0,
    loadedFiles: [],
    loadedHandles: [],
    opened: 0,
  };
  probe.context = {
    sceneBlocked: () => options.blocked === true,
    hasUnsavedChanges: () => options.unsaved,
    confirmDiscard: async () => {
      probe.confirms++;
      return options.confirm === true;
    },
    loadFile: async (file) => {
      probe.loadedFiles.push(file.name);
      return true;
    },
    loadHandle: async (handle) => {
      probe.loadedHandles.push(handle);
      return true;
    },
    levelOpened: async () => {
      probe.opened++;
    },
  };
  return probe;
}
