import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildListingFromFileList,
  collectFilesFromDirectoryHandle,
  FileSystemAccessDirectoryAccess,
  WebkitDirectoryInputAccess
} from '../../src/texture/local_directory_access.js';

describe('local_directory_access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('should report File System Access support from showDirectoryPicker', () => {
    const access = new FileSystemAccessDirectoryAccess();
    expect(access.isSupported()).toBe(false);
    (window as { showDirectoryPicker?: () => Promise<never> }).showDirectoryPicker =
      vi.fn();
    expect(access.isSupported()).toBe(true);
  });

  it('should return null when the directory picker is cancelled', async () => {
    (window as { showDirectoryPicker?: () => Promise<never> }).showDirectoryPicker =
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const access = new FileSystemAccessDirectoryAccess();
    const listing = await access.pickDirectoryAndListFiles();
    expect(listing).toBeNull();
  });

  it('should collect nested files from directory handles', async () => {
    const root = createMockDirectoryHandle('Textures', [
      createMockFileHandle('brick.png', 'png-bytes'),
      createMockDirectoryHandle('floors', [
        createMockFileHandle('wood.jpg', 'jpg-bytes')
      ])
    ]);
    const files = await collectFilesFromDirectoryHandle(
      root as unknown as FileSystemDirectoryHandle,
      ''
    );
    expect(files.map((entry) => entry.relativePath).sort()).toEqual([
      'brick.png',
      'floors/wood.jpg'
    ]);
    expect(files.find((entry) => entry.name === 'wood.jpg')?.file.size).toBe(
      'jpg-bytes'.length
    );
  });

  it('should build a listing from a webkitdirectory FileList', () => {
    const fileA = createWebkitFile('a.png', 'Textures/a.png');
    const fileB = createWebkitFile('b.png', 'Textures/sub/b.png');
    const fileList = createFileList([fileA, fileB]);
    const listing = buildListingFromFileList(fileList);
    expect(listing?.folderName).toBe('Textures');
    expect(listing?.files).toHaveLength(2);
    expect(listing?.files[1].relativePath).toBe('Textures/sub/b.png');
  });

  it('should return null for an empty FileList', () => {
    expect(buildListingFromFileList(createFileList([]))).toBeNull();
    expect(buildListingFromFileList(null)).toBeNull();
  });

  it('should support webkitdirectory input access in DOM environments', () => {
    const access = new WebkitDirectoryInputAccess();
    expect(access.isSupported()).toBe(true);
  });
});

/**
 * Minimal handle shape used by collectFilesFromDirectoryHandle tests.
 */
interface MockFsHandle {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncGenerator<MockFsHandle>;
}

/**
 * Creates a mock file handle returning a File.
 * @param name File name.
 * @param contents File contents.
 * @returns Mock file handle cast for the scanner API.
 */
function createMockFileHandle(name: string, contents: string): MockFsHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([contents], name)
  };
}

/**
 * Creates a mock directory handle with child handles.
 * @param name Directory name.
 * @param children Nested handles.
 * @returns Mock directory handle cast for the scanner API.
 */
function createMockDirectoryHandle(
  name: string,
  children: MockFsHandle[]
): MockFsHandle {
  return {
    kind: 'directory',
    name,
    values: async function* () {
      for (const child of children) {
        yield child;
      }
    }
  };
}

/**
 * Creates a File with webkitRelativePath for folder input tests.
 * @param name File name.
 * @param relativePath Relative path from the folder root.
 * @returns File with webkitRelativePath.
 */
function createWebkitFile(name: string, relativePath: string): File {
  const file = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relativePath,
    configurable: true
  });
  return file;
}

/**
 * Builds a minimal FileList-like object for tests.
 * @param files Files to include.
 * @returns FileList-compatible object.
 */
function createFileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const file of files) yield file;
    }
  } as FileList;
  files.forEach((file, index) => {
    Object.defineProperty(list, index, { value: file });
  });
  return list;
}
