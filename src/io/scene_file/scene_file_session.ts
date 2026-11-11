import {
  SCENE_FILE_DESCRIPTION,
  SCENE_FILE_EXTENSION,
  SCENE_FILE_LEGACY_EXTENSION,
  sceneFileNameWithExtension,
} from './scene_file_extension.js';

/**
 * Remembers the scene file the user last opened or saved so Save can write
 * straight back to it. Uses File System Access handles when available and falls
 * back to downloads that reuse the remembered filename otherwise.
 */

/** Picker id so the browser remembers the last scene folder across sessions. */
export const SCENE_FILE_PICKER_ID = 'aiworlded-scene';

/**
 * MIME type of level files. A zip inside, but a type no OS maps to extensions
 * of its own, so pickers list only .aiworld instead of adding .zip.
 */
export const SCENE_FILE_MIME = 'application/x-aiworld';

/** Default filename used before any file was opened or saved. */
export const SCENE_FILE_DEFAULT_NAME = `scene.${SCENE_FILE_EXTENSION}`;

/** Minimal writable stream surface used for saving. */
interface SceneFileWritable {
  write(data: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

/** Minimal File System Access file handle surface used by the session. */
export interface SceneFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<SceneFileWritable>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

/** Picker options shared by the open and save pickers. */
interface SceneFilePickerOptions {
  id: string;
  startIn?: SceneFileHandle | 'documents';
  suggestedName?: string;
  types: { description: string; accept: Record<string, string[]> }[];
}

/** Window surface with the optional File System Access pickers. */
export interface SceneFilePickerWindow {
  showSaveFilePicker?: (options: SceneFilePickerOptions) => Promise<SceneFileHandle>;
  showOpenFilePicker?: (options: SceneFilePickerOptions) => Promise<SceneFileHandle[]>;
}

/** A scene file chosen by the user. */
export interface SceneFileOpenResult {
  file: File;
  filename: string;
}

/** Receives the bytes of a save, in order. */
export type SceneFileSink = (chunk: Uint8Array) => Promise<void>;

/** Streams a scene file into a sink. */
export type SceneFileWriter = (sink: SceneFileSink) => Promise<void>;

/** Function that downloads a file under a filename (fallback save path). */
export type SceneFileDownloader = (data: Blob, filename: string) => void;

/** Function that lets the user pick a file without the picker API. */
export type SceneFileFallbackPicker = () => Promise<File | null>;

/** Tracks the current scene file and performs Save, Save As, and Open. */
export class SceneFileSession {
  private currentHandle: SceneFileHandle | null = null;
  private currentFilename: string | null = null;

  /**
   * Creates a session.
   *
   * @param pickerWindow Window providing the optional File System Access API.
   * @param downloader Fallback writer when no save picker exists.
   * @param fallbackPicker Fallback file chooser when no open picker exists.
   */
  constructor(
    private readonly pickerWindow: SceneFilePickerWindow,
    private readonly downloader: SceneFileDownloader,
    private readonly fallbackPicker: SceneFileFallbackPicker,
  ) {}

  /**
   * Returns the remembered filename, or null for an untitled scene.
   *
   * @returns Current filename.
   */
  getCurrentFilename(): string | null {
    return this.currentFilename;
  }

  /**
   * Returns whether Save can write without prompting.
   *
   * @returns True when a writable file handle is remembered.
   */
  hasWritableTarget(): boolean {
    return this.currentHandle !== null;
  }

  /**
   * Remembers a file opened without the picker (the Project panel), so Save
   * writes back to it.
   *
   * @param handle File handle.
   */
  openedFrom(handle: SceneFileHandle): void {
    this.remember(handle, handle.name);
  }

  /** Forgets the current file, e.g. after New or loading from elsewhere. */
  forget(): void {
    this.currentHandle = null;
    this.currentFilename = null;
  }

  /**
   * Saves to the remembered file, prompting when none is known, when it is not
   * an .aiworld file (a level opened from an older .json is saved as
   * "<name>.aiworld"), or when the write fails (for example permission denied
   * or the file was removed).
   *
   * @param data Writes the scene file.
   * @returns Saved filename, or null on cancel or failure.
   */
  async save(data: SceneFileWriter): Promise<string | null> {
    const handle = this.currentHandle;
    const own = handle !== null && sceneFileNameWithExtension(handle.name) === handle.name;
    if (own && (await this.writeToHandle(handle, data))) return handle.name;
    return this.saveAs(data);
  }

  /**
   * Always prompts for a destination, starting in the last used location. The
   * suggested name always ends in .aiworld (a level opened as legacy .json is
   * suggested as "<name>.aiworld").
   *
   * @param data Writes the scene file.
   * @returns Saved filename, or null on cancel or failure.
   */
  async saveAs(data: SceneFileWriter): Promise<string | null> {
    const suggestedName = sceneFileNameWithExtension(this.currentFilename ?? SCENE_FILE_DEFAULT_NAME);
    if (!this.pickerWindow.showSaveFilePicker) return this.saveByDownload(data, suggestedName);
    try {
      const handle = await this.pickerWindow.showSaveFilePicker(this.buildPickerOptions(suggestedName, false));
      if (!(await this.writeToHandle(handle, data))) return null;
      this.remember(handle, handle.name);
      return handle.name;
    } catch {
      return null;
    }
  }

  /**
   * Lets the user pick a scene file, remembering it for later saves.
   *
   * @returns File and name, or null on cancel or failure.
   */
  async open(): Promise<SceneFileOpenResult | null> {
    if (!this.pickerWindow.showOpenFilePicker) return this.openWithFallbackPicker();
    try {
      const [handle] = await this.pickerWindow.showOpenFilePicker(this.buildPickerOptions(undefined, true));
      if (!handle) return null;
      const file = await handle.getFile();
      this.remember(handle, handle.name);
      return { file, filename: handle.name };
    } catch {
      return null;
    }
  }

  /**
   * Reads the remembered file as it is on disk now.
   *
   * @returns File, or null without a remembered handle or when unreadable.
   */
  async currentFile(): Promise<File | null> {
    return (await this.currentHandle?.getFile().catch(() => null)) ?? null;
  }

  /**
   * Downloads the scene under the remembered name when no picker exists.
   *
   * @param data Writes the scene file.
   * @param filename Download filename.
   * @returns Filename, or null on failure.
   */
  private async saveByDownload(data: SceneFileWriter, filename: string): Promise<string | null> {
    try {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      await data(async (chunk) => void chunks.push(new Uint8Array(chunk)));
      this.downloader(new Blob(chunks, { type: SCENE_FILE_MIME }), filename);
      this.currentFilename = filename;
      return filename;
    } catch {
      return null;
    }
  }

  /**
   * Opens a file through the fallback chooser and remembers only its name.
   *
   * @returns File and name, or null on cancel or failure.
   */
  private async openWithFallbackPicker(): Promise<SceneFileOpenResult | null> {
    try {
      const file = await this.fallbackPicker();
      if (!file) return null;
      this.remember(null, file.name);
      return { file, filename: file.name };
    } catch {
      return null;
    }
  }

  /**
   * Streams a scene file into a handle after making sure write permission is
   * granted. The browser writes a swap file that replaces the file on close, so
   * a failed save leaves the old file as it was.
   *
   * @param handle Destination file handle.
   * @param data Writes the scene file.
   * @returns True when the write completed.
   */
  private async writeToHandle(handle: SceneFileHandle, data: SceneFileWriter): Promise<boolean> {
    try {
      if (!(await this.ensureWritePermission(handle))) return false;
      const writable = await handle.createWritable();
      try {
        await data((chunk) => writable.write(new Uint8Array(chunk)));
      } catch (error) {
        await writable.abort?.().catch(() => undefined);
        throw error;
      }
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Queries and, if needed, requests readwrite permission on a handle.
   *
   * @param handle File handle to check.
   * @returns True when writing is allowed.
   */
  private async ensureWritePermission(handle: SceneFileHandle): Promise<boolean> {
    const descriptor = { mode: 'readwrite' as const };
    if (!handle.queryPermission || (await handle.queryPermission(descriptor)) === 'granted') return true;
    if (!handle.requestPermission) return false;
    return (await handle.requestPermission(descriptor)) === 'granted';
  }

  /**
   * Builds picker options that reopen in the last used folder.
   *
   * @param suggestedName Suggested filename for save pickers, if any.
   * @param legacy Whether legacy .json levels are offered too (open).
   * @returns Picker options.
   */
  private buildPickerOptions(suggestedName: string | undefined, legacy: boolean): SceneFilePickerOptions {
    const extensions = [`.${SCENE_FILE_EXTENSION}`, ...(legacy ? [`.${SCENE_FILE_LEGACY_EXTENSION}`] : [])];
    const options: SceneFilePickerOptions = {
      id: SCENE_FILE_PICKER_ID,
      types: [{ description: SCENE_FILE_DESCRIPTION, accept: { [SCENE_FILE_MIME]: extensions } }],
    };
    if (this.currentHandle !== null) options.startIn = this.currentHandle;
    if (suggestedName !== undefined) options.suggestedName = suggestedName;
    return options;
  }

  /**
   * Stores the current file handle and name.
   *
   * @param handle File handle, or null when only the name is known.
   * @param filename File name.
   */
  private remember(handle: SceneFileHandle | null, filename: string): void {
    this.currentHandle = handle;
    this.currentFilename = filename;
  }
}
