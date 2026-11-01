import { describe, expect, it } from 'vitest';
import { editorApiToolMutates } from '@/ai/client/editor_api_tool_kinds.js';
import { toolsCollaborationOffline } from '@/collaboration/session/session_collaboration_tools.js';

/** MCP tool classification for the collaboration guard. */
describe('editor_api_tool_kinds', () => {
  it('lets known reads through and guards everything else', () => {
    expect(editorApiToolMutates('get_scene_hierarchy')).toBe(false);
    expect(editorApiToolMutates('capture_view')).toBe(false);
    expect(editorApiToolMutates('move_brush')).toBe(true);
    expect(editorApiToolMutates('some_future_tool')).toBe(true);
  });

  it('returns a structured offline error', () => {
    const result = toolsCollaborationOffline();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('offline');
    expect(result.message).toContain('nothing was changed');
  });
});
