import type { ProjectAutosaveCapture } from '@/project/autosave/project_autosave.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';

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
  /** Replaces the scene with scene JSON text; true when it loaded. */
  sceneLoad: (text: string, name: string) => boolean;
  /** Captures the scene for an autosave. */
  sceneCapture: () => ProjectAutosaveCapture;
  /** Imports VMF text as a solid model with undo. */
  vmfImport: (text: string, name: string) => Promise<void>;
  /** Imports OBJ text as meshes with undo. */
  objImport: (text: string, name: string) => void;
  /** Selects a texture and applies it like the texture browser does. */
  textureSelect: (id: string) => void;
  /** Asks a yes/no question; resolves true on confirm. */
  confirm: (title: string, message: string, confirmLabel: string, cancelLabel: string) => Promise<boolean>;
  /** Runs the listener after every undoable change; returns an unsubscribe. */
  historyListen: (listener: () => void) => () => void;
  /** Texture library the project fills. */
  textureLibrary: () => TextureLibrary;
}
