import * as THREE from 'three';
import { CsgOperation } from '../../csg/csg_boolean_ops.js';
import { EditorShellOutlinerActions, EditorToolbarActions } from './editor_shell_builder.js';
import {
  applyOutlinerRename,
  applyOutlinerVisibilityToggle,
  applyOutlinerLockToggle,
  handleOutlinerDuplicate,
} from '../hierarchy/outliner_action_helpers.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { ObjectActionHandler } from '../hierarchy/object_action_handler.js';
import { CommandStack } from '../../commands/command_stack.js';
import { HierarchyReparentHandler } from '../hierarchy/hierarchy_reparent_handler.js';
import { PrimitiveCreationHandler } from '../creation/primitive_creation_handler.js';
import { CsgActionHandler } from '../tools/csg_action_handler.js';
import { AlignmentHandler } from '../hierarchy/alignment_handler.js';
import { SnapSettingsController } from '../tools/snap_settings_controller.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';

/**
 * Host callbacks used when building outliner shell action bindings. Handler
 * getters may resolve after shell construction completes.
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
 * Host callbacks used when building toolbar shell action bindings. Handler
 * getters may resolve after shell construction completes.
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
  onToggleSettingsDialog: () => void;
  onOpenDocumentation: () => void;
  onOpenAboutDialog: () => void;
  onOpenDetachedViewport: () => void;
  onDeleteSelected: () => void;
  onGroupSelected: () => void;
  onNewScene: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onImportVmf: () => void;
  onExportGlb: () => void;
  onExportObj: () => void;
  onExportFbx: () => void;
  getShortcutLabel: (action: 'save' | 'load' | 'export_glb') => string;
  onSetTransformSpaceGlobal: () => void;
  onSetTransformSpaceLocal: () => void;
  isTransformSpaceLocal: () => boolean;
}

/**
 * Builds outliner context-menu and drop action callbacks for the shell.
 *
 * @param host Layout manager callbacks and shared services.
 * @returns Outliner action callback bundle.
 */
export function buildOutlinerActions(host: OutlinerActionHost): EditorShellOutlinerActions {
  return {
    onDuplicateFromOutliner: (obj) =>
      handleOutlinerDuplicate(obj, host.selectionManager, host.getObjectActionHandler()),
    onDeleteFromOutliner: (obj) => deleteFromOutliner(host, obj),
    onGroupFromOutliner: (objects) => host.getObjectActionHandler().groupObjects(objects),
    onUngroupFromOutliner: (group) => host.getObjectActionHandler().ungroupGroup(group),
    onRenameFromOutliner: (obj, newName) => applyOutlinerRename(host.commandStack, obj, newName, host.refreshOutliner),
    onToggleVisibilityFromOutliner: (obj) =>
      applyOutlinerVisibilityToggle(host.commandStack, obj, host.refreshOutliner, () => host.syncViewports()),
    onToggleLockFromOutliner: (obj) => toggleLockFromOutliner(host, obj),
    reparentFromDrop: (dragged, target) => {
      if (!target) return;
      host.hierarchyReparentHandler.reparentFromDrop(dragged, target);
    },
    syncViewports: () => host.syncViewports(),
    refreshOutliner: () => host.refreshOutliner(),
    showStatusMessage: (message) => host.showStatusMessage(message),
  };
}

/**
 * Deletes hierarchy roots selected in the outliner, or the right-clicked
 * object.
 *
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
 *
 * @param host Outliner action host.
 * @param obj Object whose lock state is toggled.
 */
function toggleLockFromOutliner(host: OutlinerActionHost, obj: THREE.Object3D): void {
  applyOutlinerLockToggle(obj, host.refreshOutliner, host.showStatusMessage);
  host.onSelectionChanged();
}

/**
 * Builds toolbar button action callbacks for the shell.
 *
 * @param host Layout manager callbacks and shared services.
 * @returns Toolbar action callback bundle.
 */
export function buildToolbarActions(host: ToolbarActionHost): EditorToolbarActions {
  return {
    ...buildPrimitiveToolbarActions(host),
    ...buildEditToolbarActions(host),
    ...buildCsgSnapAlignToolbarActions(host),
    ...buildIoToolbarActions(host),
  };
}

/**
 * Builds primitive creation and panel toggle toolbar actions.
 *
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildPrimitiveToolbarActions(
  host: ToolbarActionHost,
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
  | 'onToggleSettingsDialog'
  | 'onOpenDocumentation'
  | 'onOpenAboutDialog'
  | 'onOpenDetachedViewport'
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
    onToggleSettingsDialog: () => host.onToggleSettingsDialog(),
    onOpenDocumentation: () => host.onOpenDocumentation(),
    onOpenAboutDialog: () => host.onOpenAboutDialog(),
    onOpenDetachedViewport: () => host.onOpenDetachedViewport(),
  };
}

/**
 * Builds history and edit toolbar actions.
 *
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildEditToolbarActions(
  host: ToolbarActionHost,
): Pick<
  EditorToolbarActions,
  'onUndo' | 'onRedo' | 'onDeleteSelected' | 'onDuplicateSelected' | 'onGroupSelected' | 'onUngroupSelected'
> {
  return {
    onUndo: () => host.onUndo(),
    onRedo: () => host.onRedo(),
    onDeleteSelected: () => host.onDeleteSelected(),
    onDuplicateSelected: () => host.getObjectActionHandler().onDuplicateSelected(),
    onGroupSelected: () => host.onGroupSelected(),
    onUngroupSelected: () => host.getObjectActionHandler().onUngroupSelected(),
  };
}

/**
 * Builds CSG, snap, texture lock, and alignment toolbar actions.
 *
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildCsgSnapAlignToolbarActions(
  host: ToolbarActionHost,
): Pick<
  EditorToolbarActions,
  | 'onCsgUnion'
  | 'onCsgSubtract'
  | 'onCsgIntersect'
  | 'canRunCsgBoolean'
  | 'onToggleSnap'
  | 'onSnapIntervalBackward'
  | 'onSnapIntervalForward'
  | 'onToggleTextureLock'
  | 'onTogglePositionLock'
  | 'onToggleStretchLock'
  | 'onAlignToOrigin'
  | 'onAlignToGridCenter'
  | 'onAlignToObject'
  | 'onSetTransformSpaceGlobal'
  | 'onSetTransformSpaceLocal'
  | 'isUserSnapEnabled'
  | 'isTextureLockEnabled'
  | 'isPositionLockEnabled'
  | 'isStretchLockEnabled'
  | 'isTransformSpaceLocal'
> {
  return {
    onCsgUnion: () => host.getCsgActionHandler().runBoolean(CsgOperation.UNION),
    onCsgSubtract: () => host.getCsgActionHandler().runBoolean(CsgOperation.SUBTRACT),
    onCsgIntersect: () => host.getCsgActionHandler().runBoolean(CsgOperation.INTERSECT),
    canRunCsgBoolean: () => host.getCsgActionHandler().canRunMeshBoolean(),
    onToggleSnap: () => host.getSnapSettingsController().onToggleSnap(),
    onSnapIntervalBackward: () => host.getSnapSettingsController().onSnapIntervalBackward(),
    onSnapIntervalForward: () => host.getSnapSettingsController().onSnapIntervalForward(),
    onToggleTextureLock: () => host.getSnapSettingsController().onToggleTextureLock(),
    onTogglePositionLock: () => host.getSnapSettingsController().onTogglePositionLock(),
    onToggleStretchLock: () => host.getSnapSettingsController().onToggleStretchLock(),
    onAlignToOrigin: () => host.getAlignmentHandler().onAlignToOrigin(),
    onAlignToGridCenter: () => host.getAlignmentHandler().onAlignToGridCenter(),
    onAlignToObject: () => host.getAlignmentHandler().onAlignToObject(),
    onSetTransformSpaceGlobal: () => host.onSetTransformSpaceGlobal(),
    onSetTransformSpaceLocal: () => host.onSetTransformSpaceLocal(),
    isUserSnapEnabled: () => host.isUserSnapEnabled(),
    isTextureLockEnabled: () => host.textureLock.isLocked(),
    isPositionLockEnabled: () => host.textureLock.isPositionLocked(),
    isStretchLockEnabled: () => host.textureLock.isStretchLocked(),
    isTransformSpaceLocal: () => host.isTransformSpaceLocal(),
  };
}

/**
 * Builds scene save/load/export toolbar actions.
 *
 * @param host Toolbar action host.
 * @returns Partial toolbar action bundle.
 */
function buildIoToolbarActions(
  host: ToolbarActionHost,
): Pick<
  EditorToolbarActions,
  | 'onNewScene'
  | 'onSaveScene'
  | 'onLoadScene'
  | 'onImportVmf'
  | 'onExportGlb'
  | 'onExportObj'
  | 'onExportFbx'
  | 'getShortcutLabel'
> {
  return {
    onNewScene: () => host.onNewScene(),
    onSaveScene: () => host.onSaveScene(),
    onLoadScene: () => host.onLoadScene(),
    onImportVmf: () => host.onImportVmf(),
    onExportGlb: () => host.onExportGlb(),
    onExportObj: () => host.onExportObj(),
    onExportFbx: () => host.onExportFbx(),
    getShortcutLabel: (action) => host.getShortcutLabel(action),
  };
}
