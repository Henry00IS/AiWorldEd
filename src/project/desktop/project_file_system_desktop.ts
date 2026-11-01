import type {
  ProjectFileSystem,
  ProjectFileSystemEntry,
  ProjectFileSystemWatchMode,
} from '@/project/fs/project_file_system.js';
import { projectFileTextureMime } from '@/project/fs/project_file_kind.js';
import { projectPathName, projectPathSegments } from '@/project/fs/project_path.js';
import type { ProjectDesktopBridge, ProjectDesktopRoot } from './project_desktop_protocol.js';

/** Extensions whose files the scan needs stats for. */
const PROJECT_FILE_SYSTEM_DESKTOP_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'json', 'vmf', 'obj'];

/**
 * Project folder reached through the desktop app's native file access; the Bun
 * side only accepts folders the user picked and paths inside them.
 */
export class ProjectFileSystemDesktop implements ProjectFileSystem {
  readonly name: string;
  readonly writable = true;
  readonly root: string;
  private readonly bridge: ProjectDesktopBridge;

  /**
   * Wraps a picked desktop folder.
   *
   * @param bridge Desktop project bridge.
   * @param root Picked folder.
   */
  constructor(bridge: ProjectDesktopBridge, root: ProjectDesktopRoot) {
    this.bridge = bridge;
    this.root = root.root;
    this.name = root.name;
  }

  /**
   * Returns "poll": the desktop bridge compares stats.
   *
   * @returns Watch mode.
   */
  watchMode(): ProjectFileSystemWatchMode {
    return 'poll';
  }

  /**
   * Returns "granted": the user picked the folder in the native dialog.
   *
   * @returns Permission state.
   */
  async permissionQuery(): Promise<PermissionState> {
    return 'granted';
  }

  /**
   * Returns true: the user picked the folder in the native dialog.
   *
   * @returns True.
   */
  async permissionRequest(): Promise<boolean> {
    return true;
  }

  /**
   * Lists a folder's children.
   *
   * @param path Folder path.
   * @param statWanted Tells which names need stats; the extension list
   *   approximates it.
   * @returns Children.
   */
  async directoryList(path: string, statWanted: (name: string) => boolean): Promise<ProjectFileSystemEntry[]> {
    if (path !== '') projectPathSegments(path);
    const entries = await this.bridge.list({
      root: this.root,
      path,
      extensions: PROJECT_FILE_SYSTEM_DESKTOP_EXTENSIONS,
    });
    return entries.map((entry) =>
      entry.kind === 'file' && !statWanted(entry.name) ? { name: entry.name, kind: 'file' } : entry,
    );
  }

  /**
   * Reads a file.
   *
   * @param path File path.
   * @returns File contents.
   */
  async fileRead(path: string): Promise<File> {
    projectPathSegments(path);
    const read = await this.bridge.read({ root: this.root, path });
    const name = projectPathName(path);
    return new File([projectDesktopBase64Decode(read.base64)], name, {
      type: projectFileTextureMime(name) === 'application/octet-stream' ? '' : projectFileTextureMime(name),
      lastModified: read.lastModified,
    });
  }

  /**
   * Replaces a file atomically.
   *
   * @param path File path.
   * @param data Contents.
   */
  async fileWrite(path: string, data: string | Blob): Promise<void> {
    projectPathSegments(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
    await this.bridge.write({ root: this.root, path, base64: projectDesktopBase64Encode(bytes) });
  }

  /**
   * Removes a file.
   *
   * @param path File path.
   */
  async fileRemove(path: string): Promise<void> {
    projectPathSegments(path);
    await this.bridge.remove({ root: this.root, path });
  }

  /**
   * Returns null: changes are found by polling.
   *
   * @returns Null.
   */
  async observe(): Promise<null> {
    return null;
  }
}

/**
 * Encodes bytes as base64 in chunks (no call-stack limits for big files).
 *
 * @param bytes Bytes.
 * @returns Base64 text.
 */
export function projectDesktopBase64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/**
 * Decodes base64 text.
 *
 * @param base64 Base64 text.
 * @returns Bytes.
 */
export function projectDesktopBase64Decode(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
