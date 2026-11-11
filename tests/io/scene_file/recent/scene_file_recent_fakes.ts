import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';
import type { SceneFileRecentEntry } from '@/io/scene_file/recent/scene_file_recent_list.js';
import type { SceneFileRecentStorage } from '@/io/scene_file/recent/scene_file_recent_store.js';

/** A file handle stand-in whose permission and existence tests can change. */
export interface SceneFileRecentFakeHandle extends SceneFileHandle {
  readonly kind: 'file';
  permission: PermissionState;
  /** Answer of the next permission request. */
  answer: PermissionState;
  exists: boolean;
  requests: number;
}

/**
 * Creates a file handle stand-in.
 *
 * @param name File name.
 * @param permission Read permission the browser reports.
 * @returns Handle.
 */
export function sceneFileRecentFakeHandle(
  name: string,
  permission: PermissionState = 'granted',
): SceneFileRecentFakeHandle {
  const handle: SceneFileRecentFakeHandle = {
    kind: 'file',
    name,
    permission,
    answer: 'granted',
    exists: true,
    requests: 0,
    getFile: async () => {
      if (handle.permission !== 'granted') throw new DOMException('no access', 'NotAllowedError');
      if (!handle.exists) throw new DOMException('deleted', 'NotFoundError');
      return new File(['{}'], name);
    },
    createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
    queryPermission: async () => handle.permission,
    requestPermission: async () => {
      handle.requests += 1;
      handle.permission = handle.answer;
      return handle.permission;
    },
    isSameEntry: async (other) => other === handle,
  };
  return handle;
}

/** Storage stand-in that keeps the list in memory. */
export class SceneFileRecentFakeStorage implements SceneFileRecentStorage {
  saved: SceneFileRecentEntry[] = [];
  saves = 0;

  /**
   * Creates the storage.
   *
   * @param initial Stored list at the start.
   */
  constructor(initial: SceneFileRecentEntry[] = []) {
    this.saved = initial;
  }

  /** @returns Stored list. */
  async load(): Promise<SceneFileRecentEntry[]> {
    return [...this.saved];
  }

  /** @param entries List to store. */
  async save(entries: readonly SceneFileRecentEntry[]): Promise<void> {
    this.saved = [...entries];
    this.saves += 1;
  }
}
