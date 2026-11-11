/**
 * Browser file system access helpers for save and load operations. Gracefully
 * handles browsers without File System Access API support.
 */

/**
 * Checks whether the File System Access API is available.
 *
 * @returns True if showSaveFilePicker or showOpenFilePicker exist.
 */
function isFileSystemAccessAvailable(): boolean {
  return typeof window !== 'undefined' && ('showSaveFilePicker' in window || 'showOpenFilePicker' in window);
}

/**
 * Creates a Blob from a text string with the given MIME type.
 *
 * @param content The text content.
 * @param mimeType The MIME type for the blob.
 * @returns The created Blob.
 */
function createTextBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: mimeType });
}

/**
 * Triggers a download by creating and clicking a temporary anchor element.
 *
 * @param blob The blob to download.
 * @param filename The suggested filename for the download.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Downloads text content under a filename via a temporary anchor.
 *
 * @param data Text content.
 * @param filename Download filename.
 * @param mimeType MIME type for the blob.
 */
export function downloadTextFile(data: string, filename: string, mimeType: string): void {
  downloadBlob(createTextBlob(data, mimeType), filename);
}

/**
 * MIME type for picker filters that should list exactly their extensions: no OS
 * maps it to extensions of its own, unlike text/plain or
 * application/octet-stream.
 */
export const FILE_PICKER_EXTENSIONS_ONLY_MIME = 'application/x-aiworlded-file';

/**
 * Builds a File System Access accept map that lists only these extensions.
 *
 * @param extensions Extensions including the leading dot.
 * @returns Accept map for showOpenFilePicker or showSaveFilePicker.
 */
export function filePickerAccept(extensions: string[]): Record<string, string[]> {
  return { [FILE_PICKER_EXTENSIONS_ONLY_MIME]: extensions };
}

/**
 * Lets the user choose one file through a hidden file input element.
 *
 * @param accept Accept attribute for the input.
 * @returns Chosen file, or null when nothing was chosen.
 */
export function pickFileWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Reads a File object as text using FileReader.
 *
 * @param file The file to read.
 * @returns A promise resolving to the file text content.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Manages browser file save and load dialog operations. Falls back to
 * download-based saving when File System Access API is unavailable.
 */
export class ManagerFileDialog {
  /**
   * Opens a save dialog for JSON data and writes the file. Falls back to
   * download anchor when API is unavailable.
   *
   * @param data The JSON string to save.
   * @param suggestedName The suggested filename for the save dialog.
   * @returns A promise resolving to the filename, or null on failure.
   */
  async saveJSON(data: string, suggestedName: string): Promise<string | null> {
    if (!isFileSystemAccessAvailable()) {
      return this.saveJSONFallback(data, suggestedName);
    }
    return this.saveJSONWithAPI(data, suggestedName);
  }

  /**
   * Opens a file dialog for JSON loading and reads the file. Falls back to
   * legacy file input when API is unavailable.
   *
   * @returns A promise resolving to the JSON string, or null on failure.
   */
  async loadJSON(): Promise<string | null> {
    if (!isFileSystemAccessAvailable()) {
      return this.loadJSONFallback();
    }
    return this.loadJSONWithAPI();
  }

  /**
   * Opens a file dialog for a text file and returns contents plus filename.
   *
   * @param accept Comma-separated accept string (e.g. ".vmf,text/plain").
   * @param description Human-readable type label for the picker.
   * @param extensions Extension list for the File System Access API (e.g.
   *   [".vmf"]).
   * @returns Loaded text and filename, or null when cancelled/failed.
   */
  async loadTextFile(
    accept: string,
    description: string,
    extensions: string[],
  ): Promise<{ text: string; filename: string } | null> {
    const file = await this.openFilePick(accept, description, filePickerAccept(extensions));
    if (file === null) return null;
    const text = await readFileAsText(file).catch(() => null);
    return text === null ? null : { text, filename: file.name || 'file' };
  }

  /**
   * Opens a file dialog for a binary file and returns its bytes plus filename.
   *
   * @param accept Comma-separated accept string (e.g. ".glb,.gltf").
   * @param description Human-readable type label for the picker.
   * @param accepted MIME type to extension list map for the File System Access
   *   API.
   * @returns Loaded bytes and filename, or null when cancelled/failed.
   */
  async loadBinaryFile(
    accept: string,
    description: string,
    accepted: Record<string, string[]>,
  ): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
    const file = await this.openFilePick(accept, description, accepted);
    if (file === null) return null;
    const bytes = await file.arrayBuffer().catch(() => null);
    return bytes === null ? null : { bytes, filename: file.name || 'file' };
  }

  /**
   * Lets the user pick one file with the File System Access API, or a file
   * input where the API is unavailable.
   *
   * @param accept Accept attribute for the fallback input.
   * @param description Type description for the picker.
   * @param accepted MIME type to extension list map for the picker.
   * @returns Chosen file, or null.
   */
  private openFilePick(accept: string, description: string, accepted: Record<string, string[]>): Promise<File | null> {
    if (!isFileSystemAccessAvailable() || !('showOpenFilePicker' in window)) return pickFileWithInput(accept);
    return this.openFilePickWithAPI(description, accepted);
  }

  /**
   * Opens a save dialog for plain text content with a custom extension filter.
   * Falls back to a download anchor when the File System Access API is
   * unavailable.
   *
   * @param data Text file contents.
   * @param suggestedName Suggested download filename.
   * @param description File type description for the picker.
   * @param mimeType MIME type for the blob and accept map.
   * @param extensions Extension list including the leading dot.
   * @returns Saved filename, or null on cancel or failure.
   */
  async saveText(
    data: string,
    suggestedName: string,
    description: string,
    mimeType: string,
    extensions: string[],
  ): Promise<string | null> {
    if (!isFileSystemAccessAvailable()) {
      return this.saveTextFallback(data, suggestedName, mimeType);
    }
    return this.saveTextWithAPI(data, suggestedName, description, mimeType, extensions);
  }

  /**
   * Saves JSON using the File System Access API.
   *
   * @param data The JSON string to save.
   * @param suggestedName The suggested filename.
   * @returns The filename or null on failure.
   */
  private async saveJSONWithAPI(data: string, suggestedName: string): Promise<string | null> {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: 'Scene JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return suggestedName;
    } catch {
      return null;
    }
  }

  /**
   * Loads JSON using the File System Access API.
   *
   * @returns The JSON string or null on failure.
   */
  private async loadJSONWithAPI(): Promise<string | null> {
    if (!('showOpenFilePicker' in window)) {
      return null;
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Scene JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const file = await handle.getFile();
      return await readFileAsText(file);
    } catch {
      return null;
    }
  }

  /**
   * Saves JSON using fallback download mechanism.
   *
   * @param data The JSON string to save.
   * @param suggestedName The suggested filename.
   * @returns The filename or null on failure.
   */
  private saveJSONFallback(data: string, suggestedName: string): string | null {
    try {
      const blob = createTextBlob(data, 'application/json');
      downloadBlob(blob, suggestedName);
      return suggestedName;
    } catch {
      return null;
    }
  }

  /**
   * Loads JSON using fallback file input mechanism.
   *
   * @returns The JSON string or null on failure.
   */
  private loadJSONFallback(): Promise<string | null> {
    return pickFileWithInput('.json').then((file) => (file === null ? null : readFileAsText(file).catch(() => null)));
  }

  /**
   * Picks one file using the File System Access API.
   *
   * @param description Type description for the picker.
   * @param accepted MIME type to extension list map.
   * @returns Chosen file, or null when cancelled.
   */
  private async openFilePickWithAPI(description: string, accepted: Record<string, string[]>): Promise<File | null> {
    try {
      const [handle] = await (window as any).showOpenFilePicker({ types: [{ description, accept: accepted }] });
      return (await handle.getFile()) as File;
    } catch {
      return null;
    }
  }

  /**
   * Saves text using the File System Access API with a custom accept filter.
   *
   * @param data Text content.
   * @param suggestedName Suggested filename.
   * @param description Picker type description.
   * @param mimeType MIME type for accept.
   * @param extensions Extension list including the leading dot.
   * @returns Filename or null on failure.
   */
  private async saveTextWithAPI(
    data: string,
    suggestedName: string,
    description: string,
    mimeType: string,
    extensions: string[],
  ): Promise<string | null> {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description,
            accept: { [mimeType]: extensions },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return suggestedName;
    } catch {
      return null;
    }
  }

  /**
   * Saves text using the fallback download mechanism.
   *
   * @param data Text content.
   * @param suggestedName Suggested filename.
   * @param mimeType MIME type for the blob.
   * @returns Filename or null on failure.
   */
  private saveTextFallback(data: string, suggestedName: string, mimeType: string): string | null {
    try {
      const blob = createTextBlob(data, mimeType);
      downloadBlob(blob, suggestedName);
      return suggestedName;
    } catch {
      return null;
    }
  }

  /**
   * Asks for the folder a model export is saved into.
   *
   * @returns Folder handle, or null when cancelled or without a folder picker.
   */
  async exportFolderPick(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.canPickFolder()) return null;
    try {
      // The id lets the browser start where the last model export went.
      const options = { id: 'aiworlded-model-export', mode: 'readwrite' };
      return (await (window as any).showDirectoryPicker(options)) as FileSystemDirectoryHandle;
    } catch {
      return null;
    }
  }

  /**
   * Returns whether showDirectoryPicker is available.
   *
   * @returns True when a folder can be chosen for a model export.
   */
  canPickFolder(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }
}
