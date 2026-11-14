import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import { SceneFileDropTarget, type SceneFileDropLevel } from '@/io/scene_file/drop/scene_file_drop_target.js';

/** What opening a dropped level needs from the editor. */
export interface LayoutSceneDropContext {
  /** True when the scene must not be replaced now; shows why. */
  sceneBlocked: () => boolean;
  /** True when the scene has changes that are not saved. */
  hasUnsavedChanges: () => boolean;
  /** Asks whether to discard unsaved changes for the named file. */
  confirmDiscard: (name: string) => Promise<boolean>;
  /** Loads a dropped file Save cannot write back to; true when loaded. */
  loadFile: (file: File) => Promise<boolean>;
  /**
   * Loads a dropped file Save writes back to through its handle; true when
   * loaded.
   */
  loadHandle: (handle: SceneFileHandle, file: File) => Promise<boolean>;
  /** Runs after a dropped level loaded. */
  levelOpened: () => Promise<void>;
}

/** Editor parts the drop target is wired to. */
export interface LayoutSceneDropParts {
  /** Element that hosts dialogs. */
  host: HTMLElement;
  sceneIo: HandlerSceneIo;
  worldObject: THREE.Group;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  /** Runs after a level loaded. */
  onSceneLoaded: () => void;
  /** True when the scene must not be replaced now; shows why. */
  sceneBlocked: () => boolean;
  /** Runs after a level opened from a file. */
  levelOpened: () => Promise<void>;
}

/**
 * Opens level files dropped anywhere on the page like File > Open.
 *
 * @param parts Editor parts.
 * @returns Drop target to dispose with the editor.
 */
export function installLayoutSceneDrop(parts: LayoutSceneDropParts): SceneFileDropTarget {
  const context = layoutSceneDropContext(parts);
  return new SceneFileDropTarget(
    document,
    (level) => void layoutSceneDropOpen(context, level),
    () => parts.statusBar?.setLastAction('Drop an .aiworld level file to open it'),
  );
}

/**
 * Opens a dropped level: waits while the scene is blocked, asks before unsaved
 * changes are lost, then loads it.
 *
 * @param context Editor services.
 * @param level Dropped level file.
 */
export async function layoutSceneDropOpen(context: LayoutSceneDropContext, level: SceneFileDropLevel): Promise<void> {
  if (context.sceneBlocked()) return;
  const handle = level.handle === null ? null : await level.handle;
  if (context.hasUnsavedChanges() && !(await context.confirmDiscard(level.file.name))) return;
  const loaded = handle === null ? await context.loadFile(level.file) : await context.loadHandle(handle, level.file);
  if (loaded) await context.levelOpened();
}

/**
 * Builds the drop context from the editor parts.
 *
 * @param parts Editor parts.
 * @returns Drop context.
 */
function layoutSceneDropContext(parts: LayoutSceneDropParts): LayoutSceneDropContext {
  const load = (file: File, handle: SceneFileHandle | null) =>
    parts.sceneIo.loadSceneFile(file, parts.worldObject, parts.onSceneLoaded, parts.statusBar, file.name, handle);
  return {
    sceneBlocked: parts.sceneBlocked,
    hasUnsavedChanges: () => !parts.commandStack.isAtSavedPoint(),
    confirmDiscard: (name) => layoutSceneDropConfirm(parts.host, name),
    loadFile: (file) => load(file, null),
    loadHandle: async (handle, file) => {
      const loaded = await load(file, handle);
      if (loaded) void parts.sceneIo.getRecentFiles().remember(handle);
      return loaded;
    },
    levelOpened: parts.levelOpened,
  };
}

/**
 * Asks before a dropped level replaces a scene with unsaved changes.
 *
 * @param host Element that hosts the dialog.
 * @param name Dropped file name.
 * @returns True to open it.
 */
function layoutSceneDropConfirm(host: HTMLElement, name: string): Promise<boolean> {
  return showMessageBox({
    host,
    title: 'Open Level File',
    message: `Open ${name}?\n\nAny unsaved changes will be permanently lost.`,
    confirmLabel: 'Open',
    cancelLabel: 'Cancel',
  });
}
