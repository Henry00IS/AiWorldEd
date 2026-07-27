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
import { mergeLayoutShellActionSourceParts, type LayoutShellActionSource } from './layout_shell_action_builders.js';

/**
 * Late-bound layout surface used to assemble shell action callbacks after the
 * DOM shell exists but before all handlers are constructed.
 */
export interface LayoutShellSourceHost {
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
 * Builds a late-bound shell action source so handlers may be wired after the
 * shell. Merges property descriptors so getters stay live (object spread would
 * snapshot undefined handlers at shell-build time).
 *
 * @param host Layout manager surface.
 * @returns Layout shell action surface.
 */
export function buildLayoutShellActionSource(host: LayoutShellSourceHost): LayoutShellActionSource {
  return mergeLayoutShellActionSourceParts(
    buildShellCoreFields(host),
    buildShellHandlerFields(host),
    buildShellPanelCallbacks(host),
    buildShellEditCallbacks(host),
    buildShellIoCallbacks(host),
  );
}

/**
 * Late-bound core manager fields for shell actions.
 *
 * @param host Layout manager surface.
 * @returns Core field getters.
 */
function buildShellCoreFields(
  host: LayoutShellSourceHost,
): Pick<
  LayoutShellActionSource,
  'selectionManager' | 'commandStack' | 'hierarchyReparentHandler' | 'outlinerPanel' | 'textureLock' | 'userSnapEnabled'
> {
  return {
    get selectionManager() {
      return host.selectionManager;
    },
    get commandStack() {
      return host.commandStack;
    },
    get hierarchyReparentHandler() {
      return host.hierarchyReparentHandler;
    },
    get outlinerPanel() {
      return host.outlinerPanel;
    },
    get textureLock() {
      return host.textureLock;
    },
    get userSnapEnabled() {
      return host.userSnapEnabled;
    },
  };
}

/**
 * Late-bound action handler fields for shell actions.
 *
 * @param host Layout manager surface.
 * @returns Handler field getters.
 */
function buildShellHandlerFields(
  host: LayoutShellSourceHost,
): Pick<
  LayoutShellActionSource,
  | 'objectActionHandler'
  | 'primitiveCreationHandler'
  | 'csgActionHandler'
  | 'alignmentHandler'
  | 'snapSettingsController'
> {
  return {
    get objectActionHandler() {
      return host.objectActionHandler;
    },
    get primitiveCreationHandler() {
      return host.primitiveCreationHandler;
    },
    get csgActionHandler() {
      return host.csgActionHandler;
    },
    get alignmentHandler() {
      return host.alignmentHandler;
    },
    get snapSettingsController() {
      return host.snapSettingsController;
    },
  };
}

/**
 * Panel/toggle callbacks for shell actions.
 *
 * @param host Layout manager surface.
 * @returns Panel-related callbacks.
 */
function buildShellPanelCallbacks(
  host: LayoutShellSourceHost,
): Pick<
  LayoutShellActionSource,
  | 'refreshOutliner'
  | 'syncPrimitivesToViewports'
  | 'showStatusMessage'
  | 'onSelectionChanged'
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
    refreshOutliner: () => host.refreshOutliner(),
    syncPrimitivesToViewports: () => host.refreshAfterWorldMutation(),
    showStatusMessage: (message) => host.showStatusMessage(message),
    onSelectionChanged: () => host.onSelectionChanged(),
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
 * Edit/history/create callbacks for shell actions.
 *
 * @param host Layout manager surface.
 * @returns Edit-related callbacks.
 */
function buildShellEditCallbacks(
  host: LayoutShellSourceHost,
): Pick<
  LayoutShellActionSource,
  | 'onAddTerrain'
  | 'onAddSolidModel'
  | 'onUndo'
  | 'onRedo'
  | 'onDeleteSelected'
  | 'onGroupSelected'
  | 'onSetTransformSpaceGlobal'
  | 'onSetTransformSpaceLocal'
  | 'isTransformSpaceLocal'
> {
  return {
    onAddTerrain: () => host.onAddTerrain(),
    onAddSolidModel: () => host.onAddSolidModel(),
    onUndo: () => host.onUndo(),
    onRedo: () => host.onRedo(),
    onDeleteSelected: () => host.onDeleteSelected(),
    onGroupSelected: () => host.onGroupSelected(),
    onSetTransformSpaceGlobal: () => host.onSetTransformSpaceGlobal(),
    onSetTransformSpaceLocal: () => host.onSetTransformSpaceLocal(),
    isTransformSpaceLocal: () => host.isTransformSpaceLocal(),
  };
}

/**
 * Scene I/O callbacks for shell actions.
 *
 * @param host Layout manager surface.
 * @returns Save/load/import/export callbacks.
 */
function buildShellIoCallbacks(
  host: LayoutShellSourceHost,
): Pick<
  LayoutShellActionSource,
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
