import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { ProjectScanner, projectScannerFileWanted, projectScannerHidden } from '@/project/scan/project_scanner.js';
import { ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

describe('ProjectScanner', () => {
  it('finds compatible files and skips hidden folders', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.put('textures/wall/brick.PNG', 'a');
    root.put('maps/start.json', '{}');
    root.put('maps/old.vmf', 'v');
    root.put('notes.txt', 'n');
    root.put('.aiworlded/autosave/start.autosave.json', '{}');
    root.put('node_modules/pkg/logo.png', 'p');
    const snapshot = await new ProjectScanner().scan(new ProjectFileSystemHandle(root.asHandle()));
    expect([...snapshot.files.keys()].sort()).toEqual(['maps/old.vmf', 'maps/start.json', 'textures/wall/brick.PNG']);
    expect(snapshot.files.get('textures/wall/brick.PNG')).toMatchObject({
      kind: 'texture',
      directory: 'textures/wall',
      size: 1,
    });
    expect([...snapshot.directories].sort()).toEqual(['maps', 'textures', 'textures/wall']);
    expect(snapshot.truncated).toBe(false);
  });

  it('stops at the file and depth caps', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    for (let index = 0; index < 5; index += 1) root.put(`t${index}.png`, 'x');
    root.put('a/b/c/deep.png', 'x');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    const capped = await new ProjectScanner({ files: 3, directories: 10, depth: 16 }).scan(fileSystem);
    expect(capped.files.size).toBe(3);
    expect(capped.truncated).toBe(true);
    const shallow = await new ProjectScanner({ files: 100, directories: 10, depth: 2 }).scan(fileSystem);
    expect(shallow.files.has('a/b/c/deep.png')).toBe(false);
  });

  it('recognises compatible and hidden names', () => {
    expect(projectScannerFileWanted('x.webp')).toBe(true);
    expect(projectScannerFileWanted('x.obj')).toBe(true);
    expect(projectScannerFileWanted('x.psd')).toBe(false);
    expect(projectScannerHidden('.git')).toBe(true);
    expect(projectScannerHidden('textures')).toBe(false);
  });
});
