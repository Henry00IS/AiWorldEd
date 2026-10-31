import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { CommandStack } from '@/commands/command_stack.js';
import type { HandlerHierarchyReparent } from '@/outliner/hierarchy/handler_hierarchy_reparent.js';
import type { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import type { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import type { HandlerPrimitiveCreation } from '@/tools/creation/handler_primitive_creation.js';
import type { HandlerCsgAction } from '@/tools/csg/handler_csg_action.js';
import type { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import type { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import type { LayoutShellSourceHost } from './layout_shell_source.js';

/**
 * Callback surface required to build a late-bound shell source host without
 * exposing private layout manager methods.
 */
export interface LayoutShellHostCallbacks {
  selectionManager: ManagerSelection;
  commandStack: CommandStack;
  hierarchyReparentHandler: HandlerHierarchyReparent;
  outlinerPanel: PanelOutliner;
  textureLock: TextureLockSettings;
  userSnapEnabled: boolean;
  objectActionHandler: HandlerObjectAction;
  primitiveCreationHandler: HandlerPrimitiveCreation;
  csgActionHandler: HandlerCsgAction;
  snapSettingsController: ControllerSnapSettings;
  refreshOutliner(): void;
  refreshAfterWorldMutation(): void;
  showStatusMessage(message: string): void;
  onSelectionChanged(): void;
  onToggleUvEditor(): void;
  onToggleTextureBrowser(): void;
  onToggleSolidModelPanel(): void;
  onToggleSettingsDialog(): void;
  onOpenDocumentation(): void;
  onOpenAboutDialog(): void;
  onOpenMcpDialog(): void;
  onOpenDetachedViewport(): void;
  onToggleAiCaptureDebugPanel(): void;
  onToggleAudio(): void;
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
  onImportObj(): void;
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
    selectionManager: ManagerSelection;
    commandStack: CommandStack;
    hierarchyReparentHandler: HandlerHierarchyReparent;
    outlinerPanel: PanelOutliner;
    textureLock: TextureLockSettings;
    userSnapEnabled: boolean;
    objectActionHandler: HandlerObjectAction;
    primitiveCreationHandler: HandlerPrimitiveCreation;
    csgActionHandler: HandlerCsgAction;
    snapSettingsController: ControllerSnapSettings;
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
    get snapSettingsController() {
      return layout.snapSettingsController;
    },
    refreshOutliner: () => actions.refreshOutliner(),
    refreshAfterWorldMutation: () => actions.refreshAfterWorldMutation(),
    showStatusMessage: (message) => actions.showStatusMessage(message),
    onSelectionChanged: () => actions.onSelectionChanged(),
    onToggleUvEditor: () => actions.onToggleUvEditor(),
    onToggleTextureBrowser: () => actions.onToggleTextureBrowser(),
    onToggleSolidModelPanel: () => actions.onToggleSolidModelPanel(),
    onToggleSettingsDialog: () => actions.onToggleSettingsDialog(),
    onOpenDocumentation: () => actions.onOpenDocumentation(),
    onOpenAboutDialog: () => actions.onOpenAboutDialog(),
    onOpenMcpDialog: () => actions.onOpenMcpDialog(),
    onOpenDetachedViewport: () => actions.onOpenDetachedViewport(),
    onToggleAiCaptureDebugPanel: () => actions.onToggleAiCaptureDebugPanel(),
    onToggleAudio: () => actions.onToggleAudio(),
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
    onImportObj: () => actions.onImportObj(),
    onExportGlb: () => actions.onExportGlb(),
    onExportObj: () => actions.onExportObj(),
    onExportFbx: () => actions.onExportFbx(),
    getShortcutLabel: (action) => actions.getShortcutLabel(action),
  };
}
