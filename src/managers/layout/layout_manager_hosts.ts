import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { CommandStack } from '../../commands/command_stack.js';
import type { HierarchyReparentHandler } from '../hierarchy/hierarchy_reparent_handler.js';
import type { ObjectActionHandler } from '../hierarchy/object_action_handler.js';
import type { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import type { PrimitiveCreationHandler } from '../creation/primitive_creation_handler.js';
import type { CsgActionHandler } from '../tools/csg_action_handler.js';
import type { AlignmentHandler } from '../hierarchy/alignment_handler.js';
import type { SnapSettingsController } from '../tools/snap_settings_controller.js';
import type { OutlinerPanel } from '../../ui/outliner_panel.js';
import type { LayoutShellSourceHost } from './layout_shell_source.js';

/**
 * Callback surface required to build a late-bound shell source host without
 * exposing private layout manager methods.
 */
export interface LayoutShellHostCallbacks {
  selectionManager: SelectionManager;
  commandStack: CommandStack;
  hierarchyReparentHandler: HierarchyReparentHandler;
  outlinerPanel: OutlinerPanel;
  textureLock: TextureLockSettings;
  userSnapEnabled: boolean;
  objectActionHandler: ObjectActionHandler;
  primitiveCreationHandler: PrimitiveCreationHandler;
  csgActionHandler: CsgActionHandler;
  alignmentHandler: AlignmentHandler;
  snapSettingsController: SnapSettingsController;
  refreshOutliner(): void;
  refreshAfterWorldMutation(): void;
  showStatusMessage(message: string): void;
  onSelectionChanged(): void;
  onToggleUvEditor(): void;
  onToggleTextureBrowser(): void;
  onToggleToolsPalette(): void;
  onToggleSolidModelPanel(): void;
  onToggleSettingsDialog(): void;
  onOpenDocumentation(): void;
  onOpenAboutDialog(): void;
  onOpenDetachedViewport(): void;
  onAddTerrain(): void;
  onAddSolidModel(): void;
  onUndo(): void;
  onRedo(): void;
  onDeleteSelected(): void;
  onGroupSelected(): void;
  onSetTransformSpaceGlobal(): void;
  onSetTransformSpaceLocal(): void;
  isTransformSpaceLocal(): boolean;
  onNewScene(): void;
  onSaveScene(): void;
  onLoadScene(): void;
  onImportVmf(): void;
  onExportGlb(): void;
  onExportObj(): void;
  onExportFbx(): void;
  getShortcutLabel(action: 'save' | 'load' | 'export_glb'): string;
}

/**
 * Builds a late-bound shell source host using getters that read the current
 * layout field values on each access.
 *
 * @param layout Object whose properties are read live (typically the manager).
 * @param actions Action callbacks bound to the layout manager.
 * @returns Shell source host.
 */
export function createShellSourceHostFromLayout(
  layout: {
    selectionManager: SelectionManager;
    commandStack: CommandStack;
    hierarchyReparentHandler: HierarchyReparentHandler;
    outlinerPanel: OutlinerPanel;
    textureLock: TextureLockSettings;
    userSnapEnabled: boolean;
    objectActionHandler: ObjectActionHandler;
    primitiveCreationHandler: PrimitiveCreationHandler;
    csgActionHandler: CsgActionHandler;
    alignmentHandler: AlignmentHandler;
    snapSettingsController: SnapSettingsController;
  },
  actions: Omit<
    LayoutShellHostCallbacks,
    | 'selectionManager'
    | 'commandStack'
    | 'hierarchyReparentHandler'
    | 'outlinerPanel'
    | 'textureLock'
    | 'userSnapEnabled'
    | 'objectActionHandler'
    | 'primitiveCreationHandler'
    | 'csgActionHandler'
    | 'alignmentHandler'
    | 'snapSettingsController'
  >,
): LayoutShellSourceHost {
  return {
    get selectionManager() {
      return layout.selectionManager;
    },
    get commandStack() {
      return layout.commandStack;
    },
    get hierarchyReparentHandler() {
      return layout.hierarchyReparentHandler;
    },
    get outlinerPanel() {
      return layout.outlinerPanel;
    },
    get textureLock() {
      return layout.textureLock;
    },
    get userSnapEnabled() {
      return layout.userSnapEnabled;
    },
    get objectActionHandler() {
      return layout.objectActionHandler;
    },
    get primitiveCreationHandler() {
      return layout.primitiveCreationHandler;
    },
    get csgActionHandler() {
      return layout.csgActionHandler;
    },
    get alignmentHandler() {
      return layout.alignmentHandler;
    },
    get snapSettingsController() {
      return layout.snapSettingsController;
    },
    refreshOutliner: () => actions.refreshOutliner(),
    refreshAfterWorldMutation: () => actions.refreshAfterWorldMutation(),
    showStatusMessage: (message) => actions.showStatusMessage(message),
    onSelectionChanged: () => actions.onSelectionChanged(),
    onToggleUvEditor: () => actions.onToggleUvEditor(),
    onToggleTextureBrowser: () => actions.onToggleTextureBrowser(),
    onToggleToolsPalette: () => actions.onToggleToolsPalette(),
    onToggleSolidModelPanel: () => actions.onToggleSolidModelPanel(),
    onToggleSettingsDialog: () => actions.onToggleSettingsDialog(),
    onOpenDocumentation: () => actions.onOpenDocumentation(),
    onOpenAboutDialog: () => actions.onOpenAboutDialog(),
    onOpenDetachedViewport: () => actions.onOpenDetachedViewport(),
    onAddTerrain: () => actions.onAddTerrain(),
    onAddSolidModel: () => actions.onAddSolidModel(),
    onUndo: () => actions.onUndo(),
    onRedo: () => actions.onRedo(),
    onDeleteSelected: () => actions.onDeleteSelected(),
    onGroupSelected: () => actions.onGroupSelected(),
    onSetTransformSpaceGlobal: () => actions.onSetTransformSpaceGlobal(),
    onSetTransformSpaceLocal: () => actions.onSetTransformSpaceLocal(),
    isTransformSpaceLocal: () => actions.isTransformSpaceLocal(),
    onNewScene: () => actions.onNewScene(),
    onSaveScene: () => actions.onSaveScene(),
    onLoadScene: () => actions.onLoadScene(),
    onImportVmf: () => actions.onImportVmf(),
    onExportGlb: () => actions.onExportGlb(),
    onExportObj: () => actions.onExportObj(),
    onExportFbx: () => actions.onExportFbx(),
    getShortcutLabel: (action) => actions.getShortcutLabel(action),
  };
}
