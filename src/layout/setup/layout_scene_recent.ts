import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import type { SceneFileRecentItem } from '@/io/scene_file/recent/scene_file_recent.js';
import { sceneFileRecentMenuEntries } from '@/io/scene_file/recent/scene_file_recent_menu.js';

/** What File → Recent needs from the editor. */
export interface LayoutSceneRecentContext {
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
}

/**
 * Builds the rows of File → Recent.
 *
 * @param context Editor services.
 * @returns Submenu rows; empty when no Recent file is reachable.
 */
export function layoutSceneRecentEntries(context: LayoutSceneRecentContext): ToolbarMenuEntry[] {
  const recent = context.sceneIo.getRecentFiles();
  const actions = {
    open: (item: SceneFileRecentItem) => void layoutSceneRecentOpen(context, item),
    clear: () => void recent.clear(),
  };
  return sceneFileRecentMenuEntries(recent.accessible(), actions, Date.now());
}

/**
 * Opens a Recent file: confirms losing unsaved changes, asks the browser for
 * access when needed, then loads the level.
 *
 * @param context Editor services.
 * @param item Recent file.
 */
export async function layoutSceneRecentOpen(
  context: LayoutSceneRecentContext,
  item: SceneFileRecentItem,
): Promise<void> {
  if (context.sceneBlocked()) return;
  if (!context.commandStack.isAtSavedPoint() && !(await layoutSceneRecentConfirm(context, item))) return;
  const handle = await context.sceneIo.getRecentFiles().access(item);
  if (handle === null) {
    context.statusBar?.setErrorText(`Access to ${item.entry.handle.name} was not granted`);
    return;
  }
  await context.sceneIo.loadRecentScene(handle, context.worldObject, context.onSceneLoaded, context.statusBar);
}

/**
 * Asks before a Recent file replaces a scene with unsaved changes.
 *
 * @param context Editor services.
 * @param item Recent file.
 * @returns True to open it.
 */
function layoutSceneRecentConfirm(context: LayoutSceneRecentContext, item: SceneFileRecentItem): Promise<boolean> {
  return showMessageBox({
    host: context.host,
    title: 'Open Recent File',
    message: `Open ${item.entry.handle.name}?\n\nAny unsaved changes will be permanently lost.`,
    confirmLabel: 'Open',
    cancelLabel: 'Cancel',
  });
}
