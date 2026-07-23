import { SelectionManager } from './selection_manager.js';
import { CommandStack } from '../commands/command_stack.js';
import { HierarchyReparentHandler } from './hierarchy_reparent_handler.js';
import { ObjectActionHandler } from './object_action_handler.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { PrimitiveCreationHandler } from './primitive_creation_handler.js';
import { CsgActionHandler } from './csg_action_handler.js';
import { AlignmentHandler } from './alignment_handler.js';
import { SnapSettingsController } from './snap_settings_controller.js';
import {
  buildOutlinerActions,
  buildToolbarActions
} from './layout_action_factories.js';
import { OutlinerPanel } from '../ui/outliner_panel.js';

/**
 * Layout surface used to build outliner and toolbar shell actions.
 */
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
  onOpenAboutDialog: () => void;
  onDeleteSelected: () => void;
  onGroupSelected: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onExportGlb: () => void;
}

/**
 * Builds outliner action callbacks for the shell builder.
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
    onSelectionChanged: () => source.onSelectionChanged()
  });
}

/**
 * Builds toolbar action callbacks for the shell builder.
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
    onOpenAboutDialog: () => source.onOpenAboutDialog(),
    onDeleteSelected: () => source.onDeleteSelected(),
    onGroupSelected: () => source.onGroupSelected(),
    onSaveScene: () => source.onSaveScene(),
    onLoadScene: () => source.onLoadScene(),
    onExportGlb: () => source.onExportGlb()
  });
}
