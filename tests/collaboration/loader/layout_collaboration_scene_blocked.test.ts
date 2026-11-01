import { describe, expect, it } from 'vitest';
import type { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import { layoutCollaborationSceneBlocked } from '@/layout/setup/layout_collaboration_host.js';

/**
 * Creates a menu stub with a fixed room state.
 *
 * @param active Whether a room is joined.
 * @returns Menu stub.
 */
function menuStub(active: boolean): LoaderCollaborationMenu {
  return { active: () => active } as unknown as LoaderCollaborationMenu;
}

/** New and Load are blocked while in an online room. */
describe('layoutCollaborationSceneBlocked', () => {
  it('blocks and explains inside a room', () => {
    const messages: string[] = [];
    expect(layoutCollaborationSceneBlocked(menuStub(true), (text) => messages.push(text))).toBe(true);
    expect(messages).toEqual(['Leave the online room before replacing the scene']);
  });

  it('allows replacing the scene offline', () => {
    const messages: string[] = [];
    expect(layoutCollaborationSceneBlocked(menuStub(false), (text) => messages.push(text))).toBe(false);
    expect(messages).toEqual([]);
  });
});
