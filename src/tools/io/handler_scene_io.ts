import { textCount } from '@/utils/utils_plural.js';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ObjImporter, type ObjImportResult } from '@/io/obj/obj_importer.js';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import type { GlbImportResult, GlbImportTextureResolver } from '@/io/glb/import/glb_import_types.js';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import type { FbxImportResult, FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';
import {
  ManagerFileDialog,
  downloadBlob,
  filePickerAccept,
  pickFileWithInput,
} from '@/io/dialog/manager_file_dialog.js';
import {
  SceneFileSession,
  type SceneFileHandle,
  type SceneFilePickerWindow,
  type SceneFileWriter,
} from '@/io/scene_file/scene_file_session.js';
import { editorWindowTitleSetFile, windowTitleFileName } from '@/ui/window_title.js';
import {
  SceneFileTooLargeError,
  sceneFileRead,
  sceneFileSizeCheck,
  sceneFileTexturesRead,
  sceneFileWorldText,
  sceneFileWrite,
} from '@/io/scene_file/scene_file_zip.js';
import { sceneFileThumbnailAccept } from '@/io/scene_file/scene_file_thumbnail.js';
import { sceneTextureIds } from '@/io/scene/scene_texture_ids.js';
import { ZipReader } from '@/io/zip/zip_reader.js';
import { textureEmbeddedIdIs } from '@/texture/embedded/texture_embedded_id.js';
import {
  textureEmbeddedAdd,
  textureEmbeddedCollect,
  textureEmbeddedReadable,
  textureEmbeddedRepoint,
  type TextureEmbedded,
} from '@/texture/embedded/texture_embedded_library.js';
import { TextureEmbeddedRetention } from '@/texture/embedded/texture_embedded_retention.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { showMessageNotice } from '@/ui/dialog/dialog_message_box.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';
import { modelExportBuild } from '@/io/export/model_export_build.js';
import { objMetaRead, type ObjMeta } from '@/io/obj/obj_meta.js';
import type { ModelExportTextures } from '@/io/export/model_export_textures.js';
import { modelExportDirectoryDestination, type ModelExportDestination } from '@/io/export/model_export_destination.js';
import { ModelExportFolderMemory } from '@/io/export/model_export_folder_memory.js';
import type { ModelExportDialogAnswer } from '@/ui/export/dialog_model_export.js';
import { VmfImportResult, VmfSolidImporter } from '@/io/vmf/vmf_solid_importer.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { ImportProgressOverlay } from '@/ui/import/import_progress_overlay.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SCENE_FILE_OPEN_ACCEPT } from '@/io/scene_file/scene_file_extension.js';
import { SceneFileRecent } from '@/io/scene_file/recent/scene_file_recent.js';
import { SceneFileRecentStore } from '@/io/scene_file/recent/scene_file_recent_store.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview.js';

/**
 * Orchestrates save, load, new scene, GLB/OBJ/FBX export, and VMF/OBJ/GLB/FBX
 * import operations. Coordinates serializer, deserializer, exporters, and file
 * dialog.
 */
export class HandlerSceneIo {
  private sceneSerializer: SceneSerializer;
  private sceneDeserializer: SceneDeserializer;
  private objImporter: ObjImporter;
  private glbImporter: GlbImporter;
  private fbxImporter: FbxImporter;
  private fileDialogManager: ManagerFileDialog;
  private vmfImporter: VmfSolidImporter;
  private sceneFileSession: SceneFileSession;
  private readonly recentFiles: SceneFileRecent;
  private readonly exportFolderMemory: ModelExportFolderMemory;
  private textureReadFailureShown = false;
  private embeddedReferences: () => Set<string> | null = () => null;
  private thumbnailCapture: () => Promise<Blob | null> = () => Promise.resolve(null);
  private readonly embeddedRetention = new TextureEmbeddedRetention({
    library: () => handlerSceneIoLibrary(),
    references: () => this.embeddedReferences(),
  });

  /**
   * Creates a new scene I/O handler.
   *
   * @param exportFolderMemory Remembers the folder of the last model export.
   * @param recentFiles Files opened or saved most recently.
   */
  constructor(
    exportFolderMemory: ModelExportFolderMemory = new ModelExportFolderMemory(),
    recentFiles: SceneFileRecent = new SceneFileRecent(new SceneFileRecentStore()),
  ) {
    this.exportFolderMemory = exportFolderMemory;
    this.recentFiles = recentFiles;
    this.recentFilesStart();
    this.sceneSerializer = new SceneSerializer();
    this.sceneDeserializer = new SceneDeserializer();
    this.objImporter = new ObjImporter();
    this.glbImporter = new GlbImporter();
    this.fbxImporter = new FbxImporter();
    this.fileDialogManager = new ManagerFileDialog();
    this.vmfImporter = new VmfSolidImporter();
    this.sceneFileSession = new SceneFileSession(
      (typeof window === 'undefined' ? {} : window) as SceneFilePickerWindow,
      (data, filename) => downloadBlob(data, filename),
      () => pickFileWithInput(SCENE_FILE_OPEN_ACCEPT),
    );
    this.sceneFileSession.setOnChange((filename) => editorWindowTitleSetFile(filename));
  }

  /**
   * Returns the folder picker of the Export dialog.
   *
   * @returns Picker, or null where the browser cannot pick folders (the files
   *   are then downloaded).
   */
  exportFolderPicker(): (() => Promise<ModelExportDestination | null>) | null {
    if (!this.fileDialogManager.canPickFolder()) return null;
    return async () => {
      const handle = await this.fileDialogManager.exportFolderPick();
      return handle === null ? null : modelExportDirectoryDestination(handle);
    };
  }

  /**
   * Returns the folder the last model export went to, where the browser can
   * pick folders.
   *
   * @returns Destination, or null when none is remembered or usable.
   */
  async exportFolderRecall(): Promise<ModelExportDestination | null> {
    if (!this.fileDialogManager.canPickFolder()) return null;
    return this.exportFolderMemory.recall();
  }

  /**
   * Reads the Recent list and checks it again whenever the window regains focus
   * (a file may have been deleted meanwhile).
   */
  private recentFilesStart(): void {
    void this.recentFiles.start();
    if (typeof window !== 'undefined') window.addEventListener('focus', () => void this.recentFiles.refresh());
  }

  /**
   * Returns the files opened or saved most recently.
   *
   * @returns Recent files.
   */
  getRecentFiles(): SceneFileRecent {
    return this.recentFiles;
  }

  /**
   * Returns the session that remembers the current scene file.
   *
   * @returns Scene file session.
   */
  getSceneFileSession(): SceneFileSession {
    return this.sceneFileSession;
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
    this.sceneFileSession.forget();
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
   * Saves the scene to the last opened or saved file, prompting only when no
   * file is remembered or when Save As is requested.
   *
   * @param worldGroup The root group containing the scene objects.
   * @param statusBar The status bar for feedback, or null.
   * @param alwaysPrompt True for Save As: always show the save picker.
   * @returns True when the scene was written, false on cancel or failure.
   */
  async saveScene(worldGroup: THREE.Group, statusBar: StatusBar | null, alwaysPrompt = false): Promise<boolean> {
    try {
      const payload = await this.sceneSavePayload(worldGroup);
      const write = this.sceneWriter(payload.world, payload.textures, payload.saved, payload.thumbnail);
      const filename = alwaysPrompt
        ? await this.sceneFileSession.saveAs(write)
        : await this.sceneFileSession.save(write);
      if (filename !== null) this.embeddedRetention.overwritten(payload.saved);
      if (filename !== null) await this.embeddedRepoint();
      if (filename !== null) this.recentRemember();
      this.showSaveResult(filename, statusBar, payload.left);
      return filename !== null;
    } catch (error) {
      this.saveFailed(error, statusBar);
      return false;
    }
  }

  /**
   * Builds the level text, its embedded textures, and its thumbnail, starting
   * the thumbnail capture while the level is serialized.
   *
   * @param worldGroup The root group containing the scene objects.
   * @returns What the file will hold.
   */
  private async sceneSavePayload(worldGroup: THREE.Group): Promise<{
    world: string;
    textures: TextureEmbedded[];
    saved: string[];
    left: number;
    thumbnail: Blob | null;
  }> {
    const thumbnailPending = this.thumbnailCapture();
    const sceneData = this.sceneSerializer.serialize(worldGroup);
    const textures = await this.embeddedTexturesOf(sceneData);
    const world = sceneFileWorldText(sceneData);
    const thumbnail = await sceneFileThumbnailAccept(await thumbnailPending);
    sceneFileSizeCheck(world, textures.found, thumbnail?.size ?? 0);
    return {
      world,
      textures: textures.found,
      saved: textures.found.map((texture) => texture.id),
      left: textures.left,
      thumbnail,
    };
  }

  /**
   * Builds the writer for a save. Embedded textures the new file leaves out are
   * read into memory only once the target is chosen, right before the write.
   *
   * @param world Level world text.
   * @param textures Embedded textures the file holds.
   * @param saved Their ids.
   * @param thumbnail Optional WebP thumbnail.
   * @returns Writer for the scene file session.
   */
  private sceneWriter(
    world: string,
    textures: TextureEmbedded[],
    saved: string[],
    thumbnail: Blob | null,
  ): SceneFileWriter {
    return async (sink) => {
      await this.embeddedRetention.beforeOverwrite(saved);
      await sceneFileWrite(world, textures, sink, thumbnail);
    };
  }

  /**
   * Reports a failed save; a level too large for its file also gets a dialog
   * saying how to make it smaller.
   *
   * @param error The thrown value.
   * @param statusBar The status bar for feedback, or null.
   */
  private saveFailed(error: unknown, statusBar: StatusBar | null): void {
    this.showError(statusBar, `Failed to save scene: ${this.formatError(error)}`);
    if (!(error instanceof SceneFileTooLargeError) || typeof document === 'undefined') return;
    const host = document.body;
    void showMessageNotice({ host, title: 'Level Too Large', message: error.advice });
  }

  /**
   * Collects the embedded textures a level uses that can be read.
   *
   * @param scene Serialized level.
   * @returns Readable textures, and how many used ones are left out.
   */
  private async embeddedTexturesOf(scene: SceneJSON): Promise<{ found: TextureEmbedded[]; left: number }> {
    const ids = [...sceneTextureIds(scene.objects)].filter((id) => textureEmbeddedIdIs(id)).sort();
    const collected = textureEmbeddedCollect(handlerSceneIoLibrary(), ids);
    const found = await textureEmbeddedReadable(collected.found);
    return { found, left: ids.length - found.length };
  }

  /**
   * Tells which embedded textures the scene and its undo and redo entries use,
   * so a save over the level file keeps exactly those readable.
   *
   * @param references Ids in use, or null when unknown.
   */
  setEmbeddedReferences(references: () => Set<string> | null): void {
    this.embeddedReferences = references;
  }

  /**
   * Sets how a save takes the level thumbnail. The capture may run while the
   * level is being written to JSON.
   *
   * @param capture Returns a WebP thumbnail, or null when none can be taken.
   */
  setThumbnailCapture(capture: () => Promise<Blob | null>): void {
    this.thumbnailCapture = capture;
  }

  /** Lets embedded textures only the history kept go once nothing uses them. */
  embeddedHistoryChanged(): void {
    this.embeddedRetention.release();
  }

  /**
   * Lets the embedded textures read their bytes from the file just saved: the
   * old file (or memory) may be gone.
   */
  private async embeddedRepoint(): Promise<void> {
    this.textureReadFailureShown = false;
    const file = await this.sceneFileSession.currentFile();
    const library = handlerSceneIoLibrary();
    if (file === null || library === null) return;
    try {
      const textures = await sceneFileTexturesRead(await ZipReader.open(file));
      textureEmbeddedRepoint(library, textures);
      this.embeddedRetention.backedByFile(textures.map((texture) => texture.id));
    } catch {
      return;
    }
  }

  /**
   * Reports when embedded textures cannot be read from their level file,
   * because it was replaced, moved or deleted outside the editor: the textures
   * would otherwise just show as missing.
   *
   * @param statusBar Status bar for the message, or null.
   * @returns Stops watching.
   */
  textureReadFailuresWatch(statusBar: StatusBar | null): () => void {
    return getTextureMapCache().loadFailedListen((entry) => void this.textureReadFailed(entry, statusBar));
  }

  /**
   * Tells the user once per level that its file changed under the editor.
   *
   * @param entry Entry whose image failed to load.
   * @param statusBar Status bar, or null.
   */
  private async textureReadFailed(entry: TextureBrowserEntry, statusBar: StatusBar | null): Promise<void> {
    if (!textureEmbeddedIdIs(entry.id) || this.textureReadFailureShown) return;
    const readable = await textureEmbeddedReadable([{ id: entry.id, name: entry.displayName, blob: entry.sourceFile }]);
    if (readable.length > 0 || this.textureReadFailureShown) return;
    this.textureReadFailureShown = true;
    const level = this.sceneFileSession.getCurrentFilename() ?? 'the level file';
    const message = `Embedded textures could not be read: ${level} was changed or moved outside the editor. Open it again to show them.`;
    console.warn(message);
    this.showError(statusBar, message);
  }

  /**
   * Serializes the scene without touching any file (autosave, snapshots).
   *
   * @param worldGroup The root group containing the scene objects.
   * @returns Scene data.
   */
  serializeScene(worldGroup: THREE.Group): SceneJSON {
    return this.sceneSerializer.serialize(worldGroup);
  }

  /**
   * Loads a scene file that was read elsewhere (project folder, autosave).
   *
   * @param file Scene file.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   * @param name Name shown as the loaded file.
   * @param fileName Active save file name or path, when known.
   * @returns True when the scene was loaded.
   */
  async loadSceneFile(
    file: Blob,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
    name: string,
    fileName?: string | null,
  ): Promise<boolean> {
    const loaded = await this.processLoadedScene(file, worldGroup, onSceneLoaded, statusBar);
    if (loaded) {
      this.sceneFileSession.forget();
      const remembered = windowTitleFileName(fileName);
      if (remembered !== null) this.sceneFileSession.rememberName(remembered);
      statusBar?.setLastSavedInfo(name);
    }
    return loaded;
  }

  /**
   * Displays save result in the status bar.
   *
   * @param filename The saved filename, or null on failure.
   * @param statusBar The status bar for feedback, or null.
   * @param left Embedded textures the level uses that could not be saved.
   */
  private showSaveResult(filename: string | null, statusBar: StatusBar | null, left: number): void {
    if (!statusBar) return;
    if (filename) {
      statusBar.setLastSavedInfo(filename);
      statusBar.setLastAction(`Saved scene to ${filename}${contentImportNote(handlerSceneIoMissingNote(left))}`);
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
      const opened = await this.sceneFileSession.open();
      if (opened === null) return;
      await this.openedSceneLoad(opened, worldGroup, onSceneLoaded, statusBar);
    } catch (error) {
      this.showError(statusBar, `Failed to load scene: ${this.formatError(error)}`);
    }
  }

  /**
   * Loads a file from the Recent list; a file that can no longer be read is
   * taken off the list.
   *
   * @param handle Recent file, with read access granted.
   * @param worldGroup The target group to populate with loaded objects.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  async loadRecentScene(
    handle: SceneFileHandle,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
  ): Promise<void> {
    const opened = await this.sceneFileSession.openHandle(handle);
    if (opened === null) {
      await this.recentFiles.forget(handle);
      this.showError(statusBar, `Could not read ${handle.name}; it was removed from Recent`);
      return;
    }
    await this.openedSceneLoad(opened, worldGroup, onSceneLoaded, statusBar);
  }

  /**
   * Loads a scene file the session opened and remembers it in Recent; a file
   * that fails to load is forgotten again.
   *
   * @param opened Opened file and its name.
   * @param worldGroup The target group to populate with loaded objects.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   */
  private async openedSceneLoad(
    opened: { file: File; filename: string },
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
  ): Promise<void> {
    if (await this.processLoadedScene(opened.file, worldGroup, onSceneLoaded, statusBar)) {
      statusBar?.setLastSavedInfo(opened.filename);
      this.recentRemember();
    } else {
      this.sceneFileSession.forget();
    }
  }

  /** Puts the current scene file at the top of the Recent list. */
  private recentRemember(): void {
    const handle = this.sceneFileSession.getCurrentHandle();
    if (handle !== null) void this.recentFiles.remember(handle);
  }

  /**
   * Reads a scene file (zip, or plain JSON) and deserializes it into the world
   * group; its embedded textures join the texture library.
   *
   * @param file Scene file.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after successful scene load.
   * @param statusBar The status bar for feedback, or null.
   * @returns True when the scene was loaded.
   */
  private async processLoadedScene(
    file: Blob,
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
    statusBar: StatusBar | null,
  ): Promise<boolean> {
    try {
      const contents = await sceneFileRead(file);
      const sceneData = handlerSceneIoUnwrap(contents.data);
      if (!this.isValidSceneData(sceneData)) {
        this.showError(statusBar, 'Invalid scene file format');
        return false;
      }
      this.sceneApply(sceneData, contents.textures, worldGroup, onSceneLoaded);
      const missing = handlerSceneIoEmbeddedMissing(sceneData, handlerSceneIoLibrary());
      statusBar?.setLastAction(`Scene loaded successfully${contentImportNote(handlerSceneIoMissingNote(missing))}`);
      statusBar?.setLastSavedInfo('loaded scene');
      return true;
    } catch (error) {
      this.showError(statusBar, `Invalid scene file format: ${this.formatError(error)}`);
      return false;
    }
  }

  /**
   * Replaces the world with a level and lists its embedded textures.
   *
   * @param sceneData Level.
   * @param textures Its embedded textures.
   * @param worldGroup The target group to populate.
   * @param onSceneLoaded Callback invoked after the load.
   */
  private sceneApply(
    sceneData: SceneJSON,
    textures: readonly TextureEmbedded[],
    worldGroup: THREE.Group,
    onSceneLoaded: () => void,
  ): void {
    const library = handlerSceneIoLibrary();
    if (library !== null) textureEmbeddedAdd(library, textures);
    this.embeddedRetention.backedByFile(textures.map((texture) => texture.id));
    this.textureReadFailureShown = false;
    this.sceneDeserializer.deserialize(sceneData, worldGroup);
    onSceneLoaded();
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
   * @param beforeRebuild Runs once every brush is in place, before the CSG
   *   rebuild.
   * @returns Import result, or null when no brushes were produced.
   */
  async importVmfFromText(
    source: string,
    filename: string,
    statusBar: StatusBar | null,
    beforeRebuild?: (model: SolidModel) => void,
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
        beforeRebuild,
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
      overlay.dispose();
    }
  }

  /**
   * Opens an OBJ file dialog and builds content meshes through the mesh
   * pipeline. Does not parent meshes; the caller places them with undo.
   *
   * @param statusBar Status bar for feedback, or null.
   * @param askSource Asks which program wrote a file without objmeta.
   * @returns Import result, or null when cancelled or failed.
   */
  async importObj(statusBar: StatusBar | null, askSource: HandlerSceneIoObjSource): Promise<ObjImportResult | null> {
    try {
      const file = await this.fileDialogManager.loadTextFile('.obj,text/plain', 'Wavefront OBJ', ['.obj']);
      if (!file) {
        this.showError(statusBar, 'OBJ import cancelled');
        return null;
      }
      return await this.importObjText(file.text, file.filename, statusBar, askSource);
    } catch (error) {
      this.showError(statusBar, `Failed to import OBJ: ${this.formatError(error)}`);
      return null;
    }
  }

  /**
   * Imports Wavefront OBJ text, asking which program wrote it only when its
   * objmeta comment does not say.
   *
   * @param source OBJ file contents.
   * @param filename Source filename for status messages.
   * @param statusBar Status bar for feedback, or null.
   * @param askSource Asks for the Source Program (null: cancelled).
   * @returns Import result, or null when cancelled or no meshes were produced.
   */
  async importObjText(
    source: string,
    filename: string,
    statusBar: StatusBar | null,
    askSource: HandlerSceneIoObjSource,
  ): Promise<ObjImportResult | null> {
    const meta = objMetaRead(source);
    if (meta !== null) return this.importObjFromText(source, filename, statusBar, null, meta);
    const sourceSpace = await askSource();
    if (sourceSpace === null) {
      this.showError(statusBar, 'OBJ import cancelled');
      return null;
    }
    return this.importObjFromText(source, filename, statusBar, sourceSpace, null);
  }

  /**
   * Imports Wavefront OBJ text into content meshes.
   *
   * @param source OBJ file contents.
   * @param filename Source filename for status messages.
   * @param statusBar Status bar for feedback, or null.
   * @param sourceSpace Axes and units of the program that wrote the file
   *   (unused when its objmeta comment says), or null for the editor's own.
   * @param meta The file's objmeta, when already read.
   * @returns Import result, or null when no meshes were produced.
   */
  importObjFromText(
    source: string,
    filename: string,
    statusBar: StatusBar | null,
    sourceSpace: ExportSpace | null,
    meta: ObjMeta | null = objMetaRead(source),
  ): ObjImportResult | null {
    try {
      const result = this.objImporter.importFromText(source, filename, sourceSpace, meta);
      if (result.importedObjectCount === 0) {
        this.showError(statusBar, 'OBJ contained no importable mesh objects');
        return null;
      }
      this.showObjImportResult(result, filename, statusBar);
      return result;
    } catch (error) {
      this.showError(statusBar, `Failed to import OBJ: ${this.formatError(error)}`);
      return null;
    }
  }

  /**
   * Reports a successful OBJ import in the status bar.
   *
   * @param result Import result.
   * @param filename Source file name.
   * @param statusBar Status bar, or null.
   */
  private showObjImportResult(result: ObjImportResult, filename: string, statusBar: StatusBar | null): void {
    if (!statusBar) {
      return;
    }
    const note = result.axesFromFile ? ', with the axes and unit it names' : '';
    statusBar.setLastAction(
      `Imported ${importCount(result.importedObjectCount, 'mesh', 'meshes')} (${importCount(result.importedFaceCount, 'face', 'faces')}) from ${filename}${note}`,
    );
  }

  /**
   * Opens a file dialog for a binary glTF file.
   *
   * @param statusBar Status bar for feedback, or null.
   * @returns File bytes and name, or null when cancelled.
   */
  async pickGlb(statusBar: StatusBar | null): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
    const file = await this.fileDialogManager.loadBinaryFile('.glb', 'glTF Binary', { 'model/gltf-binary': ['.glb'] });
    if (!file) this.showError(statusBar, 'GLB import cancelled');
    return file;
  }

  /**
   * Imports glTF bytes as content meshes. Does not parent the result; the
   * caller places it with undo.
   *
   * @param bytes File bytes.
   * @param filename Source filename for names and status messages.
   * @param textureResolver Decides the texture ids of embedded images.
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when nothing was imported.
   */
  importGlbFromBytes(
    bytes: ArrayBuffer,
    filename: string,
    textureResolver: GlbImportTextureResolver,
    statusBar: StatusBar | null,
  ): Promise<GlbImportResult | null> {
    return this.contentImportRun(
      filename,
      statusBar,
      `${filename} contains no triangle meshes`,
      () => this.glbImporter.importFromBytes(bytes, filename, textureResolver),
      (result) =>
        `${importCount(result.importedMeshCount, 'mesh', 'meshes')} (${importCount(result.importedTriangleCount, 'triangle', 'triangles')})`,
    );
  }

  /**
   * Opens a file dialog for an Autodesk FBX file.
   *
   * @param statusBar Status bar for feedback, or null.
   * @returns File bytes and name, or null when cancelled.
   */
  async pickFbx(statusBar: StatusBar | null): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
    const file = await this.fileDialogManager.loadBinaryFile('.fbx', 'Autodesk FBX', filePickerAccept(['.fbx']));
    if (!file) this.showError(statusBar, 'FBX import cancelled');
    return file;
  }

  /**
   * Imports FBX bytes as content meshes. Does not parent the result; the caller
   * places it with undo.
   *
   * @param bytes File bytes.
   * @param filename Source filename for names and status messages.
   * @param textureResolver Decides the texture ids of the diffuse maps.
   * @param statusBar Status bar for feedback, or null.
   * @returns Import result, or null when nothing was imported.
   */
  importFbxFromBytes(
    bytes: ArrayBuffer,
    filename: string,
    textureResolver: FbxImportTextureResolver,
    statusBar: StatusBar | null,
  ): Promise<FbxImportResult | null> {
    return this.contentImportRun(
      filename,
      statusBar,
      `${filename} contains no polygon meshes`,
      () => this.fbxImporter.importFromBytes(bytes, filename, textureResolver),
      (result) =>
        `${importCount(result.importedMeshCount, 'mesh', 'meshes')} (${importCount(result.importedPolygonCount, 'polygon', 'polygons')})`,
    );
  }

  /**
   * Runs a content mesh import and reports the outcome in the status bar.
   *
   * @param filename Source file name.
   * @param statusBar Status bar, or null.
   * @param emptyMessage Message when the file held nothing to import.
   * @param importRun Runs the import.
   * @param describe Describes what a result imported ("3 meshes ...").
   * @returns Import result, or null when nothing was imported.
   */
  private async contentImportRun<Result extends { textureNote: string | null }>(
    filename: string,
    statusBar: StatusBar | null,
    emptyMessage: string,
    importRun: () => Promise<Result | null>,
    describe: (result: Result) => string,
  ): Promise<Result | null> {
    try {
      const result = await importRun();
      if (result === null) this.showError(statusBar, emptyMessage);
      else
        statusBar?.setLastAction(
          `Imported ${describe(result)} from ${filename}${contentImportNote(result.textureNote)}`,
        );
      return result;
    } catch (error) {
      this.showError(statusBar, `Failed to import ${filename}: ${this.formatError(error)}`);
      return null;
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
   * Exports the world as the Export dialog chose: builds the model and its
   * texture files and writes them to the chosen folder.
   *
   * @param worldGroup The root group to export.
   * @param statusBar The status bar for feedback, or null.
   * @param answer Export dialog choices.
   */
  async exportModel(
    worldGroup: THREE.Group,
    statusBar: StatusBar | null,
    answer: ModelExportDialogAnswer,
  ): Promise<void> {
    try {
      if (!this.hasExportableContent(worldGroup)) {
        this.showError(statusBar, 'Nothing to export');
        return;
      }
      const textures = this.exportTextures(answer);
      const built = await modelExportBuild(worldGroup, {
        format: answer.format,
        target: answer.target,
        baseFileName: answer.baseFileName,
        fbxEncoding: answer.fbxEncoding,
        textures,
        objMaterials: answer.objMaterials,
      });
      for (const file of built.files) await answer.destination.write(file.path, file.blob);
      if (answer.destination.folder !== undefined) this.exportFolderMemory.remember(answer.destination.folder);
      statusBar?.setLastAction(handlerSceneIoExportSummary(answer, built.textureCount));
    } catch (error) {
      this.showError(statusBar, `Failed to export ${answer.fileName}: ${this.formatError(error)}`);
    }
  }

  /**
   * Turns the dialog's texture choice into the exporters' texture setting.
   *
   * @param answer Export dialog choices.
   * @returns Texture setting.
   */
  private exportTextures(answer: ModelExportDialogAnswer): ModelExportTextures {
    if (answer.textureMode === 'embedded') return { mode: 'embedded' };
    return { mode: 'copy', folder: answer.texturesFolder };
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

/** Asks which program wrote an OBJ file; null when cancelled. */
export type HandlerSceneIoObjSource = () => Promise<ExportSpace | null>;

/**
 * Returns the texture library the editor shows.
 *
 * @returns Library, or null before one is bound.
 */
function handlerSceneIoLibrary(): TextureLibrary | null {
  return getTextureMapCache().getLibrary();
}

/**
 * Counts the embedded textures a level uses that the library lacks.
 *
 * @param scene Level.
 * @param library Texture library, or null.
 * @returns Missing count.
 */
function handlerSceneIoEmbeddedMissing(scene: SceneJSON, library: TextureLibrary | null): number {
  const ids = [...sceneTextureIds(scene.objects)].filter((id) => textureEmbeddedIdIs(id));
  return textureEmbeddedCollect(library, ids).missing.length;
}

/**
 * Describes embedded textures a level uses but does not have.
 *
 * @param count Missing embedded textures.
 * @returns Note, or null when none are missing.
 */
function handlerSceneIoMissingNote(count: number): string | null {
  return count === 0 ? null : `${textCount(count, 'embedded texture')} missing`;
}

/**
 * Unwraps autosave and snapshot files so they load like plain scene files.
 *
 * @param value Parsed JSON.
 * @returns Scene data candidate.
 */
function handlerSceneIoUnwrap(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return record['format'] === 'aiworlded-autosave' ? record['data'] : value;
}

/**
 * Describes a finished export for the status bar, such as: Exported level.fbx
 * with 3 textures to Downloads for Godot.
 *
 * @param answer Export dialog choices.
 * @param textureCount Number of texture files written.
 * @returns Message.
 */
function handlerSceneIoExportSummary(answer: ModelExportDialogAnswer, textureCount: number): string {
  const textures = textureCount > 0 ? ` with ${textCount(textureCount, 'texture')}` : '';
  const target = answer.format === 'gltf' || answer.format === 'glb' ? '' : ` for ${answer.target.label}`;
  return `Exported ${answer.fileName}${textures} to ${answer.destination.label}${target}`;
}

/**
 * Formats a texture note as a status bar suffix.
 *
 * @param note Texture note, or null.
 * @returns ; note , or an empty string without a note.
 */
function contentImportNote(note: string | null): string {
  return note === null || note === '' ? '' : `; ${note}`;
}

/**
 * Writes a count with the singular or plural noun.
 *
 * @param count Count.
 * @param singular Noun for one.
 * @param plural Noun for any other count.
 * @returns For example "1 mesh" or "3 meshes".
 */
function importCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
