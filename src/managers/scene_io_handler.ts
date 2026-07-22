import * as THREE from 'three';
import { SceneSerializer } from '../io/scene_serializer.js';
import { SceneDeserializer } from '../io/scene_deserializer.js';
import { GlbExporter } from '../io/glb_exporter.js';
import { FileDialogManager } from '../io/file_dialog_manager.js';
import { StatusBar } from '../ui/status_bar.js';

/**
 * Orchestrates save, load, and GLB export operations.
 * Coordinates serializer, deserializer, exporter, and file dialog.
 */
export class SceneIOHandler {
  private sceneSerializer: SceneSerializer;
  private sceneDeserializer: SceneDeserializer;
  private glbExporter: GlbExporter;
  private fileDialogManager: FileDialogManager;

  /**
   * Creates a new scene I/O handler.
   */
  constructor() {
    this.sceneSerializer = new SceneSerializer();
    this.sceneDeserializer = new SceneDeserializer();
    this.glbExporter = new GlbExporter();
    this.fileDialogManager = new FileDialogManager();
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
