import * as THREE from 'three';
import { CsgOperation } from '../csg/csg_boolean_ops.js';
import {
  EditorShellOutlinerActions,
  EditorToolbarActions,
  applyOutlinerRename,
  applyOutlinerVisibilityToggle,
  applyOutlinerLockToggle,
  handleOutlinerDuplicate
} from './editor_shell_builder.js';
import { SelectionManager } from './selection_manager.js';
import { ObjectActionHandler } from './object_action_handler.js';
import { CommandStack } from '../commands/command_stack.js';
import { HierarchyReparentHandler } from './hierarchy_reparent_handler.js';
import { PrimitiveCreationHandler } from './primitive_creation_handler.js';
import { CsgActionHandler } from './csg_action_handler.js';
import { AlignmentHandler } from './alignment_handler.js';
import { SnapSettingsController } from './snap_settings_controller.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';

/**
 * Host callbacks used when building outliner shell action bindings.
 * Handler getters may resolve after shell construction completes.
 */
export interface OutlinerActionHost {
  selectionManager: SelectionManager;
  commandStack: CommandStack;
  hierarchyReparentHandler: HierarchyReparentHandler;
  getObjectActionHandler: () => ObjectActionHandler;
  getObjectsForGrouping: () => THREE.Object3D[];
  refreshOutliner: () => void;
  syncViewports: () => void;
  showStatusMessage: (message: string) => void;
  onSelectionChanged: () => void;
}

/**
 * Host callbacks used when building toolbar shell action bindings.
 * Handler getters may resolve after shell construction completes.
 */
export interface ToolbarActionHost {
  textureLock: TextureLockSettings;
  isUserSnapEnabled: () => boolean;
  getPrimitiveCreationHandler: () => PrimitiveCreationHandler;
  getObjectActionHandler: () => ObjectActionHandler;
  getCsgActionHandler: () => CsgActionHandler;
  getAlignmentHandler: () => AlignmentHandler;
  getSnapSettingsController: () => SnapSettingsController;
  onAddTerrain: () => void;
  onAddSolidModel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleUvEditor: () => void;
  onToggleTextureBrowser: () => void;
  onToggleToolsPalette: () => void;
  onToggleSolidModelPanel: () => void;
  onOpenAboutDialog: () => void;
  onDeleteSelected: () => void;
  onGroupSelected: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onExportGlb: () => void;
}

/**
 * Builds outliner context-menu and drop action callbacks for the shell.
 * @param host Layout manager callbacks and shared services.
 * @returns Outliner action callback bundle.
 */
export function buildOutlinerActions(
  host: OutlinerActionHost
): EditorShellOutlinerActions {
  return {
    onDuplicateFromOutliner: (obj) =>
      handleOutlinerDuplicate(
        obj,
        host.selectionManager,
        host.getObjectActionHandler()
      ),
    onDeleteFromOutliner: (obj) => deleteFromOutliner(host, obj),
    onGroupFromOutliner: (objects) =>
      host.getObjectActionHandler().groupObjects(objects),
    onUngroupFromOutliner: (group) =>
      host.getObjectActionHandler().ungroupGroup(group),
    onRenameFromOutliner: (obj, newName) =>
      applyOutlinerRename(host.commandStack, obj, newName, host.refreshOutliner),
    onToggleVisibilityFromOutliner: (obj) =>
      applyOutlinerVisibilityToggle(host.commandStack, obj, host.refreshOutliner),
    onToggleLockFromOutliner: (obj) => toggleLockFromOutliner(host, obj),
    reparentFromDrop: (dragged, target) => {
      if (!target) return;
      host.hierarchyReparentHandler.reparentFromDrop(dragged, target);
    },
    syncViewports: () => host.syncViewports(),
    refreshOutliner: () => host.refreshOutliner(),
    showStatusMessage: (message) => host.showStatusMessage(message)
  };
}

/**
 * Deletes hierarchy roots selected in the outliner, or the right-clicked object.
 * @param host Outliner action host.
 * @param obj Object that was right-clicked for delete.
 */
function deleteFromOutliner(host: OutlinerActionHost, obj: THREE.Object3D): void {
  const objects = host.getObjectsForGrouping();
  if (objects.length === 0) {
    host.getObjectActionHandler().deleteHierarchyObjects([obj]);
    return;
  }
  host.getObjectActionHandler().deleteHierarchyObjects(objects);
}

/**
 * Toggles lock on an outliner object and refreshes selection-dependent UI.
 * @param host Outliner action host.
 * @param obj Object whose lock state is toggled.
 */
function toggleLockFromOutliner(
  host: OutlinerActionHost,
  obj: THREE.Object3D
): void {
  applyOutlinerLockToggle(obj, host.refreshOutliner, host.showStatusMessage);
  host.onSelectionChanged();
}

/**
 * Builds toolbar button action callbacks for the shell.
 * @param host Layout manager callbacks and shared services.
 * @returns Toolbar action callback bundle.
 */
export function buildToolbarActions(host: ToolbarActionHost): EditorToolbarActions {
  return {
    ...buildPrimitiveToolbarActions(host),
    ...buildEditToolbarActions(host),
    ...buildCsgSnapAlignToolbarActions(host),
    ...buildIoToolbarActions(host)
  };
}

/**
 * Builds primitive creation and panel toggle toolbar actions.
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildPrimitiveToolbarActions(
  host: ToolbarActionHost
): Pick<
  EditorToolbarActions,
  | 'onAddCube'
  | 'onAddSphere'
  | 'onAddCylinder'
  | 'onAddPlane'
  | 'onAddTerrain'
  | 'onAddSolidModel'
  | 'onToggleUvEditor'
  | 'onToggleTextureBrowser'
  | 'onToggleToolsPalette'
  | 'onToggleSolidModelPanel'
  | 'onOpenAboutDialog'
> {
  return {
    onAddCube: () => host.getPrimitiveCreationHandler().createCube(),
    onAddSphere: () => host.getPrimitiveCreationHandler().createSphere(),
    onAddCylinder: () => host.getPrimitiveCreationHandler().createCylinder(),
    onAddPlane: () => host.getPrimitiveCreationHandler().createPlane(),
    onAddTerrain: () => host.onAddTerrain(),
    onAddSolidModel: () => host.onAddSolidModel(),
    onToggleUvEditor: () => host.onToggleUvEditor(),
    onToggleTextureBrowser: () => host.onToggleTextureBrowser(),
    onToggleToolsPalette: () => host.onToggleToolsPalette(),
    onToggleSolidModelPanel: () => host.onToggleSolidModelPanel(),
    onOpenAboutDialog: () => host.onOpenAboutDialog()
  };
}

/**
 * Builds history and edit toolbar actions.
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildEditToolbarActions(
  host: ToolbarActionHost
): Pick<
  EditorToolbarActions,
  | 'onUndo'
  | 'onRedo'
  | 'onDeleteSelected'
  | 'onDuplicateSelected'
  | 'onGroupSelected'
  | 'onUngroupSelected'
> {
  return {
    onUndo: () => host.onUndo(),
    onRedo: () => host.onRedo(),
    onDeleteSelected: () => host.onDeleteSelected(),
    onDuplicateSelected: () => host.getObjectActionHandler().onDuplicateSelected(),
    onGroupSelected: () => host.onGroupSelected(),
    onUngroupSelected: () => host.getObjectActionHandler().onUngroupSelected()
  };
}

/**
 * Builds CSG, snap, texture lock, and alignment toolbar actions.
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildCsgSnapAlignToolbarActions(
  host: ToolbarActionHost
): Pick<
  EditorToolbarActions,
  | 'onCsgUnion'
  | 'onCsgSubtract'
  | 'onCsgIntersect'
  | 'onToggleSnap'
  | 'onSnapIntervalBackward'
  | 'onSnapIntervalForward'
  | 'onToggleTextureLock'
  | 'onAlignToOrigin'
  | 'onAlignToGridCenter'
  | 'onAlignToObject'
  | 'isUserSnapEnabled'
  | 'isTextureLockEnabled'
> {
  return {
    onCsgUnion: () => host.getCsgActionHandler().runBoolean(CsgOperation.UNION),
    onCsgSubtract: () => host.getCsgActionHandler().runBoolean(CsgOperation.SUBTRACT),
    onCsgIntersect: () =>
      host.getCsgActionHandler().runBoolean(CsgOperation.INTERSECT),
    onToggleSnap: () => host.getSnapSettingsController().onToggleSnap(),
    onSnapIntervalBackward: () =>
      host.getSnapSettingsController().onSnapIntervalBackward(),
    onSnapIntervalForward: () =>
      host.getSnapSettingsController().onSnapIntervalForward(),
    onToggleTextureLock: () =>
      host.getSnapSettingsController().onToggleTextureLock(),
    onAlignToOrigin: () => host.getAlignmentHandler().onAlignToOrigin(),
    onAlignToGridCenter: () => host.getAlignmentHandler().onAlignToGridCenter(),
    onAlignToObject: () => host.getAlignmentHandler().onAlignToObject(),
    isUserSnapEnabled: () => host.isUserSnapEnabled(),
    isTextureLockEnabled: () => host.textureLock.isLocked()
  };
}

/**
 * Builds scene save/load/export toolbar actions.
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildIoToolbarActions(
  host: ToolbarActionHost
): Pick<EditorToolbarActions, 'onSaveScene' | 'onLoadScene' | 'onExportGlb'> {
  return {
    onSaveScene: () => host.onSaveScene(),
    onLoadScene: () => host.onLoadScene(),
    onExportGlb: () => host.onExportGlb()
  };
}
