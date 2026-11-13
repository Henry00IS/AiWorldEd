import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const showMessageBox = vi.fn(async (_options: { title: string; message: string }) => true);
vi.mock('@/ui/dialog/dialog_message_box.js', () => ({ showMessageBox }));

const { layoutSceneRecentOpen } = await import('@/layout/setup/layout_scene_recent.js');
type Context = Parameters<typeof layoutSceneRecentOpen>[0];

/**
 * Creates editor services around a Recent file that is readable.
 *
 * @param saved Whether the scene has no unsaved changes.
 * @param granted Whether the browser grants access.
 * @returns Context and the load spy.
 */
function contextCreate(saved: boolean, granted = true) {
  const handle = { name: 'castle.aiworld' };
  const loadRecentScene = vi.fn(async () => undefined);
  const access = vi.fn(async () => (granted ? handle : null));
  const setErrorText = vi.fn();
  const context = {
    host: document.body,
    sceneIo: { getRecentFiles: () => ({ access }), loadRecentScene },
    worldObject: new THREE.Group(),
    commandStack: { isAtSavedPoint: () => saved },
    statusBar: { setErrorText },
    onSceneLoaded: () => undefined,
    sceneBlocked: () => false,
  } as unknown as Context;
  const item = { entry: { handle, usedAt: 1 }, access: 'granted' as const } as never;
  return { context, item, loadRecentScene, access, setErrorText };
}

describe('layoutSceneRecentOpen', () => {
  beforeEach(() => showMessageBox.mockClear());

  it('opens a Recent file straight away when nothing is unsaved', async () => {
    const { context, item, loadRecentScene } = contextCreate(true);
    await layoutSceneRecentOpen(context, item);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(loadRecentScene).toHaveBeenCalledOnce();
  });

  it('asks before unsaved changes are lost and keeps the scene on Cancel', async () => {
    const { context, item, loadRecentScene, access } = contextCreate(false);
    showMessageBox.mockResolvedValueOnce(false);
    await layoutSceneRecentOpen(context, item);

    expect(showMessageBox.mock.calls[0]![0].title).toBe('Open Recent File');
    expect(showMessageBox.mock.calls[0]![0].message).toContain('castle.aiworld');
    expect(access).not.toHaveBeenCalled();
    expect(loadRecentScene).not.toHaveBeenCalled();
  });

  it('reports refused access without touching the scene', async () => {
    const { context, item, loadRecentScene, setErrorText } = contextCreate(true, false);
    await layoutSceneRecentOpen(context, item);

    expect(loadRecentScene).not.toHaveBeenCalled();
    expect(setErrorText).toHaveBeenCalledWith(expect.stringContaining('castle.aiworld'));
  });
});
