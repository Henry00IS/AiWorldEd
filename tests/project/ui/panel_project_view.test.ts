import { describe, expect, it } from 'vitest';
import {
  PANEL_PROJECT_TILES_MAXIMUM,
  panelProjectCompare,
  panelProjectFiles,
  panelProjectFolderRows,
  panelProjectSizeText,
} from '@/project/ui/panel_project_view.js';
import { panelProjectSnapshotOf } from './panel_project_test_utils.js';

describe('panel_project_view', () => {
  it('lists folders depth-first with direct file counts', () => {
    const snapshot = panelProjectSnapshotOf(['a.png', 'textures/b.png', 'textures/walls/c.png', 'maps/m.json']);
    const rows = panelProjectFolderRows(snapshot, 'game');
    expect(rows.map((row) => [row.path, row.depth, row.fileCount])).toEqual([
      ['', 0, 1],
      ['maps', 1, 1],
      ['textures', 1, 1],
      ['textures/walls', 2, 1],
    ]);
    expect(rows[0]?.name).toBe('game');
    expect(rows[3]?.name).toBe('walls');
  });

  it('shows a folder or searches the whole project', () => {
    const snapshot = panelProjectSnapshotOf(['textures/brick2.png', 'textures/brick10.png', 'maps/brick.json']);
    expect(panelProjectFiles(snapshot, 'textures', '').files.map((file) => file.name)).toEqual([
      'brick2.png',
      'brick10.png',
    ]);
    expect(panelProjectFiles(snapshot, 'textures', 'BRICK').total).toBe(3);
    expect(panelProjectFiles(snapshot, '', '').total).toBe(0);
  });

  it('caps the number of tiles', () => {
    const paths = Array.from({ length: PANEL_PROJECT_TILES_MAXIMUM + 50 }, (_, index) => `t/${index}.png`);
    const list = panelProjectFiles(panelProjectSnapshotOf(paths), 't', '');
    expect(list.files.length).toBe(PANEL_PROJECT_TILES_MAXIMUM);
    expect(list.total).toBe(PANEL_PROJECT_TILES_MAXIMUM + 50);
  });

  it('sorts naturally and formats sizes', () => {
    expect(['b10', 'B2', 'a'].sort(panelProjectCompare)).toEqual(['a', 'B2', 'b10']);
    expect(panelProjectSizeText(12)).toBe('12 B');
    expect(panelProjectSizeText(2048)).toBe('2.0 KB');
    expect(panelProjectSizeText(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
