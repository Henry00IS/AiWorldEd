import { describe, expect, it } from 'vitest';
import {
  PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY,
  PROJECT_EDITOR_SNAPSHOTS_DIRECTORY,
  PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY,
  projectEditorFolderPrepare,
  projectEditorGitignoreMerge,
} from '@/project/fs/project_editor_folder.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { ProjectMockDirectoryHandle } from './project_mock_directory_handle.js';

/**
 * Reads a mock file as text.
 *
 * @param root Mock root.
 * @param path Path.
 * @returns Text.
 */
async function textAt(root: ProjectMockDirectoryHandle, path: string): Promise<string> {
  return (root.handleAt(path) as { data: Blob }).data.text();
}

describe('project editor folder', () => {
  it('uses the AiWorldEd layout', () => {
    expect(PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY).toBe('AiWorldEd/.Local/Autosave/History');
    expect(PROJECT_EDITOR_SNAPSHOTS_DIRECTORY).toBe('AiWorldEd/.Local/Snapshots');
    expect(PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY).toBe('AiWorldEd/.Local/TextureCache');
  });

  it('creates AiWorldEd/.gitignore ignoring .Local/', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    await projectEditorFolderPrepare(new ProjectFileSystemHandle(root.asHandle()));
    expect(await textAt(root, 'AiWorldEd/.gitignore')).toBe('.Local/\n');
  });

  it('appends to an existing .gitignore without clobbering it, once', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.put('AiWorldEd/.gitignore', '*.tmp');
    await projectEditorFolderPrepare(new ProjectFileSystemHandle(root.asHandle()));
    expect(await textAt(root, 'AiWorldEd/.gitignore')).toBe('*.tmp\n.Local/\n');
    const covered = new ProjectMockDirectoryHandle('game');
    const file = covered.put('AiWorldEd/.gitignore', '# mine\n/.Local\n');
    await projectEditorFolderPrepare(new ProjectFileSystemHandle(covered.asHandle()));
    expect(await textAt(covered, 'AiWorldEd/.gitignore')).toBe('# mine\n/.Local\n');
    expect(file.writes).toBe(0);
  });

  it('merges ignore lines', () => {
    expect(projectEditorGitignoreMerge(null)).toBe('.Local/\n');
    expect(projectEditorGitignoreMerge('')).toBe('.Local/\n');
    expect(projectEditorGitignoreMerge('a\r\n.Local/\r\n')).toBe('a\r\n.Local/\r\n');
  });
});
