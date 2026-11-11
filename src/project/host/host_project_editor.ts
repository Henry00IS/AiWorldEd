import type { ProjectAutosaveCapture } from '@/project/autosave/project_autosave.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import type { ProjectHistoryRoom } from '@/project/history/controller_project_history.js';

/**
 * Where a model file from the project lands: in front of the last used view
 * like a new volume, or where the file places it.
 */
export type ProjectModelPlacement = 'view' | 'original';

/** Editor services the project folder features use. */
export interface HostProjectEditor {
  /** Editor root that hosts the project panel and dialogs. */
  container: HTMLElement;
  /** Element the panel opens next to by default, or null. */
  anchor: () => HTMLElement | null;
  /** Shows a status bar message. */
  status: (message: string) => void;
  /** True when the scene must not be replaced now; shows why unless quiet. */
  sceneBlocked: (quiet: boolean) => boolean;
  /** True when replacing the scene would lose work. */
  sceneHasUnsavedWork: () => boolean;
  /**
   * Replaces the scene with a scene file (zip or plain JSON); true when it
   * loaded.
   */
  sceneLoad: (file: Blob, name: string) => boolean | Promise<boolean>;
  /** Captures the scene for an autosave. */
  sceneCapture: () => ProjectAutosaveCapture;
  /** Imports VMF text as a solid model with undo. */
  vmfImport: (text: string, name: string, placement: ProjectModelPlacement) => Promise<void>;
  /** Imports OBJ text as meshes with undo. */
  objImport: (text: string, name: string, placement: ProjectModelPlacement) => void;
  /** Imports glTF bytes as meshes with undo; path is the file's project path. */
  glbImport: (bytes: ArrayBuffer, name: string, path: string, placement: ProjectModelPlacement) => Promise<void>;
  /** Imports FBX bytes as meshes with undo; path is the file's project path. */
  fbxImport: (bytes: ArrayBuffer, name: string, path: string, placement: ProjectModelPlacement) => Promise<void>;
  /** Selects a texture and applies it like the texture browser does. */
  textureSelect: (id: string) => void;
  /** Asks a yes/no question; resolves true on confirm. */
  confirm: (title: string, message: string, confirmLabel: string, cancelLabel: string) => Promise<boolean>;
  /** Runs the listener after every undoable change; returns an unsubscribe. */
  historyListen: (listener: () => void) => () => void;
  /** Texture library the project fills. */
  textureLibrary: () => TextureLibrary;
  /**
   * Texture ids the editor references now: the scene plus everything resolved
   * this session (deleted, undone and redoable objects). Texture cleanup never
   * trashes them.
   */
  textureIdsLive?: () => Iterable<string>;
  /** True while this editor is in a collaboration room, as owner or member. */
  roomActive?: () => boolean;
  /**
   * Returns the room this client owns, for the Level History.
   *
   * @returns Room, or null outside a room and for room members.
   */
  historyRoom?: () => ProjectHistoryRoom | null;
}
