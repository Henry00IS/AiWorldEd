import type { TextureLibrary } from '@/texture/library/texture_library.js';
import type { McpEditorToolGuard } from '@/ai/client/handler_mcp_bridge.js';
import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { OutlinerRemoteHolderResolver } from '@/outliner/ui/outliner_item.js';
import type { OutlinerEditGate, OutlinerMoveGate } from '@/outliner/ui/panel_outliner.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';

/** Play-mode pose of the local user. */
export interface HostCollaborationPlayer {
  /** Feet position in world space. */
  feet: THREE.Vector3;
  /** Body facing yaw in radians around +Y. */
  yawRadians: number;
  /** Look (camera) yaw in radians around +Y. */
  lookYawRadians: number;
  /** Look (camera) pitch in radians, positive up. */
  pitchRadians: number;
  /** True while standing on the ground. */
  grounded: boolean;
  /** True while pushing against a wall. */
  wallPushing: boolean;
  /** True while running. */
  running: boolean;
  /** Camera driven by play mode, left out of the shared viewport cameras. */
  camera: THREE.Camera | null;
}

/**
 * Editor services the collaboration runtime uses. The layout builds it once;
 * nothing in it runs until the user opens the Collaborate menu.
 */
export interface HostCollaborationEditor {
  /** Element that hosts dialogs. */
  readonly container: HTMLElement;
  /** World group holding the editable scene. */
  readonly world: THREE.Group;
  /** Object selection. */
  readonly selection: ManagerSelection;
  /** Undo history of the editor. */
  readonly commandStack: CommandStack;
  /**
   * Returns the status bar element that receives the connection indicator.
   *
   * @returns Status bar root, or null without a status bar.
   */
  statusBarElement(): HTMLElement | null;
  /**
   * Marks outliner rows held by other users.
   *
   * @param resolver Holder lookup, or null to clear.
   */
  outlinerHolderResolverSet(resolver: OutlinerRemoteHolderResolver | null): void;
  /**
   * Routes outliner rename, visibility, lock and context-menu edits through the
   * selection locks.
   *
   * @param gate Edit gate, or null to apply edits directly.
   */
  outlinerEditGateSet(gate: OutlinerEditGate | null): void;
  /**
   * Routes outliner drag-and-drop moves through the hierarchical locks.
   *
   * @param gate Move gate, or null to apply moves directly.
   */
  outlinerMoveGateSet(gate: OutlinerMoveGate | null): void;
  /**
   * Routes AI (MCP) tools through the room's guard, or back to direct calls.
   *
   * @param guard Guard, or null when leaving the room.
   */
  toolGuardSet(guard: McpEditorToolGuard | null): void;
  /**
   * Adds an overlay shown in every viewport, detached ones included.
   *
   * @param object Overlay object.
   */
  helperAdd(object: THREE.Object3D): void;
  /**
   * Removes an overlay added with helperAdd.
   *
   * @param object Overlay object.
   */
  helperRemove(object: THREE.Object3D): void;
  /**
   * Returns the perspective viewport cameras, detached panes included, in a
   * stable order.
   *
   * @returns Cameras.
   */
  presenceCameras(): readonly THREE.PerspectiveCamera[];
  /**
   * Returns the local play-mode pose.
   *
   * @returns Pose, or null outside play mode.
   */
  presencePlayer(): HostCollaborationPlayer | null;
  /**
   * Shows a short status message.
   *
   * @param message Message text.
   */
  status(message: string): void;
  /**
   * Clears the status when it still shows a message that no longer applies.
   *
   * @param message Message shown earlier.
   */
  statusRetract(message: string): void;
  /** Refreshes viewports, outliner, gizmo and panels after remote changes. */
  refresh(): void;
  /**
   * Clears the scene and local history without asking (joining discards local
   * work).
   */
  sceneDiscard(): void;
  /** Saves the scene to a local file. */
  sceneSaveLocal(): void;
  /**
   * Returns whether the scene has content or history that joining would
   * discard.
   *
   * @returns True when local work exists.
   */
  sceneHasWork(): boolean;
  /**
   * Returns the texture library: the owner's folder, or the textures a member
   * received from the owner.
   *
   * @returns Library, or null before the texture browser exists.
   */
  textureLibrary(): TextureLibrary | null;
}
