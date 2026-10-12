import { describe, expect, it } from 'vitest';
import { EditEdgeCutTool } from '@/edit/tool/edit_edge_cut_tool.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';

describe('edit_edge_cut_tool', () => {
  it('is busy while single-use until cancelled', () => {
    const tool = new EditEdgeCutTool();
    const parent = new EditSelectTool();
    tool.parent = parent;
    expect(tool.isSingleUse).toBe(true);
    expect(tool.isBusy()).toBe(true);
    tool.onKeyDown('Escape');
    expect(tool.isBusy()).toBe(false);
  });

  it('stays busy after a click with no hovered edge', () => {
    const tool = new EditEdgeCutTool();
    tool.parent = new EditSelectTool();
    tool.onActivate();
    tool.onMouseDown(0);
    expect(tool.isBusy()).toBe(true);
  });
});
