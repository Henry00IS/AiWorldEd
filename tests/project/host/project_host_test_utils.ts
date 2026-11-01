import { vi } from 'vitest';
import { ControllerProject } from '@/project/controller/controller_project.js';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveKey,
  projectAutosavePath,
} from '@/project/autosave/project_autosave_files.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import type { ProjectPicker } from '@/project/fs/project_picker.js';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';
import type { HostProjectEditor } from '@/project/host/host_project_editor.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { PROJECT_MOCK_PNG, ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

/** Store kept in memory. */
export class ProjectHostMemoryStore extends StoreProjectHandle {
  handle: FileSystemDirectoryHandle | null = null;

  /**
   * Remembers a handle.
   *
   * @param handle Handle.
   */
  override async save(handle: FileSystemDirectoryHandle): Promise<void> {
    this.handle = handle;
  }

  /**
   * Returns the remembered handle.
   *
   * @returns Handle, or null.
   */
  override async load(): Promise<FileSystemDirectoryHandle | null> {
    return this.handle;
  }

  /** Forgets the handle. */
  override async clear(): Promise<void> {
    this.handle = null;
  }
}

/** Storage kept in memory. */
export class ProjectHostMemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  /**
   * Returns the item count.
   *
   * @returns Count.
   */
  get length(): number {
    return this.items.size;
  }

  /** Removes every item. */
  clear(): void {
    this.items.clear();
  }

  /**
   * Reads an item.
   *
   * @param key Key.
   * @returns Value, or null.
   */
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  /**
   * Returns the key at an index.
   *
   * @param index Index.
   * @returns Key, or null.
   */
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  /**
   * Removes an item.
   *
   * @param key Key.
   */
  removeItem(key: string): void {
    this.items.delete(key);
  }

  /**
   * Writes an item.
   *
   * @param key Key.
   * @param value Value.
   */
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/**
 * Builds a fake editor host whose confirm answers come from a queue.
 *
 * @param answers Confirm answers in order; missing answers are false.
 * @returns Host and its spies.
 */
export function projectHostFakeCreate(answers: boolean[] = []) {
  const library = new TextureLibrary();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const listeners = new Set<() => void>();
  const state = { blocked: false, unsaved: false };
  const host = {
    container,
    anchor: () => null,
    status: vi.fn(),
    sceneBlocked: vi.fn(() => state.blocked),
    sceneHasUnsavedWork: vi.fn(() => state.unsaved),
    sceneLoad: vi.fn(() => true),
    sceneCapture: vi.fn(() => ({ data: { version: 1, objects: [] } as never, objectCount: 0 })),
    vmfImport: vi.fn(async () => undefined),
    objImport: vi.fn(),
    textureSelect: vi.fn(),
    confirm: vi.fn(async () => answers.shift() ?? false),
    historyListen: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    textureLibrary: () => library,
  } satisfies HostProjectEditor;
  return { host, library, state, historyFire: () => listeners.forEach((listener) => listener()) };
}

/**
 * Builds a mock project folder with a texture, a scene, a VMF and an OBJ.
 *
 * @returns Root handle and a picker returning it.
 */
export function projectHostFolderCreate() {
  mockObjectUrlApis();
  const root = new ProjectMockDirectoryHandle('game');
  root.put('textures/brick.png', PROJECT_MOCK_PNG);
  root.put('maps/start.json', JSON.stringify({ version: 1, objects: [{ name: 'A' }] }));
  root.put('maps/de_dust.vmf', 'versioninfo {}');
  root.put('models/crate.obj', 'v 0 0 0');
  const picker: ProjectPicker = {
    pick: async () => ({
      fileSystem: new ProjectFileSystemHandle(root.asHandle()),
      handle: root.asHandle(),
      notice: null,
    }),
  };
  return { root, picker };
}

/**
 * Builds a project controller over the mock folder.
 *
 * @param library Texture library.
 * @param picker Folder picker.
 * @returns Controller and its store.
 */
export function projectHostControllerCreate(
  library: TextureLibrary,
  picker: ProjectPicker,
  gate: () => string | null = () => null,
) {
  const store = new ProjectHostMemoryStore(null);
  return { store, project: new ControllerProject({ library, picker, store, desktop: null, gate }) };
}

/**
 * Builds an autosave that never writes on its own during a test.
 *
 * @param project Project controller.
 * @returns Autosave.
 */
export function projectHostAutosaveCreate(project: ControllerProject): ProjectAutosave {
  return new ProjectAutosave({
    fileSystem: () => project.fileSystem(),
    capture: () => ({ data: { version: 1, objects: [] } as never, objectCount: 0 }),
    idle: () => undefined,
  });
}

/**
 * Writes an autosave document straight into the mock folder.
 *
 * @param root Project root.
 * @param sourcePath Scene path, or null for untitled.
 * @param savedAt Save time.
 * @returns Autosave path.
 */
export function projectHostAutosavePut(
  root: ProjectMockDirectoryHandle,
  sourcePath: string | null,
  savedAt: number,
): string {
  const path = projectAutosavePath(projectAutosaveKey(sourcePath));
  const data = { version: 1, objects: [{ name: 'Recovered' }, { name: 'Recovered 2' }] };
  const document = {
    format: PROJECT_AUTOSAVE_FORMAT,
    version: 1,
    scene: 'x',
    sourcePath,
    savedAt,
    objectCount: 2,
    data,
  };
  root.put(path, JSON.stringify(document));
  return path;
}
