import { describe, expect, it } from 'vitest';
import { Tool } from '@/editor/tools/tool.js';
import { layoutCollaborationToolEdits } from '@/layout/setup/layout_collaboration_host.js';
import type { PlayerPlaySession } from '@/player/session/player_play_session.js';
import { PlayerPlayTool } from '@/player/tool/player_play_tool.js';

/** Minimal scene-editing tool. */
class EditTool extends Tool {}

describe('layoutCollaborationToolEdits', () => {
  it('treats a single-use editing tool as a running edit operation', () => {
    const tool = new EditTool();
    expect(layoutCollaborationToolEdits(tool)).toBe(false);
    tool.parent = new EditTool();
    expect(layoutCollaborationToolEdits(tool)).toBe(true);
  });

  // Regression: a viewer's live tick cancels running edit operations every
  // frame, which cancelled play mode (a single-use tool) right after entering.
  it('never treats play mode as an edit operation, so viewers can play', () => {
    const play = new PlayerPlayTool({} as PlayerPlaySession);
    play.parent = new EditTool();
    expect(play.isSingleUse).toBe(true);
    expect(play.changesScene()).toBe(false);
    expect(layoutCollaborationToolEdits(play)).toBe(false);
    expect(layoutCollaborationToolEdits(null)).toBe(false);
  });
});
