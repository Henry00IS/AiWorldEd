import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { SelectionManager } from './selection_manager.js';
import { SolidModelPanel } from '../ui/solid_model_panel.js';
import { SolidModelController } from './solid_model_controller.js';
import { PropertiesPanel } from '../ui/properties_panel.js';
import { SolidOperation } from '../solid/types/solid_operation.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';

/**
 * Host callbacks used while wiring the solid model panel and controller.
 */
export interface SolidModelLayoutHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  propertiesPanel: PropertiesPanel;
  toolbarContainer: HTMLElement;
  solidPanelAnchor: HTMLElement;
  viewportSyncManager: ViewportSyncManager;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatusMessage: (message: string) => void;
}

/**
 * Result of solid model UI wiring.
 */
export interface SolidModelLayoutSetup {
  solidModelPanel: SolidModelPanel;
  solidModelController: SolidModelController;
}

/**
 * Creates the solid model floating panel, controller, and property handlers.
 * @param host Layout host providing scene and UI dependencies.
 * @returns Panel and controller instances.
 */
export function setupSolidModelLayout(
  host: SolidModelLayoutHost
): SolidModelLayoutSetup {
  const solidModelPanel = new SolidModelPanel(
    host.toolbarContainer,
    {
      onAddBoxBrush: () => solidModelController.addBoxBrush()
    },
    host.solidPanelAnchor
  );
  const solidModelController = new SolidModelController(
    host.worldObject,
    host.commandStack,
    host.selectionManager,
    solidModelPanel
  );
  wireSolidModelController(host, solidModelController);
  wireSolidBrushPropertyHandlers(host.propertiesPanel, solidModelController);
  return { solidModelPanel, solidModelController };
}

/**
 * Connects solid controller callbacks to the layout host.
 * @param host Layout host.
 * @param controller Solid model controller.
 */
function wireSolidModelController(
  host: SolidModelLayoutHost,
  controller: SolidModelController
): void {
  controller.setSyncViewports(() => host.refreshAfterWorldMutation());
  controller.setRefreshOutliner(() => host.refreshOutliner());
  controller.setShowStatus((message) => host.showStatusMessage(message));
  controller.setOnLiveGeometryUpdated((resultMeshes) => {
    host.viewportSyncManager.syncMeshGeometriesToClones(resultMeshes);
  });
}

/**
 * Wires inspector solid-brush controls to the controller.
 * @param propertiesPanel Properties panel instance.
 * @param controller Solid model controller.
 */
function wireSolidBrushPropertyHandlers(
  propertiesPanel: PropertiesPanel,
  controller: SolidModelController
): void {
  propertiesPanel.setSolidBrushHandlers({
    onSetOperation: (meshes: THREE.Mesh[], operation: SolidOperation) =>
      controller.setBrushOperationForMeshes(meshes, operation),
    onBrushEdited: (meshes: THREE.Mesh[]) =>
      controller.onTransformsCommitted(meshes),
    onAddBoxBrush: () => controller.addBoxBrush()
  });
}
