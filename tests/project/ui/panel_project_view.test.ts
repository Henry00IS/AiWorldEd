import { describe, expect, it } from 'vitest';
import {
  PANEL_PROJECT_TILES_MAXIMUM,
  PANEL_PROJECT_VIRTUAL_CURVES,
  panelProjectCompare,
  panelProjectFolderExists,
  panelProjectFiles,
  panelProjectFolderRows,
  panelProjectSizeText,
} from '@/project/ui/panel_project_view.js';
import { panelProjectSnapshotOf } from './panel_project_test_utils.js';

describe('panel_project_view', () => {
  it('lists folders depth-first with direct file counts', () => {
    const snapshot = panelProjectSnapshotOf([
      'a.png',
      'textures/b.png',
      'textures/walls/c.png',
      'maps/m.json',
      'AiWorldEd/.Local/TextureCache/x.png',
    ]);
    const rows = panelProjectFolderRows(snapshot, 'game');
    expect(rows.map((row) => [row.path, row.depth, row.fileCount])).toEqual([
      ['', 0, 1],
      ['maps', 1, 1],
      ['textures', 1, 1],
      ['textures/walls', 2, 1],
      [PANEL_PROJECT_VIRTUAL_CURVES, 0, 0],
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

  it('lists the project curves under the virtual Curves root', () => {
    const snapshot = panelProjectSnapshotOf([
      'AiWorldEd/Curves/Ogee.aicurve',
      'AiWorldEd/Curves/Arch.curve',
      'curves/Loose.aicurve',
    ]);
    const rows = panelProjectFolderRows(snapshot, 'game');
    expect(rows.map((row) => row.path)).toEqual(['', 'curves', PANEL_PROJECT_VIRTUAL_CURVES]);
    expect(rows[2]).toMatchObject({ name: 'Curves', fileCount: 2 });
    expect(panelProjectFiles(snapshot, PANEL_PROJECT_VIRTUAL_CURVES, '').files.map((file) => file.name)).toEqual([
      'Arch.curve',
      'Ogee.aicurve',
    ]);
    expect(panelProjectFolderExists(snapshot, PANEL_PROJECT_VIRTUAL_CURVES)).toBe(true);
    expect(panelProjectFolderExists(snapshot, '//Textures')).toBe(false);
    expect(panelProjectFolderExists(snapshot, '//Curves/Remote')).toBe(false);
  });

  it('shows Remote and Local below Curves in a room', () => {
    const snapshot = panelProjectSnapshotOf(['owner/sky.png']);
    for (const [directory, name] of [
      ['//Curves/Local', 'Own.aicurve'],
      ['//Curves/Remote', 'Arch.aicurve'],
      ['//Curves/Remote', 'Bead.aicurve'],
    ] as const) {
      snapshot.directories.add(directory);
      const path = `${directory}/${name}`;
      snapshot.files.set(path, { path, name, directory, kind: 'curve', size: 1, lastModified: 1 });
    }
    const rows = panelProjectFolderRows(snapshot, 'Room');
    expect(rows.map((row) => [row.path, row.name, row.depth, row.fileCount])).toEqual([
      ['', 'Room', 0, 0],
      ['owner', 'owner', 1, 1],
      [PANEL_PROJECT_VIRTUAL_CURVES, 'Curves', 0, 0],
      ['//Curves/Remote', 'Remote', 1, 2],
      ['//Curves/Local', 'Local', 1, 1],
    ]);
    expect(panelProjectFiles(snapshot, '//Curves/Remote', '').total).toBe(2);
    expect(panelProjectFiles(snapshot, '', 'own.ai').files.map((file) => file.path)).toEqual([
      '//Curves/Local/Own.aicurve',
    ]);
  });

  it('sorts search results by file name like the Texture Browser, ties by path', () => {
    const snapshot = panelProjectSnapshotOf([
      'z/apple.png',
      'a/zebra.png',
      'm/Banana.png',
      'b/tex10.png',
      'a/tex2.png',
      'y/apple.png',
    ]);
    expect(panelProjectFiles(snapshot, '', '.png').files.map((file) => file.path)).toEqual([
      'y/apple.png',
      'z/apple.png',
      'm/Banana.png',
      'a/tex2.png',
      'b/tex10.png',
      'a/zebra.png',
    ]);
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
