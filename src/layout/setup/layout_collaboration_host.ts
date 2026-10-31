import type * as THREE from 'three';
import { configCollaborationDevelopmentIs } from '@/collaboration/config/config_collaboration_server.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import type { CommandStack } from '@/commands/command_stack.js';
import type { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import type { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';

/** Editor parts the collaboration host adapts. */
export interface LayoutCollaborationHostParts {
  container: HTMLElement;
  world: THREE.Group;
  selection: ManagerSelection;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  outliner: PanelOutliner;
  sharedWorldScene: SharedWorldScene;
  sceneIo: HandlerSceneIo;
  refresh: () => void;
  sceneLoaded: () => void;
}

/**
 * Adapts the viewport layout to the collaboration host interface. Called only
 * when the Online menu is first used.
 *
 * @param parts Editor parts.
 * @returns Collaboration host.
 */
export function createLayoutCollaborationHost(parts: LayoutCollaborationHostParts): HostCollaborationEditor {
  return {
    container: parts.container,
    world: parts.world,
    selection: parts.selection,
    commandStack: parts.commandStack,
    statusBarElement: () => parts.statusBar?.getRootElement() ?? null,
    outlinerHolderResolverSet: (resolver) => parts.outliner.remoteHolderResolverSet(resolver),
    outlinerEditGateSet: (gate) => parts.outliner.editGateSet(gate),
    helperAdd: (object) => parts.sharedWorldScene.addHelper(object),
    helperRemove: (object) => parts.sharedWorldScene.removeHelper(object),
    status: (message) => parts.statusBar?.setLastAction(message),
    statusRetract: (message) => parts.statusBar?.retractLastAction(message),
    refresh: parts.refresh,
    sceneDiscard: () => layoutCollaborationSceneDiscard(parts),
    sceneSaveLocal: () => void parts.sceneIo.saveScene(parts.world, parts.statusBar),
    sceneHasWork: () =>
      parts.sceneIo.hasSceneContent(parts.world) || parts.commandStack.canUndo() || parts.commandStack.canRedo(),
  };
}

/**
 * Clears the scene and history before the room scene arrives.
 *
 * @param parts Editor parts.
 */
function layoutCollaborationSceneDiscard(parts: LayoutCollaborationHostParts): void {
  parts.selection.clearSelection();
  parts.sceneIo.clearScene(parts.world, parts.statusBar);
  hierarchyNameAllocator.reset();
  parts.sceneLoaded();
}

/**
 * Adds the Online menu next to the other menus. Only the light stub loads now;
 * the collaboration code is imported when an entry is used.
 *
 * @param toolbar Editor toolbar.
 * @param hostCreate Builds the collaboration host on first use.
 * @returns Online menu stub.
 */
export function installLayoutCollaborationMenu(
  toolbar: Toolbar,
  hostCreate: () => HostCollaborationEditor,
): LoaderCollaborationMenu {
  const menu = new LoaderCollaborationMenu(hostCreate, configCollaborationDevelopmentIs(location.hostname));
  const wrapper = toolbar.addDropdown('Online', menu.entries()).parentElement;
  const spacer = wrapper?.parentElement?.querySelector('[data-toolbar-trailing-spacer]');
  if (wrapper && spacer) spacer.before(wrapper);
  return menu;
}

/**
 * Blocks replacing the whole scene (New, Load) while in an online room.
 *
 * @param menu Online menu stub.
 * @param status Shows a status message.
 * @returns True when blocked.
 */
export function layoutCollaborationSceneBlocked(
  menu: LoaderCollaborationMenu,
  status: (text: string) => void,
): boolean {
  if (!menu.active()) return false;
  status('Leave the online room before replacing the scene');
  return true;
}
