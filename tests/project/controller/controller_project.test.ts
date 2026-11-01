import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControllerProject, type ControllerProjectEvent } from '@/project/controller/controller_project.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import type { ProjectPicker } from '@/project/fs/project_picker.js';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { PROJECT_MOCK_PNG, ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

/** Store kept in memory. */
class ControllerProjectMemoryStore extends StoreProjectHandle {
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

/**
 * Builds a controller over a mock project.
 *
 * @param gate Texture source gate.
 * @returns Fixture parts.
 */
function controllerCreate(gate: () => string | null = () => null) {
  mockObjectUrlApis();
  const root = new ProjectMockDirectoryHandle('game');
  root.put('textures/brick.png', PROJECT_MOCK_PNG);
  const picker: ProjectPicker = {
    pick: async () => ({
      fileSystem: new ProjectFileSystemHandle(root.asHandle()),
      handle: root.asHandle(),
      notice: null,
    }),
  };
  const store = new ControllerProjectMemoryStore(null);
  const library = new TextureLibrary();
  const controller = new ControllerProject({ library, picker, store, desktop: null, gate });
  const events: ControllerProjectEvent[] = [];
  controller.listenerAdd((event) => events.push(event));
  return { root, store, library, controller, events };
}

describe('ControllerProject', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a picked folder, remembers it and loads its textures', async () => {
    const { root, store, library, controller, events } = controllerCreate();
    expect(await controller.open()).toBe(true);
    expect(store.handle).toBe(root.asHandle());
    expect(controller.fileSystem()?.name).toBe('game');
    expect(library.getEntryById('textures/brick.png')).not.toBeNull();
    expect(controller.snapshot().files.has('textures/brick.png')).toBe(true);
    expect(events.map((event) => event.type)).toContain('opened');
    controller.dispose();
  });

  it('reopens a remembered folder at once when access is granted', async () => {
    const { root, store, controller } = controllerCreate();
    store.handle = root.asHandle();
    await controller.restore();
    expect(controller.fileSystem()?.name).toBe('game');
    controller.dispose();
  });

  it('waits for a click when the browser asks for permission again', async () => {
    const { root, store, controller, events } = controllerCreate();
    store.handle = root.asHandle();
    root.permission = 'prompt';
    await controller.restore();
    expect(controller.fileSystem()).toBeNull();
    expect(controller.pendingName()).toBe('game');
    expect(events.some((event) => event.type === 'status' && event.message.includes('reopen'))).toBe(true);
    expect(await controller.reopen()).toBe(true);
    expect(controller.fileSystem()?.name).toBe('game');
    controller.dispose();
  });

  it('stays closed when permission is refused', async () => {
    const { root, store, controller } = controllerCreate();
    store.handle = root.asHandle();
    root.permission = 'prompt';
    root.permissionAfterRequest = 'denied';
    await controller.restore();
    expect(await controller.reopen()).toBe(false);
    expect(controller.fileSystem()).toBeNull();
    controller.dispose();
  });

  it('closes, forgets the folder and removes its textures', async () => {
    const { store, library, controller, events } = controllerCreate();
    await controller.open();
    await controller.close();
    expect(store.handle).toBeNull();
    expect(controller.fileSystem()).toBeNull();
    expect(library.getEntryById('textures/brick.png')).toBeNull();
    expect(events.at(-1)?.type).toBe('closed');
    controller.dispose();
  });

  it('refuses to open while the room owner provides textures', async () => {
    const { controller, events } = controllerCreate(() => 'Textures come from the room owner');
    expect(await controller.open()).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'status', message: 'Textures come from the room owner' });
    controller.dispose();
  });
});
