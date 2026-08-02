import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { ManagerFileDialog } from '@/io/dialog/manager_file_dialog.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import type { GameProfile } from '@/settings/store/settings_types.js';
import { formatCoordinateSpaceSummary } from '@/settings/coordinate/coordinate_space_presets.js';
import { getUnitLabel } from '@/settings/units/unit_presets.js';
import { VmfImportResult, VmfSolidImporter } from '@/io/vmf/vmf_solid_importer.js';
import { ImportProgressOverlay } from '@/ui/import/import_progress_overlay.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview.js';

/**
 * Orchestrates save, load, new scene, GLB/OBJ/FBX export, and VMF import
 * operations. Coordinates serializer, deserializer, exporters, and file
 * dialog.
 */
export class HandlerSceneIo {
  private sceneSerializer: SceneSerializer;
  private sceneDeserializer: SceneDeserializer;
  private glbExporter: GlbExporter;
  private objExporter: ObjExporter;
  private fbxExporter: FbxExporter;
  private fileDialogManager: ManagerFileDialog;
  private vmfImporter: VmfSolidImporter;

  /** Creates a new scene I/O handler. */
  constructor() {
    this.sceneSerializer = new SceneSerializer();
    this.sceneDeserializer = new SceneDeserializer();
    this.glbExporter = new GlbExporter();
    this.objExporter = new ObjExporter();
    this.fbxExporter = new FbxExporter();
    this.fileDialogManager = new ManagerFileDialog();
    this.vmfImporter = new VmfSolidImporter();
  }

  /**
   * Clears all scene content from the world group while preserving editor
   * helpers. Does not modify the undo stack; the caller clears history.
   *
   * @param worldGroup The root group containing the scene objects.
   * @param statusBar The status bar for feedback, or null.
   */
  clearScene(worldGroup: THREE.Group, statusBar: StatusBar | null): void {
    this.sceneDeserializer.clearContent(worldGroup);
    if (statusBar) {
      statusBar.setLastAction('Created new scene');
      statusBar.setLastSavedInfo('untitled');
    }
  }

  /**
   * Returns whether the world contains user content that would be lost by New.
   *
   * @param worldGroup World root group.
   * @returns True when at least one content child is present.
   */
  hasSceneContent(worldGroup: THREE.Group): boolean {
    return worldGroup.children.some((child) => child.userData[CLIP_PREVIEW_USERDATA_KEY] !== true);
  }

  /**
   * Saves the scene by serializing and writing to a file.
   *
   * @param worldGroup The root group containing the scene objects.
   * @param statusBar The status bar for feedback, or null.
   */
  async saveScene(worldGroup: THREE.Group, statusBar: StatusBar | null): Promise<void> {
    try {
      const sceneData = this.sceneSerializer.serialize(worldGroup);
      const jsonString = JSON.stringify(sceneData, null, 2);
      const filename = await this.fileDialogManager.saveJSON(jsonString, 'scene.json');
      this.showSaveResult(filename, statusBar);
    } catch (error) {
      this.showError(statusBar, `Failed to save scene: ${this.formatError(error)}`);
    }
  }

  /**
   * Displays save result in the status bar.
   *
   * @param filename The saved filename, or null on failure.
   * @param statusBar The status bar for feedback, or null.
   */
  private showSaveResult(filename: string | null, statusBar: StatusBar | null): void {
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
   *
   * @param worldGroup The target group to populate with loaded objects.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  async loadScene(worldGroup: THREE.Group, onSceneLoaded: () => void, statusBar: StatusBar | null): Promise<void> {
    try {
      const jsonString = await this.fileDialogManager.loadJSON();
      this.processLoadResult(jsonString, worldGroup, onSceneLoaded, statusBar);
    } catch (error) {
      this.showError(statusBar, `Failed to load scene: ${this.formatError(error)}`);
    }
  }

  /**
   * Processes the load result and rebuilds the scene. Always attempts load when
   * JSON is present, even if status bar is null.
   *
   * @param jsonString The loaded JSON string, or null on failure.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  private processLoadResult(
    jsonString: string | null,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
  ): void {
    if (jsonString) {
      this.processLoadedScene(jsonString, worldGroup, onSceneLoaded, statusBar);
      return;
    }
    this.showError(statusBar, 'Failed to load scene');
  }

  /**
   * Parses JSON and deserializes into the world group.
   *
   * @param jsonString The JSON string to parse and load.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  private processLoadedScene(
    jsonString: string,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
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
      this.showError(statusBar, `Invalid scene file format: ${this.formatError(error)}`);
    }
  }

  /**
   * Validates that parsed data has the minimum required scene shape.
   *
   * @param data The parsed JSON value.
   * @returns True if the data looks like a SceneJSON payload.
   */
  private isValidSceneData(data: unknown): data is SceneJSON {
    if (!data || typeof data !== 'object') return false;
    const record = data as Record<string, unknown>;
    return typeof record['version'] === 'number' && Array.isArray(record['objects']);
  }

  /**
   * Opens a VMF file dialog and imports brushes into a solid model. Does not
   * attach the model to the scene; the caller places it with undo.
   *
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when cancelled or failed.
   */
  async importVmf(statusBar: StatusBar | null): Promise<VmfImportResult | null> {
    try {
      const file = await this.fileDialogManager.loadTextFile('.vmf,text/plain', 'Valve Map Format (VMF)', ['.vmf']);
      if (!file) {
        this.showError(statusBar, 'VMF import cancelled');
        return null;
      }
      return await this.importVmfFromText(file.text, file.filename, statusBar);
    } catch (error) {
      this.showError(statusBar, `Failed to import VMF: ${this.formatError(error)}`);
      return null;
    }
  }

  /**
   * Imports a VMF document from text into a solid model (async, non-blocking
   * UI).
   *
   * @param source VMF file contents.
   * @param filename Source filename used for the model name.
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when no brushes were produced.
   */
  async importVmfFromText(
    source: string,
    filename: string,
    statusBar: StatusBar | null,
  ): Promise<VmfImportResult | null> {
    const overlay = new ImportProgressOverlay(`Importing ${filename}`);
    overlay.show();
    overlay.setProgress(0, 'Starting…');
    try {
      const modelName = this.modelNameFromVmfFilename(filename);
      const result = await this.vmfImporter.importFromTextAsync(source, {
        modelName,
        includeEntitySolids: true,
        skipVolumeMaterials: true,
        rebuild: true,
        onProgress: (ratio, label) => overlay.setProgress(ratio, label),
      });
      if (result.importedBrushCount === 0) {
        this.showError(statusBar, 'VMF contained no importable brushes');
        return null;
      }
      this.showVmfImportResult(result, filename, statusBar);
      return result;
    } catch (error) {
      this.showError(statusBar, `Failed to import VMF: ${this.formatError(error)}`);
      return null;
    } finally {
      overlay.hide();
    }
  }

  /**
   * Builds a solid model display name from a VMF path or filename.
   *
   * @param filename File name, possibly with path.
   * @returns Model name without extension.
   */
  private modelNameFromVmfFilename(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').replace(/\.vmf$/i, '');
    return base.length > 0 ? base : 'VMF Import';
  }

  /**
   * Writes VMF import success feedback to the status bar.
   *
   * @param result Import summary.
   * @param filename Source filename.
   * @param statusBar Status bar, or null.
   */
  private showVmfImportResult(result: VmfImportResult, filename: string, statusBar: StatusBar | null): void {
    if (!statusBar) return;
    const skipped = result.skippedBrushCount > 0 ? `, skipped ${result.skippedBrushCount}` : '';
    statusBar.setLastAction(`Imported ${result.importedBrushCount} brushes from ${filename}${skipped}`);
  }

  /**
   * Exports the scene as a binary GLB file in canonical glTF coordinates.
   *
   * @param worldGroup The root group to export.
   * @param statusBar The status bar for feedback, or null.
   */
  async exportGlb(worldGroup: THREE.Group, statusBar: StatusBar | null): Promise<void> {
    try {
      if (!this.hasExportableContent(worldGroup)) {
        this.showError(statusBar, 'Nothing to export');
        return;
      }
      const buffer = await this.glbExporter.export(worldGroup);
      if (!buffer || buffer.byteLength === 0) {
        this.showError(statusBar, 'Failed to export GLB: empty result');
        return;
      }
      const filename = await this.fileDialogManager.saveBinary(buffer, 'scene.glb');
      this.showExportResult(filename, statusBar, null, 'GLB');
    } catch (error) {
      this.showError(statusBar, `Failed to export GLB: ${this.formatError(error)}`);
    }
  }

  /**
   * Exports the scene as a Wavefront package (.obj + .mtl + map images) baked
   * with the active profile's coordinate space and length-unit conventions.
   *
   * @param worldGroup The root group to export.
   * @param statusBar The status bar for feedback, or null.
   * @param profile Active game profile controlling conversion, or null.
   */
  async exportObj(
    worldGroup: THREE.Group,
    statusBar: StatusBar | null,
    profile: GameProfile | null = null,
  ): Promise<void> {
    try {
      if (!this.hasExportableContent(worldGroup)) {
        this.showError(statusBar, 'Nothing to export');
        return;
      }
      const exportPackage = await this.objExporter.exportPackage(worldGroup, profile, 'scene');
      if (!exportPackage.objText || exportPackage.objText.trim().length === 0) {
        this.showError(statusBar, 'Failed to export OBJ: empty result');
        return;
      }
      const filename = await this.fileDialogManager.saveWavefrontPackage(exportPackage);
      this.showObjExportResult(filename, statusBar, profile, exportPackage.textures.length);
    } catch (error) {
      this.showError(statusBar, `Failed to export OBJ: ${this.formatError(error)}`);
    }
  }

  /**
   * Exports the scene as Autodesk FBX ASCII with optional external map images,
   * baked with the active game profile's coordinate space and length units.
   *
   * @param worldGroup The root group to export.
   * @param statusBar The status bar for feedback, or null.
   * @param profile Active game profile controlling conversion, or null.
   */
  async exportFbx(
    worldGroup: THREE.Group,
    statusBar: StatusBar | null,
    profile: GameProfile | null = null,
  ): Promise<void> {
    try {
      if (!this.hasExportableContent(worldGroup)) {
        this.showError(statusBar, 'Nothing to export');
        return;
      }
      const exportPackage = await this.fbxExporter.exportPackage(worldGroup, profile, 'scene');
      if (!exportPackage.fbxText || exportPackage.fbxText.trim().length === 0) {
        this.showError(statusBar, 'Failed to export FBX: empty result');
        return;
      }
      const filename = await this.fileDialogManager.saveFbxPackage(exportPackage);
      this.showFbxExportResult(filename, statusBar, profile, exportPackage.textures.length);
    } catch (error) {
      this.showError(statusBar, `Failed to export FBX: ${this.formatError(error)}`);
    }
  }

  /**
   * Displays Wavefront package export feedback, noting the companion MTL and
   * any texture maps written alongside the OBJ.
   *
   * @param filename Primary OBJ file name, or null on failure.
   * @param statusBar Status bar for feedback, or null.
   * @param profile Profile used for conversion, or null.
   * @param textureCount Number of map image files exported.
   */
  private showObjExportResult(
    filename: string | null,
    statusBar: StatusBar | null,
    profile: GameProfile | null,
    textureCount: number,
  ): void {
    if (!statusBar) return;
    if (!filename) {
      statusBar.setLastAction('Wavefront OBJ export cancelled');
      return;
    }
    const maps = textureCount > 0 ? ` + ${textureCount} map${textureCount === 1 ? '' : 's'}` : '';
    const suffix = this.describeProfile(profile);
    statusBar.setLastAction(`Exported Wavefront OBJ/MTL${maps} to ${filename}${suffix}`);
  }

  /**
   * Displays FBX package export feedback, noting any texture maps written
   * alongside the .fbx.
   *
   * @param filename Primary FBX file name, or null on failure.
   * @param statusBar Status bar for feedback, or null.
   * @param profile Profile used for conversion, or null.
   * @param textureCount Number of map image files exported.
   */
  private showFbxExportResult(
    filename: string | null,
    statusBar: StatusBar | null,
    profile: GameProfile | null,
    textureCount: number,
  ): void {
    if (!statusBar) return;
    if (!filename) {
      statusBar.setLastAction('FBX export cancelled');
      return;
    }
    const maps = textureCount > 0 ? ` + ${textureCount} map${textureCount === 1 ? '' : 's'}` : '';
    const suffix = this.describeProfile(profile);
    statusBar.setLastAction(`Exported FBX${maps} to ${filename}${suffix}`);
  }

  /**
   * Returns whether the world has content worth exporting (ignores helpers).
   *
   * @param worldGroup World root group.
   * @returns True when exportable content exists.
   */
  private hasExportableContent(worldGroup: THREE.Group): boolean {
    return this.hasSceneContent(worldGroup);
  }

  /**
   * Displays export result in the status bar, annotated with the active
   * profile's coordinate space and unit when available.
   *
   * @param filename The exported filename, or null on failure.
   * @param statusBar The status bar for feedback, or null.
   * @param profile The profile used for conversion, or null.
   * @param formatLabel Short format name such as GLB or OBJ.
   */
  private showExportResult(
    filename: string | null,
    statusBar: StatusBar | null,
    profile: GameProfile | null,
    formatLabel: string,
  ): void {
    if (!statusBar) return;
    if (filename) {
      const suffix = this.describeProfile(profile);
      statusBar.setLastAction(`Exported ${formatLabel} to ${filename}${suffix}`);
    } else {
      statusBar.setErrorText(`Failed to export ${formatLabel}`);
    }
  }

  /**
   * Builds a short "(<unit>, <space>)" suffix describing the conversion applied
   * during export. Returns an empty string when no profile is set.
   *
   * @param profile The profile used for conversion, or null.
   * @returns Suffix text for the status bar message.
   */
  private describeProfile(profile: GameProfile | null): string {
    if (!profile) return '';
    const activeUnit = profile.unitSystem === 'metric' ? profile.metricUnit : profile.imperialUnit;
    const unit = getUnitLabel(profile.unitSystem, activeUnit);
    const space = formatCoordinateSpaceSummary(profile.coordinateSpace);
    return ` (${unit}, ${space})`;
  }

  /**
   * Writes an error message to the status bar when available.
   *
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
   *
   * @param error The thrown value.
   * @returns A readable error string.
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
