import type { Tool } from '@/editor/tools/tool.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';
import type * as THREE from 'three';
import { configCollaborationDevelopmentDefault } from '@/collaboration/config/config_collaboration_server.js';
import type {
  HostCollaborationEditor,
  HostCollaborationPlayer,
} from '@/collaboration/host/host_collaboration_editor.js';
import type { PlayerBallLink } from '@/player/ball/player_ball_link.js';
import type { ProjectHistoryThumbnailCapture } from '@/project/history/core/project_history_store.js';
import { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import type { CommandStack } from '@/commands/command_stack.js';
import type { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
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
  operationCancel: (refused: boolean) => boolean;
  operationRunning: () => boolean;
  transformDragging: () => boolean;
  textureLocks: () => TextureLockFlags;
  presenceCameras: () => readonly THREE.PerspectiveCamera[];
  presencePlayer: () => HostCollaborationPlayer | null;
  toyLinkSet: (link: PlayerBallLink | null) => void;
  ownColorSet: (color: number | null) => void;
  /** Takes the thumbnail of a saved room state. */
  historyThumbnail: ProjectHistoryThumbnailCapture;
}

/**
 * Adapts the viewport layout to the collaboration host interface. Called only
 * when the Collaborate menu is first used.
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
    outlinerMoveGateSet: (gate) => parts.outliner.moveGateSet(gate),
    toolGuardSet: (guard) => sharedMcpBridgeHandler.guardSet(guard),
    helperAdd: (object) => parts.sharedWorldScene.addHelper(object),
    helperRemove: (object) => parts.sharedWorldScene.removeHelper(object),
    presenceCameras: parts.presenceCameras,
    presencePlayer: parts.presencePlayer,
    toyLinkSet: parts.toyLinkSet,
    ownColorSet: parts.ownColorSet,
    status: (message) => parts.statusBar?.setLastAction(message),
    statusRetract: (message) => parts.statusBar?.retractLastAction(message),
    operationCancel: parts.operationCancel,
    operationRunning: parts.operationRunning,
    transformDragging: parts.transformDragging,
    textureLocks: parts.textureLocks,
    refresh: parts.refresh,
    sceneDiscard: () => layoutCollaborationSceneDiscard(parts),
    sceneSaveLocal: () => void parts.sceneIo.saveScene(parts.world, parts.statusBar),
    sceneHasWork: () =>
      parts.sceneIo.hasSceneContent(parts.world) || parts.commandStack.canUndo() || parts.commandStack.canRedo(),
    textureLibrary: () => getTextureMapCache().getLibrary(),
    historyThumbnail: parts.historyThumbnail,
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
 * Adds the Collaborate menu next to the other menus, then loads the
 * collaboration code in the background, connects to the relay (reconnecting
 * whenever the connection drops) and publishes MCP capture links through that
 * one connection.
 *
 * @param toolbar Editor toolbar.
 * @param hostCreate Builds the collaboration host on first use.
 * @returns Collaborate menu stub.
 */
export function installLayoutCollaborationMenu(
  toolbar: Toolbar,
  hostCreate: () => HostCollaborationEditor,
): LoaderCollaborationMenu {
  const menu = new LoaderCollaborationMenu(hostCreate, configCollaborationDevelopmentDefault());
  const wrapper = toolbar.addDropdown('Collaborate', menu.entries()).parentElement;
  const spacer = wrapper?.parentElement?.querySelector('[data-toolbar-trailing-spacer]');
  if (wrapper && spacer) spacer.before(wrapper);
  sharedMcpBridgeHandler.publisherSet(menu);
  menu.start().catch((error: unknown) => console.warn('[AiWorldEd] Collaboration failed to load.', error));
  return menu;
}

/**
 * Blocks replacing the whole scene (New, Load) while in an online room.
 *
 * @param menu Collaborate menu stub.
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

/**
 * Returns whether the active tool is a running edit operation for the room: a
 * single-use tool that can change the scene. Play mode is not one, so viewers
 * can play and playing takes no edit lease.
 *
 * @param tool Active tool.
 * @returns True for a single-use scene-editing tool.
 */
export function layoutCollaborationToolEdits(tool: Tool | null): boolean {
  return tool !== null && tool.isSingleUse && tool.changesScene();
}
