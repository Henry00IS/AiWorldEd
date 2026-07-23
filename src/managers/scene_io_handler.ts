import * as THREE from 'three';
import { SceneSerializer } from '../io/scene_serializer.js';
import { SceneDeserializer } from '../io/scene_deserializer.js';
import { GlbExporter } from '../io/glb_exporter.js';
import { FileDialogManager } from '../io/file_dialog_manager.js';
import { StatusBar } from '../ui/status_bar.js';
import {
  VmfImportResult,
  VmfSolidImporter
} from '../io/vmf/vmf_solid_importer.js';

/**
 * Orchestrates save, load, GLB export, and VMF import operations.
 * Coordinates serializer, deserializer, exporter, and file dialog.
 */
export class SceneIOHandler {
  private sceneSerializer: SceneSerializer;
  private sceneDeserializer: SceneDeserializer;
  private glbExporter: GlbExporter;
  private fileDialogManager: FileDialogManager;
  private vmfImporter: VmfSolidImporter;

  /**
   * Creates a new scene I/O handler.
   */
  constructor() {
    this.sceneSerializer = new SceneSerializer();
    this.sceneDeserializer = new SceneDeserializer();
    this.glbExporter = new GlbExporter();
    this.fileDialogManager = new FileDialogManager();
    this.vmfImporter = new VmfSolidImporter();
  }

  /**
   * Saves the scene by serializing and writing to a file.
   * @param worldGroup The root group containing the scene objects.
   * @param statusBar The status bar for feedback, or null.
   */
  async saveScene(
    worldGroup: THREE.Group,
    statusBar: StatusBar | null
  ): Promise<void> {
    try {
      const sceneData = this.sceneSerializer.serialize(worldGroup);
      const jsonString = JSON.stringify(sceneData, null, 2);
      const filename = await this.fileDialogManager.saveJSON(
        jsonString,
        'scene.json'
      );
      this.showSaveResult(filename, statusBar);
    } catch (error) {
      this.showError(
        statusBar,
        `Failed to save scene: ${this.formatError(error)}`
      );
    }
  }

  /**
   * Displays save result in the status bar.
   * @param filename The saved filename, or null on failure.
   * @param statusBar The status bar for feedback, or null.
   */
  private showSaveResult(
    filename: string | null,
    statusBar: StatusBar | null
  ): void {
    if (!statusBar) return;
    if (filename) {
      statusBar.setLastSavedInfo(filename);
      statusBar.setLastAction(`Saved scene to ${filename}`);
    } else {
      statusBar.setErrorText('Failed to save scene');
    }
  }

  /**
   * Loads the scene by reading and deserializing a file.
   * @param worldGroup The target group to populate with loaded objects.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  async loadScene(
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null
  ): Promise<void> {
    try {
      const jsonString = await this.fileDialogManager.loadJSON();
      this.processLoadResult(jsonString, worldGroup, onSceneLoaded, statusBar);
    } catch (error) {
      this.showError(
        statusBar,
        `Failed to load scene: ${this.formatError(error)}`
      );
    }
  }

  /**
   * Processes the load result and rebuilds the scene.
   * Always attempts load when JSON is present, even if status bar is null.
   * @param jsonString The loaded JSON string, or null on failure.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  private processLoadResult(
    jsonString: string | null,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null
  ): void {
    if (jsonString) {
      this.processLoadedScene(jsonString, worldGroup, onSceneLoaded, statusBar);
      return;
    }
    this.showError(statusBar, 'Failed to load scene');
  }

  /**
   * Parses JSON and deserializes into the world group.
   * @param jsonString The JSON string to parse and load.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  private processLoadedScene(
    jsonString: string,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null
  ): void {
    try {
      const sceneData = JSON.parse(jsonString);
      if (!this.isValidSceneData(sceneData)) {
        this.showError(statusBar, 'Invalid scene file format');
        return;
      }
      this.sceneDeserializer.deserialize(sceneData, worldGroup);
      onSceneLoaded();
      if (statusBar) {
        statusBar.setLastAction('Scene loaded successfully');
        statusBar.setLastSavedInfo('loaded scene');
      }
    } catch (error) {
      this.showError(
        statusBar,
        `Invalid scene file format: ${this.formatError(error)}`
      );
    }
  }

  /**
   * Validates that parsed data has the minimum required scene shape.
   * @param data The parsed JSON value.
   * @returns True if the data looks like a SceneJSON payload.
   */
  private isValidSceneData(data: unknown): data is { version: number; objects: unknown[] } {
    if (!data || typeof data !== 'object') return false;
    const record = data as Record<string, unknown>;
    return typeof record.version === 'number' && Array.isArray(record.objects);
  }

  /**
   * Opens a VMF file dialog and imports brushes into a solid model.
   * Does not attach the model to the scene; the caller places it with undo.
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when cancelled or failed.
   */
  async importVmf(
    statusBar: StatusBar | null
  ): Promise<VmfImportResult | null> {
    try {
      const file = await this.fileDialogManager.loadTextFile(
        '.vmf,text/plain',
        'Valve Map Format (VMF)',
        ['.vmf']
      );
      if (!file) {
        this.showError(statusBar, 'VMF import cancelled');
        return null;
      }
      return this.importVmfFromText(file.text, file.filename, statusBar);
    } catch (error) {
      this.showError(
        statusBar,
        `Failed to import VMF: ${this.formatError(error)}`
      );
      return null;
    }
  }

  /**
   * Imports a VMF document from text into a solid model.
   * @param source VMF file contents.
   * @param filename Source filename used for the model name.
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when no brushes were produced.
   */
  importVmfFromText(
    source: string,
    filename: string,
    statusBar: StatusBar | null
  ): VmfImportResult | null {
    try {
      const modelName = this.modelNameFromVmfFilename(filename);
      const result = this.vmfImporter.importFromText(source, {
        modelName,
        includeEntitySolids: true,
        skipVolumeMaterials: true,
        rebuild: true
      });
      if (result.importedBrushCount === 0) {
        this.showError(statusBar, 'VMF contained no importable brushes');
        return null;
      }
      this.showVmfImportResult(result, filename, statusBar);
      return result;
    } catch (error) {
      this.showError(
        statusBar,
        `Failed to import VMF: ${this.formatError(error)}`
      );
      return null;
    }
  }

  /**
   * Builds a solid model display name from a VMF path or filename.
   * @param filename File name, possibly with path.
   * @returns Model name without extension.
   */
  private modelNameFromVmfFilename(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').replace(/\.vmf$/i, '');
    return base.length > 0 ? base : 'VMF Import';
  }

  /**
   * Writes VMF import success feedback to the status bar.
   * @param result Import summary.
   * @param filename Source filename.
   * @param statusBar Status bar, or null.
   */
  private showVmfImportResult(
    result: VmfImportResult,
    filename: string,
    statusBar: StatusBar | null
  ): void {
    if (!statusBar) return;
    const skipped =
      result.skippedBrushCount > 0
        ? `, skipped ${result.skippedBrushCount}`
        : '';
    statusBar.setLastAction(
      `Imported ${result.importedBrushCount} brushes from ${filename}${skipped}`
    );
  }

  /**
   * Exports the scene as a binary GLB file.
   * @param worldGroup The root group to export.
   * @param statusBar The status bar for feedback, or null.
   */
  async exportGlb(
    worldGroup: THREE.Group,
    statusBar: StatusBar | null
  ): Promise<void> {
    try {
      if (worldGroup.children.length === 0) {
        this.showError(statusBar, 'Nothing to export');
        return;
      }
      const buffer = await this.glbExporter.export(worldGroup);
      if (!buffer || buffer.byteLength === 0) {
        this.showError(statusBar, 'Failed to export GLB: empty result');
        return;
      }
      const filename = await this.fileDialogManager.saveBinary(
        buffer,
        'scene.glb'
      );
      this.showExportResult(filename, statusBar);
    } catch (error) {
      this.showError(
        statusBar,
        `Failed to export GLB: ${this.formatError(error)}`
      );
    }
  }

  /**
   * Displays export result in the status bar.
   * @param filename The exported filename, or null on failure.
   * @param statusBar The status bar for feedback, or null.
   */
  private showExportResult(
    filename: string | null,
    statusBar: StatusBar | null
  ): void {
    if (!statusBar) return;
    if (filename) {
      statusBar.setLastAction(`Exported GLB to ${filename}`);
    } else {
      statusBar.setErrorText('Failed to export GLB');
    }
  }

  /**
   * Writes an error message to the status bar when available.
   * @param statusBar The status bar, or null.
   * @param message The error message.
   */
  private showError(statusBar: StatusBar | null, message: string): void {
    if (statusBar) {
      statusBar.setErrorText(message);
    }
  }

  /**
   * Formats an unknown error into a short string.
   * @param error The thrown value.
   * @returns A readable error string.
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
