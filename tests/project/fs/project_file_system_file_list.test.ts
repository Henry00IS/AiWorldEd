import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { describe, expect, it } from 'vitest';
import { ProjectFileSystemFileList, projectFileListPathStrip } from '@/project/fs/project_file_system_file_list.js';

/**
 * Builds a listing like a folder input produces.
 *
 * @returns Listing.
 */
function listing() {
  const file = (name: string) => new File(['x'], name, { lastModified: 5 });
  return {
    folderName: 'game',
    files: [
      { name: 'a.png', relativePath: 'game/textures/a.png', file: file('a.png') },
      { name: 'start.json', relativePath: 'game/maps/start.json', file: file('start.json') },
    ],
  };
}

describe('ProjectFileSystemFileList', () => {
  it('lists folders and files from a picked file list', async () => {
    const fileSystem: ProjectFileSystem = new ProjectFileSystemFileList(listing());
    expect(fileSystem.writable).toBe(false);
    expect(fileSystem.watchMode()).toBe('none');
    const root = await fileSystem.directoryList('', () => true);
    expect(root.map((entry) => entry.name).sort()).toEqual(['maps', 'textures']);
    const textures = await fileSystem.directoryList('textures', () => true);
    expect(textures).toEqual([{ name: 'a.png', kind: 'file', size: 1, lastModified: 5 }]);
    expect((await fileSystem.fileRead('maps/start.json')).name).toBe('start.json');
  });

  it('refuses writes and has no observer', async () => {
    const fileSystem: ProjectFileSystem = new ProjectFileSystemFileList(listing());
    await expect(fileSystem.fileWrite('a.json', '{}')).rejects.toThrow('read-only');
    await expect(fileSystem.fileRemove('textures/a.png')).rejects.toThrow('read-only');
    expect(await fileSystem.observe(() => undefined)).toBeNull();
  });

  it('strips the picked folder name from paths', () => {
    expect(projectFileListPathStrip('game/textures/a.png')).toBe('textures/a.png');
  });
});
