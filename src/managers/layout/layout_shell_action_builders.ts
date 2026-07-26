import { SelectionManager } from '../../selection/object/selection_manager.js';
import { CommandStack } from '../../commands/command_stack.js';
import { HierarchyReparentHandler } from '../hierarchy/hierarchy_reparent_handler.js';
import { ObjectActionHandler } from '../hierarchy/object_action_handler.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import { PrimitiveCreationHandler } from '../creation/primitive_creation_handler.js';
import { CsgActionHandler } from '../tools/csg_action_handler.js';
import { AlignmentHandler } from '../hierarchy/alignment_handler.js';
import { SnapSettingsController } from '../tools/snap_settings_controller.js';
import { buildOutlinerActions, buildToolbarActions } from './layout_action_factories.js';
import { OutlinerPanel } from '../../ui/outliner_panel.js';

/** Layout surface used to build outliner and toolbar shell actions. */
export interface LayoutShellActionSource {
  selectionManager: SelectionManager;
  commandStack: CommandStack;
  hierarchyReparentHandler: HierarchyReparentHandler;
  objectActionHandler: ObjectActionHandler;
  outlinerPanel: OutlinerPanel;
  textureLock: TextureLockSettings;
  userSnapEnabled: boolean;
  primitiveCreationHandler: PrimitiveCreationHandler;
  csgActionHandler: CsgActionHandler;
  alignmentHandler: AlignmentHandler;
  snapSettingsController: SnapSettingsController;
  refreshOutliner: () => void;
  syncPrimitivesToViewports: () => void;
  showStatusMessage: (message: string) => void;
  onSelectionChanged: () => void;
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
  onDeleteSelected: () => void;
  onGroupSelected: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onImportVmf: () => void;
  onExportGlb: () => void;
  onSetTransformSpaceGlobal: () => void;
  onSetTransformSpaceLocal: () => void;
  isTransformSpaceLocal: () => boolean;
}

/**
 * Merges shell action source parts while preserving getters. Object spread
 * evaluates accessors immediately and would freeze late-bound handlers as
 * undefined when the shell is built before those handlers exist.
 *
 * @param parts Partial source objects (often getter maps).
 * @returns Combined late-bound shell action source.
 */
export function mergeLayoutShellActionSourceParts(
  ...parts: Array<Partial<LayoutShellActionSource>>
): LayoutShellActionSource {
  const descriptors: PropertyDescriptorMap = {};
  for (const part of parts) {
    Object.assign(descriptors, Object.getOwnPropertyDescriptors(part));
  }
  return Object.defineProperties({}, descriptors) as LayoutShellActionSource;
}

/**
 * Builds outliner action callbacks for the shell builder.
 *
 * @param source Layout manager surface.
 * @returns Outliner action callback bundle.
 */
export function createOutlinerShellActions(source: LayoutShellActionSource) {
  return buildOutlinerActions({
    selectionManager: source.selectionManager,
    commandStack: source.commandStack,
    hierarchyReparentHandler: source.hierarchyReparentHandler,
    getObjectActionHandler: () => source.objectActionHandler,
    getObjectsForGrouping: () => source.outlinerPanel.getObjectsForGrouping(),
    refreshOutliner: () => source.refreshOutliner(),
    syncViewports: () => source.syncPrimitivesToViewports(),
    showStatusMessage: (message) => source.showStatusMessage(message),
    onSelectionChanged: () => source.onSelectionChanged(),
  });
}

/**
 * Builds toolbar action callbacks for the shell builder.
 *
 * @param source Layout manager surface.
 * @returns Toolbar action callback bundle.
 */
export function createToolbarShellActions(source: LayoutShellActionSource) {
  return buildToolbarActions({
    textureLock: source.textureLock,
    isUserSnapEnabled: () => source.userSnapEnabled,
    getPrimitiveCreationHandler: () => source.primitiveCreationHandler,
    getObjectActionHandler: () => source.objectActionHandler,
    getCsgActionHandler: () => source.csgActionHandler,
    getAlignmentHandler: () => source.alignmentHandler,
    getSnapSettingsController: () => source.snapSettingsController,
    onAddTerrain: () => source.onAddTerrain(),
    onAddSolidModel: () => source.onAddSolidModel(),
    onUndo: () => source.onUndo(),
    onRedo: () => source.onRedo(),
    onToggleUvEditor: () => source.onToggleUvEditor(),
    onToggleTextureBrowser: () => source.onToggleTextureBrowser(),
    onToggleToolsPalette: () => source.onToggleToolsPalette(),
    onToggleSolidModelPanel: () => source.onToggleSolidModelPanel(),
    onToggleSettingsDialog: () => source.onToggleSettingsDialog(),
    onOpenDocumentation: () => source.onOpenDocumentation(),
    onOpenAboutDialog: () => source.onOpenAboutDialog(),
    onDeleteSelected: () => source.onDeleteSelected(),
    onGroupSelected: () => source.onGroupSelected(),
    onSaveScene: () => source.onSaveScene(),
    onLoadScene: () => source.onLoadScene(),
    onImportVmf: () => source.onImportVmf(),
    onExportGlb: () => source.onExportGlb(),
    onSetTransformSpaceGlobal: () => source.onSetTransformSpaceGlobal(),
    onSetTransformSpaceLocal: () => source.onSetTransformSpaceLocal(),
    isTransformSpaceLocal: () => source.isTransformSpaceLocal(),
  });
}
