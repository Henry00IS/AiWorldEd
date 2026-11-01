import { projectDesktopBridge, type ProjectDesktopBridge } from '@/project/desktop/project_desktop_protocol.js';
import { ProjectFileSystemDesktop } from '@/project/desktop/project_file_system_desktop.js';
import { WebkitDirectoryInputAccess } from '@/texture/library/local_directory_access.js';
import type { ProjectFileSystem } from './project_file_system.js';
import { ProjectFileSystemFileList } from './project_file_system_file_list.js';
import { ProjectFileSystemHandle } from './project_file_system_handle.js';

/** Shown when the browser can only read a copy of the folder. */
export const PROJECT_PICKER_READ_ONLY_NOTICE =
  'This browser can only read a copy of the folder: no live updates, autosave or snapshots on disk. Use Chrome, Edge or the desktop app for the full project folder.';

/** A picked project folder. */
export interface ProjectPick {
  fileSystem: ProjectFileSystem;
  /** Handle to remember for the next visit, when the browser has one. */
  handle: FileSystemDirectoryHandle | null;
  /** Shown to the user after opening (limited support), or null. */
  notice: string | null;
}

/** Lets the user pick a project folder. */
export interface ProjectPicker {
  /**
   * Opens the folder picker (call from a user gesture).
   *
   * @returns Pick, or null when cancelled.
   */
  pick(): Promise<ProjectPick | null>;
}

/**
 * Picks a project folder with the best access available: the desktop app's
 * native files, the File System Access API (Chrome, Edge), or a read-only
 * folder input (Firefox, Safari).
 */
export class ProjectPickerBrowser implements ProjectPicker {
  private readonly desktop: ProjectDesktopBridge | null;

  /**
   * Creates the picker.
   *
   * @param desktop Desktop bridge, or null in a browser.
   */
  constructor(desktop: ProjectDesktopBridge | null = projectDesktopBridge()) {
    this.desktop = desktop;
  }

  /**
   * Opens the folder picker.
   *
   * @returns Pick, or null when cancelled.
   */
  async pick(): Promise<ProjectPick | null> {
    if (this.desktop !== null) return this.pickDesktop(this.desktop);
    if (projectPickerHandleSupported()) return this.pickHandle();
    return this.pickFileList();
  }

  /**
   * Picks through the desktop app's native dialog.
   *
   * @param desktop Desktop bridge.
   * @returns Pick, or null when cancelled.
   */
  private async pickDesktop(desktop: ProjectDesktopBridge): Promise<ProjectPick | null> {
    const root = await desktop.pick();
    return root === null
      ? null
      : { fileSystem: new ProjectFileSystemDesktop(desktop, root), handle: null, notice: null };
  }

  /**
   * Picks with showDirectoryPicker in read-write mode.
   *
   * @returns Pick, or null when cancelled.
   */
  private async pickHandle(): Promise<ProjectPick | null> {
    try {
      const picker = window.showDirectoryPicker;
      if (picker === undefined) return null;
      const handle = await picker.call(window, { id: 'aiworlded-project', mode: 'readwrite' });
      return { fileSystem: new ProjectFileSystemHandle(handle), handle, notice: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
  }

  /**
   * Picks with a read-only folder input.
   *
   * @returns Pick, or null when cancelled.
   */
  private async pickFileList(): Promise<ProjectPick | null> {
    const listing = await new WebkitDirectoryInputAccess().pickDirectoryAndListFiles();
    if (listing === null) return null;
    return {
      fileSystem: new ProjectFileSystemFileList(listing),
      handle: null,
      notice: PROJECT_PICKER_READ_ONLY_NOTICE,
    };
  }
}

/**
 * Tells whether the browser has showDirectoryPicker.
 *
 * @returns True in Chromium browsers.
 */
export function projectPickerHandleSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}
