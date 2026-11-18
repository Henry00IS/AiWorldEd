import { describe, expect, it } from 'vitest';
import { APPLICATION_DISPLAY_NAME } from '@/application_identity.js';
import {
  discordRichPresenceActivityBuild,
  discordRichPresenceDetails,
  discordRichPresenceLevelName,
  discordRichPresenceStateText,
  type DiscordRichPresenceEditorState,
} from '@/desktop/discord/discord_rich_presence_activity.js';
import { DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY } from '@/desktop/discord/discord_rich_presence_constants.js';

/**
 * Builds an editor state with the given overrides.
 *
 * @param overrides Partial state fields.
 * @returns Complete editor state.
 */
function state(overrides: Partial<DiscordRichPresenceEditorState> = {}): DiscordRichPresenceEditorState {
  return {
    enabled: true,
    hideProjectName: false,
    projectName: 'Castle',
    levelName: 'castle_level.aiworld',
    brushCount: 214,
    ...overrides,
  };
}

describe('discord_rich_presence_activity', () => {
  it('builds details, state, start timestamp, and the logo art key from editor state', () => {
    const activity = discordRichPresenceActivityBuild(state(), 1_700_000_000_000);
    expect(activity).toEqual({
      details: 'castle_level',
      state: 'Editing 214 Brushes',
      timestamps: { start: 1_700_000_000_000 },
      assets: { large_image: DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY, large_text: APPLICATION_DISPLAY_NAME },
    });
    expect(DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY).toBe('logo');
  });

  it('returns null when presence is disabled', () => {
    expect(discordRichPresenceActivityBuild(state({ enabled: false }), 1)).toBeNull();
  });

  it('hides the project and level name when that setting is on', () => {
    expect(discordRichPresenceDetails(state({ hideProjectName: true }))).toBe(APPLICATION_DISPLAY_NAME);
  });

  it('prefers the level stem, then the project name, then Untitled', () => {
    expect(discordRichPresenceDetails(state())).toBe('castle_level');
    expect(discordRichPresenceDetails(state({ levelName: null }))).toBe('Castle');
    expect(discordRichPresenceDetails(state({ levelName: '  ', projectName: null }))).toBe('Untitled');
    expect(discordRichPresenceLevelName('maps\\west/keep.aiworld')).toBe('keep');
  });

  it('describes the brush count in Title Case, including the empty and singular cases', () => {
    expect(discordRichPresenceStateText(0)).toBe('Editing');
    expect(discordRichPresenceStateText(1)).toBe('Editing 1 Brush');
    expect(discordRichPresenceStateText(214)).toBe('Editing 214 Brushes');
  });
});
