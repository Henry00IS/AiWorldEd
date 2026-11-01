import type { ProjectAutosaveCapture } from '@/project/autosave/project_autosave.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

/**
 * Builds a scene capture with a number of placeholder objects.
 *
 * @param count Object count.
 * @returns Capture.
 */
export function projectAutosaveCaptureOf(count: number): ProjectAutosaveCapture {
  const objects = Array.from({ length: count }, (_, index) => ({ name: `Box ${index}` }));
  return { data: { version: 1, objects } as never, objectCount: count };
}

/**
 * Builds a project folder over an in-memory handle.
 *
 * @param writable Whether the folder may be written.
 * @returns Root handle and file system.
 */
export function projectAutosaveProjectCreate(writable = true) {
  const root = new ProjectMockDirectoryHandle('game');
  const fileSystem = new ProjectFileSystemHandle(root.asHandle());
  if (!writable) Object.defineProperty(fileSystem, 'writable', { value: false });
  return { root, fileSystem };
}
