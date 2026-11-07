/**
 * Remembers the scene file the user last opened or saved so Save can write
 * straight back to it. Uses File System Access handles when available and falls
 * back to downloads that reuse the remembered filename otherwise.
 */

/** Picker id so the browser remembers the last scene folder across sessions. */
export const SCENE_FILE_PICKER_ID = 'aiworlded-scene';

/** Default filename used before any file was opened or saved. */
export const SCENE_FILE_DEFAULT_NAME = 'scene.json';

/** Minimal writable stream surface used for saving. */
interface SceneFileWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
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

/** Text and name of a scene file chosen by the user. */
export interface SceneFileOpenResult {
  text: string;
  filename: string;
}

/** Function that downloads text under a filename (fallback save path). */
export type SceneFileDownloader = (data: string, filename: string) => void;

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

  /** Forgets the current file, e.g. after New or loading from elsewhere. */
  forget(): void {
    this.currentHandle = null;
    this.currentFilename = null;
  }

  /**
   * Saves to the remembered file, prompting only when none is known or the
   * write fails (for example permission denied or the file was removed).
   *
   * @param data Scene JSON text.
   * @returns Saved filename, or null on cancel or failure.
   */
  async save(data: string): Promise<string | null> {
    if (this.currentHandle !== null && (await this.writeToHandle(this.currentHandle, data))) {
      return this.currentHandle.name;
    }
    return this.saveAs(data);
  }

  /**
   * Always prompts for a destination, starting in the last used location.
   *
   * @param data Scene JSON text.
   * @returns Saved filename, or null on cancel or failure.
   */
  async saveAs(data: string): Promise<string | null> {
    const suggestedName = this.currentFilename ?? SCENE_FILE_DEFAULT_NAME;
    if (!this.pickerWindow.showSaveFilePicker) return this.saveByDownload(data, suggestedName);
    try {
      const handle = await this.pickerWindow.showSaveFilePicker(this.buildPickerOptions(suggestedName));
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
   * @returns File text and name, or null on cancel or failure.
   */
  async open(): Promise<SceneFileOpenResult | null> {
    if (!this.pickerWindow.showOpenFilePicker) return this.openWithFallbackPicker();
    try {
      const [handle] = await this.pickerWindow.showOpenFilePicker(this.buildPickerOptions(undefined));
      if (!handle) return null;
      const text = await (await handle.getFile()).text();
      this.remember(handle, handle.name);
      return { text, filename: handle.name };
    } catch {
      return null;
    }
  }

  /**
   * Downloads the scene under the remembered name when no picker exists.
   *
   * @param data Scene JSON text.
   * @param filename Download filename.
   * @returns Filename, or null on failure.
   */
  private saveByDownload(data: string, filename: string): string | null {
    try {
      this.downloader(data, filename);
      this.currentFilename = filename;
      return filename;
    } catch {
      return null;
    }
  }

  /**
   * Opens a file through the fallback chooser and remembers only its name.
   *
   * @returns File text and name, or null on cancel or failure.
   */
  private async openWithFallbackPicker(): Promise<SceneFileOpenResult | null> {
    try {
      const file = await this.fallbackPicker();
      if (!file) return null;
      const text = await file.text();
      this.remember(null, file.name);
      return { text, filename: file.name };
    } catch {
      return null;
    }
  }

  /**
   * Writes text to a handle after making sure write permission is granted.
   *
   * @param handle Destination file handle.
   * @param data Text to write.
   * @returns True when the write completed.
   */
  private async writeToHandle(handle: SceneFileHandle, data: string): Promise<boolean> {
    try {
      if (!(await this.ensureWritePermission(handle))) return false;
      const writable = await handle.createWritable();
      await writable.write(data);
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
   * @returns Picker options.
   */
  private buildPickerOptions(suggestedName: string | undefined): SceneFilePickerOptions {
    const options: SceneFilePickerOptions = {
      id: SCENE_FILE_PICKER_ID,
      types: [{ description: 'Scene JSON', accept: { 'application/json': ['.json'] } }],
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
