/**
 * Browser file system access helpers for save and load operations. Gracefully
 * handles browsers without File System Access API support.
 */

import type { ObjExportPackage } from './obj_export_types.js';
import type { FbxExportPackage } from './fbx_export_types.js';

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
 * Creates a Blob from an ArrayBuffer.
 *
 * @param buffer The binary buffer.
 * @param mimeType The MIME type for the blob.
 * @returns The created Blob.
 */
function createBinaryBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

/**
 * Triggers a download by creating and clicking a temporary anchor element.
 *
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
export class FileDialogManager {
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
    if (!isFileSystemAccessAvailable()) {
      return this.loadTextFileFallback(accept);
    }
    return this.loadTextFileWithAPI(description, extensions);
  }

  /**
   * Opens a save dialog for binary data and writes the file. Falls back to
   * download anchor when API is unavailable.
   *
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
   * Saves a Wavefront package (.obj, .mtl, and map images) to one folder when
   * the directory picker is available, otherwise downloads each file. User
   * cancel on the folder dialog returns null and does not fall back to
   * Downloads.
   *
   * @param exportPackage OBJ, MTL, and texture files to write.
   * @returns Primary .obj file name on success, or null when cancelled/failed.
   */
  async saveWavefrontPackage(exportPackage: ObjExportPackage): Promise<string | null> {
    if (this.canPickDirectory()) {
      return this.saveWavefrontPackageToDirectory(exportPackage);
    }
    return this.saveWavefrontPackageAsDownloads(exportPackage);
  }

  /**
   * Saves an FBX package (.fbx plus map images) to one folder when the
   * directory picker is available, otherwise downloads each file. User cancel
   * on the folder dialog returns null and does not fall back to Downloads.
   *
   * @param exportPackage FBX text and texture files to write.
   * @returns Primary .fbx file name on success, or null when cancelled/failed.
   */
  async saveFbxPackage(exportPackage: FbxExportPackage): Promise<string | null> {
    if (this.canPickDirectory()) {
      return this.saveFbxPackageToDirectory(exportPackage);
    }
    return this.saveFbxPackageAsDownloads(exportPackage);
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
   * Saves binary data using the File System Access API.
   *
   * @param buffer The ArrayBuffer to save.
   * @param suggestedName The suggested filename.
   * @returns The filename or null on failure.
   */
  private async saveBinaryWithAPI(buffer: ArrayBuffer, suggestedName: string): Promise<string | null> {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: 'GLB File',
            accept: { 'model/gltf-binary': ['.glb'] },
          },
        ],
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
    return this.loadTextFileFallback('.json').then((result) => (result ? result.text : null));
  }

  /**
   * Loads a text file using the File System Access API.
   *
   * @param description Type description for the picker.
   * @param extensions File extensions including the dot.
   * @returns Text and filename, or null.
   */
  private async loadTextFileWithAPI(
    description: string,
    extensions: string[],
  ): Promise<{ text: string; filename: string } | null> {
    if (!('showOpenFilePicker' in window)) {
      return null;
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description,
            accept: { 'text/plain': extensions },
          },
        ],
      });
      const file = await handle.getFile();
      const text = await readFileAsText(file);
      return { text, filename: file.name || handle.name || 'file' };
    } catch {
      return null;
    }
  }

  /**
   * Loads a text file using a legacy file input element.
   *
   * @param accept Accept attribute for the input.
   * @returns Text and filename, or null.
   */
  private loadTextFileFallback(accept: string): Promise<{ text: string; filename: string } | null> {
    return new Promise((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = () => this.handleFallbackTextFileSelect(input, resolve);
        input.click();
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Processes a text file chosen through the fallback input.
   *
   * @param input The file input element.
   * @param resolve Promise resolve callback.
   */
  private handleFallbackTextFileSelect(
    input: HTMLInputElement,
    resolve: (result: { text: string; filename: string } | null) => void,
  ): void {
    const file = input.files?.[0];
    if (!file) {
      resolve(null);
      return;
    }
    readFileAsText(file)
      .then((text) => resolve({ text, filename: file.name }))
      .catch(() => resolve(null));
  }

  /**
   * Saves binary data using fallback download mechanism.
   *
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
   * Returns whether showDirectoryPicker is available.
   *
   * @returns True when a directory can be chosen for multi-file export.
   */
  private canPickDirectory(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * Writes the Wavefront package into a user-chosen directory. Cancel or
   * dismissal of the picker returns null without writing anything.
   *
   * @param exportPackage Package files.
   * @returns Primary .obj file name on success, or null on cancel/error.
   */
  private async saveWavefrontPackageToDirectory(exportPackage: ObjExportPackage): Promise<string | null> {
    let directory: any;
    try {
      directory = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    } catch (error) {
      // AbortError is the standard result when the user presses Cancel.
      return null;
    }
    try {
      await this.writeTextToDirectory(directory, exportPackage.objFileName, exportPackage.objText);
      await this.writeTextToDirectory(directory, exportPackage.mtlFileName, exportPackage.mtlText);
      for (const texture of exportPackage.textures) {
        await this.writeBlobToDirectory(directory, texture.fileName, texture.blob);
      }
      return exportPackage.objFileName;
    } catch {
      return null;
    }
  }

  /**
   * Downloads each package file via temporary anchor elements.
   *
   * @param exportPackage Package files.
   * @returns Primary .obj file name, or null on failure.
   */
  private saveWavefrontPackageAsDownloads(exportPackage: ObjExportPackage): string | null {
    try {
      downloadBlob(createTextBlob(exportPackage.objText, 'text/plain'), exportPackage.objFileName);
      downloadBlob(createTextBlob(exportPackage.mtlText, 'text/plain'), exportPackage.mtlFileName);
      exportPackage.textures.forEach((texture) => {
        downloadBlob(texture.blob, texture.fileName);
      });
      return exportPackage.objFileName;
    } catch {
      return null;
    }
  }

  /**
   * Saves FBX package files into a user-picked directory.
   *
   * @param exportPackage Package files.
   * @returns Primary .fbx file name on success, or null on cancel/error.
   */
  private async saveFbxPackageToDirectory(exportPackage: FbxExportPackage): Promise<string | null> {
    let directory: any;
    try {
      directory = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    } catch {
      return null;
    }
    try {
      await this.writeTextToDirectory(directory, exportPackage.fbxFileName, exportPackage.fbxText);
      for (const texture of exportPackage.textures) {
        await this.writeBlobToDirectory(directory, texture.fileName, texture.blob);
      }
      return exportPackage.fbxFileName;
    } catch {
      return null;
    }
  }

  /**
   * Downloads each FBX package file via temporary anchor elements.
   *
   * @param exportPackage Package files.
   * @returns Primary .fbx file name, or null on failure.
   */
  private saveFbxPackageAsDownloads(exportPackage: FbxExportPackage): string | null {
    try {
      downloadBlob(createTextBlob(exportPackage.fbxText, 'model/vnd.fbx'), exportPackage.fbxFileName);
      exportPackage.textures.forEach((texture) => {
        downloadBlob(texture.blob, texture.fileName);
      });
      return exportPackage.fbxFileName;
    } catch {
      return null;
    }
  }

  /**
   * Writes a UTF-8 text file into a directory handle.
   *
   * @param directory Directory handle from showDirectoryPicker.
   * @param fileName File name within the directory.
   * @param text File contents.
   */
  private async writeTextToDirectory(directory: any, fileName: string, text: string): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  /**
   * Writes a binary blob into a directory handle.
   *
   * @param directory Directory handle from showDirectoryPicker.
   * @param fileName File name within the directory.
   * @param blob Binary contents.
   */
  private async writeBlobToDirectory(directory: any, fileName: string, blob: Blob): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
}
