import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { HandlerHierarchyReparent } from '@/outliner/hierarchy/handler_hierarchy_reparent.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { HandlerPrimitiveCreation } from '@/tools/creation/handler_primitive_creation.js';
import { HandlerCsgAction } from '@/tools/csg/handler_csg_action.js';
import { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import { buildOutlinerActions, buildToolbarActions } from './layout_action_factories.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';

/** Layout surface used to build outliner and toolbar shell actions. */
export interface LayoutShellActionSource {
  selectionManager: ManagerSelection;
  commandStack: CommandStack;
  hierarchyReparentHandler: HandlerHierarchyReparent;
  objectActionHandler: HandlerObjectAction;
  outlinerPanel: PanelOutliner;
  textureLock: TextureLockSettings;
  userSnapEnabled: boolean;
  primitiveCreationHandler: HandlerPrimitiveCreation;
  csgActionHandler: HandlerCsgAction;
  snapSettingsController: ControllerSnapSettings;
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
  onToggleSolidModelPanel: () => void;
  onToggleSettingsDialog: () => void;
  onOpenDocumentation: () => void;
  onOpenAboutDialog: () => void;
  onOpenMcpDialog: () => void;
  onOpenDetachedViewport: () => void;
  onToggleAiCaptureDebugPanel: () => void;
  onToggleAudio: () => void;
  onDeleteSelected: () => void;
  onGroupSelected: () => void;
  onNewScene: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onImportVmf: () => void;
  onImportObj: () => void;
  onExportGlb: () => void;
  onExportObj: () => void;
  onExportFbx: () => void;
  getShortcutLabel: (action: 'save' | 'load' | 'export_glb') => string;
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
    getSnapSettingsController: () => source.snapSettingsController,
    onAddTerrain: () => source.onAddTerrain(),
    onAddSolidModel: () => source.onAddSolidModel(),
    onUndo: () => source.onUndo(),
    onRedo: () => source.onRedo(),
    onToggleUvEditor: () => source.onToggleUvEditor(),
    onToggleTextureBrowser: () => source.onToggleTextureBrowser(),
    onToggleSolidModelPanel: () => source.onToggleSolidModelPanel(),
    onToggleSettingsDialog: () => source.onToggleSettingsDialog(),
    onOpenDocumentation: () => source.onOpenDocumentation(),
    onOpenAboutDialog: () => source.onOpenAboutDialog(),
    onOpenMcpDialog: () => source.onOpenMcpDialog(),
    onOpenDetachedViewport: () => source.onOpenDetachedViewport(),
    onToggleAiCaptureDebugPanel: () => source.onToggleAiCaptureDebugPanel(),
    onToggleAudio: () => source.onToggleAudio(),
    onDeleteSelected: () => source.onDeleteSelected(),
    onGroupSelected: () => source.onGroupSelected(),
    onNewScene: () => source.onNewScene(),
    onSaveScene: () => source.onSaveScene(),
    onLoadScene: () => source.onLoadScene(),
    onImportVmf: () => source.onImportVmf(),
    onImportObj: () => source.onImportObj(),
    onExportGlb: () => source.onExportGlb(),
    onExportObj: () => source.onExportObj(),
    onExportFbx: () => source.onExportFbx(),
    getShortcutLabel: (action) => source.getShortcutLabel(action),
    onSetTransformSpaceGlobal: () => source.onSetTransformSpaceGlobal(),
    onSetTransformSpaceLocal: () => source.onSetTransformSpaceLocal(),
    isTransformSpaceLocal: () => source.isTransformSpaceLocal(),
  });
}
