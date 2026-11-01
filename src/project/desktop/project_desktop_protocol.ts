import type { ProjectFileSystemEntry } from '@/project/fs/project_file_system.js';

/** Largest file the desktop bridge reads or writes in one request. */
export const PROJECT_DESKTOP_FILE_BYTES_MAXIMUM = 64 * 1024 * 1024;

/** A project folder the desktop user picked. */
export type ProjectDesktopRoot = {
  /** Absolute folder path; only folders the user picked are accepted. */
  root: string;
  /** Folder name. */
  name: string;
};

/** Addresses one path inside a picked folder. */
export type ProjectDesktopPathParams = {
  root: string;
  path: string;
};

/** Lists a folder, reading stats for the compatible file names. */
export type ProjectDesktopListParams = ProjectDesktopPathParams & {
  /** Lower-case extensions whose files need size and time. */
  extensions: string[];
};

/** File contents sent over the bridge. */
export type ProjectDesktopFile = {
  base64: string;
  lastModified: number;
};

/** Writes a file atomically. */
export type ProjectDesktopWriteParams = ProjectDesktopPathParams & {
  base64: string;
};

/** Bun-side requests behind the desktop project bridge. */
export type ProjectDesktopRequests = {
  projectPick: { params: undefined; response: ProjectDesktopRoot | null };
  projectLast: { params: undefined; response: ProjectDesktopRoot | null };
  projectList: { params: ProjectDesktopListParams; response: ProjectFileSystemEntry[] };
  projectRead: { params: ProjectDesktopPathParams; response: ProjectDesktopFile };
  projectWrite: { params: ProjectDesktopWriteParams; response: void };
  projectRemove: { params: ProjectDesktopPathParams; response: void };
};

/** Webview-side bridge to the desktop app's native file access. */
export interface ProjectDesktopBridge {
  pick(): Promise<ProjectDesktopRoot | null>;
  last(): Promise<ProjectDesktopRoot | null>;
  list(params: ProjectDesktopListParams): Promise<ProjectFileSystemEntry[]>;
  read(params: ProjectDesktopPathParams): Promise<ProjectDesktopFile>;
  write(params: ProjectDesktopWriteParams): Promise<void>;
  remove(params: ProjectDesktopPathParams): Promise<void>;
}

/** RPC client surface the webview uses to reach the Bun handlers. */
export interface ProjectDesktopRpcClient {
  request: {
    projectPick: () => Promise<ProjectDesktopRoot | null>;
    projectLast: () => Promise<ProjectDesktopRoot | null>;
    projectList: (params: ProjectDesktopListParams) => Promise<ProjectFileSystemEntry[]>;
    projectRead: (params: ProjectDesktopPathParams) => Promise<ProjectDesktopFile>;
    projectWrite: (params: ProjectDesktopWriteParams) => Promise<void>;
    projectRemove: (params: ProjectDesktopPathParams) => Promise<void>;
  };
}

declare global {
  interface Window {
    aiworldedProjectBridge?: ProjectDesktopBridge;
  }
}

/**
 * Creates the webview bridge over the desktop RPC client.
 *
 * @param rpc RPC client connected to the Bun process.
 * @returns Project bridge.
 */
export function createProjectDesktopBridge(rpc: ProjectDesktopRpcClient): ProjectDesktopBridge {
  return {
    pick: () => rpc.request.projectPick(),
    last: () => rpc.request.projectLast(),
    list: (params) => rpc.request.projectList(params),
    read: (params) => rpc.request.projectRead(params),
    write: (params) => rpc.request.projectWrite(params),
    remove: (params) => rpc.request.projectRemove(params),
  };
}

/**
 * Returns the desktop project bridge when running in the desktop app.
 *
 * @returns Bridge, or null in a browser.
 */
export function projectDesktopBridge(): ProjectDesktopBridge | null {
  return typeof window === 'undefined' ? null : (window.aiworldedProjectBridge ?? null);
}
