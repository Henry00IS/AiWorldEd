/**
 * Browser file system access helpers for save and load operations.
 * Gracefully handles browsers without File System Access API support.
 */

/**
 * Checks whether the File System Access API is available.
 * @returns True if showSaveFilePicker or showOpenFilePicker exist.
 */
function isFileSystemAccessAvailable(): boolean {
  return typeof window !== 'undefined'
    && ('showSaveFilePicker' in window || 'showOpenFilePicker' in window);
}

/**
 * Creates a Blob from a text string with the given MIME type.
 * @param content The text content.
 * @param mimeType The MIME type for the blob.
 * @returns The created Blob.
 */
function createTextBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: mimeType });
}

/**
 * Creates a Blob from an ArrayBuffer.
 * @param buffer The binary buffer.
 * @param mimeType The MIME type for the blob.
 * @returns The created Blob.
 */
function createBinaryBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

/**
 * Triggers a download by creating and clicking a temporary anchor element.
 * @param blob The blob to download.
 * @param filename The suggested filename for the download.
 */
function downloadBlob(blob: Blob, filename: string): void {
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
 * Reads a File object as text using FileReader.
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
 * Manages browser file save and load dialog operations.
 * Falls back to download-based saving when File System Access API is unavailable.
 */
export class FileDialogManager {
  /**
   * Opens a save dialog for JSON data and writes the file.
   * Falls back to download anchor when API is unavailable.
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
   * Opens a file dialog for JSON loading and reads the file.
   * Falls back to legacy file input when API is unavailable.
   * @returns A promise resolving to the JSON string, or null on failure.
   */
  async loadJSON(): Promise<string | null> {
    if (!isFileSystemAccessAvailable()) {
      return this.loadJSONFallback();
    }
    return this.loadJSONWithAPI();
  }

  /**
   * Opens a save dialog for binary data and writes the file.
   * Falls back to download anchor when API is unavailable.
   * @param buffer The ArrayBuffer to save.
   * @param suggestedName The suggested filename for the save dialog.
   * @returns A promise resolving to the filename, or null on failure.
   */
  async saveBinary(buffer: ArrayBuffer, suggestedName: string): Promise<string | null> {
    if (!isFileSystemAccessAvailable()) {
      return this.saveBinaryFallback(buffer, suggestedName);
    }
    return this.saveBinaryWithAPI(buffer, suggestedName);
  }

  /**
   * Saves JSON using the File System Access API.
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
        types: [{
          description: 'Scene JSON',
          accept: { 'application/json': ['.json'] }
        }]
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
   * @returns The JSON string or null on failure.
   */
  private async loadJSONWithAPI(): Promise<string | null> {
    if (!('showOpenFilePicker' in window)) {
      return null;
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'Scene JSON',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const file = await handle.getFile();
      return await readFileAsText(file);
    } catch {
      return null;
    }
  }

  /**
   * Saves binary data using the File System Access API.
   * @param buffer The ArrayBuffer to save.
   * @param suggestedName The suggested filename.
   * @returns The filename or null on failure.
   */
  private async saveBinaryWithAPI(
    buffer: ArrayBuffer,
    suggestedName: string
  ): Promise<string | null> {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'GLB File',
          accept: { 'model/gltf-binary': ['.glb'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
      return suggestedName;
    } catch {
      return null;
    }
  }

  /**
   * Saves JSON using fallback download mechanism.
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
   * @returns The JSON string or null on failure.
   */
  private loadJSONFallback(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = () => this.handleFallbackFileSelect(input, resolve);
        input.click();
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Processes the file selected through fallback file input.
   * @param input The file input element.
   * @param resolve The promise resolve function.
   */
  private handleFallbackFileSelect(
    input: HTMLInputElement,
    resolve: (result: string | null) => void
  ): void {
    const file = input.files?.[0];
    if (file) {
      readFileAsText(file)
        .then((text) => resolve(text))
        .catch(() => resolve(null));
    } else {
      resolve(null);
    }
  }

  /**
   * Saves binary data using fallback download mechanism.
   * @param buffer The ArrayBuffer to save.
   * @param suggestedName The suggested filename.
   * @returns The filename or null on failure.
   */
  private saveBinaryFallback(buffer: ArrayBuffer, suggestedName: string): string | null {
    try {
      const blob = createBinaryBlob(buffer, 'model/gltf-binary');
      downloadBlob(blob, suggestedName);
      return suggestedName;
    } catch {
      return null;
    }
  }
}
