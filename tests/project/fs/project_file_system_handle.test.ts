import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle, projectFileSystemObserverPaths } from '@/project/fs/project_file_system_handle.js';
import { ProjectMockDirectoryHandle } from './project_mock_directory_handle.js';

describe('ProjectFileSystemHandle', () => {
  it('lists children with stats only for wanted files', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.put('textures/brick.png', 'png');
    root.put('readme.txt', 'hello');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    const entries = await fileSystem.directoryList('', (name) => name.endsWith('.png'));
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'textures', kind: 'directory' },
        { name: 'readme.txt', kind: 'file' },
      ]),
    );
    const textures = await fileSystem.directoryList('textures', () => true);
    expect(textures[0]).toMatchObject({ name: 'brick.png', kind: 'file', size: 3 });
    expect(await fileSystem.directoryList('missing', () => true)).toEqual([]);
  });

  it('writes, reads and removes files, creating folders', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    await fileSystem.fileWrite('.aiworlded/autosave/a.json', '{"x":1}');
    expect(await root.textAt('.aiworlded/autosave/a.json')).toBe('{"x":1}');
    expect(await (await fileSystem.fileRead('.aiworlded/autosave/a.json')).text()).toBe('{"x":1}');
    await fileSystem.fileRemove('.aiworlded/autosave/a.json');
    await fileSystem.fileRemove('.aiworlded/autosave/a.json');
    expect(root.handleAt('.aiworlded/autosave/a.json')).toBeUndefined();
  });

  it('keeps the old contents when a write fails', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    const file = root.put('scene.json', 'old');
    file.failWrite = true;
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    await expect(fileSystem.fileWrite('scene.json', 'new')).rejects.toThrow('disk full');
    expect(await root.textAt('scene.json')).toBe('old');
  });

  it('asks for permission through the handle', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.permission = 'prompt';
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    expect(await fileSystem.permissionQuery()).toBe('prompt');
    expect(await fileSystem.permissionRequest()).toBe(true);
    root.permissionAfterRequest = 'denied';
    expect(await fileSystem.permissionRequest()).toBe(false);
  });

  it('rejects paths that leave the folder', async () => {
    const fileSystem = new ProjectFileSystemHandle(new ProjectMockDirectoryHandle('game').asHandle());
    await expect(fileSystem.fileRead('../secret.png')).rejects.toThrow();
  });

  it('turns observer records into paths or a full rescan', () => {
    const moved = { type: 'moved', relativePathComponents: ['b.png'], relativePathMovedFrom: ['a.png'] };
    expect(projectFileSystemObserverPaths([moved] as unknown as FileSystemChangeRecord[])).toEqual(['b.png', 'a.png']);
    const unknown = { type: 'unknown', relativePathComponents: [], relativePathMovedFrom: null };
    expect(projectFileSystemObserverPaths([unknown] as unknown as FileSystemChangeRecord[])).toBeNull();
  });
});
