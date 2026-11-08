import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';

/** Host callbacks used while wiring the solid model panel and controller. */
export interface SolidModelLayoutHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  propertiesPanel: PanelProperties;
  toolbarContainer: HTMLElement;
  solidPanelAnchor: HTMLElement;
  /** Perspective viewport when present; solid spawn may fall back elsewhere. */
  viewport3D: Viewport3D | null;
  gridSnap: GridSnap;
  textureLock: TextureLockSettings;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  /**
   * Expands outliner ancestors and scrolls so the given hierarchy object is
   * visible (used after To First / To Last).
   *
   * @param object Mesh or hierarchy node to reveal.
   */
  revealOutlinerObject: (object: THREE.Object3D) => void;
  showStatusMessage: (message: string) => void;
}

/** Result of solid model UI wiring. */
export interface SolidModelLayoutSetup {
  solidModelPanel: SolidModelPanel;
  solidModelController: SolidModelController;
}

/**
 * Creates the solid model floating panel, controller, and property handlers.
 *
 * @param host Layout host providing scene and UI dependencies.
 * @returns Panel and controller instances.
 */
export function setupSolidModelLayout(host: SolidModelLayoutHost): SolidModelLayoutSetup {
  const solidModelPanel = new SolidModelPanel(
    host.toolbarContainer,
    {
      onAddBoxBrush: () => solidModelController.addBoxBrush(),
      onAddGenerator: (kind: string) => solidModelController.addGenerator(kind),
    },
    host.solidPanelAnchor,
  );
  const solidModelController = new SolidModelController(
    host.worldObject,
    host.commandStack,
    host.selectionManager,
    solidModelPanel,
  );
  wireSolidModelController(host, solidModelController);
  wireSolidBrushPropertyHandlers(host, solidModelController);
  return { solidModelPanel, solidModelController };
}

/**
 * Connects solid controller callbacks to the layout host.
 *
 * @param host Layout host.
 * @param controller Solid model controller.
 */
function wireSolidModelController(host: SolidModelLayoutHost, controller: SolidModelController): void {
  controller.setSyncViewports(() => host.refreshAfterWorldMutation());
  controller.setRefreshOutliner(() => host.refreshOutliner());
  controller.setRevealOutlinerObject((object) => host.revealOutlinerObject(object));
  controller.setShowStatus((message) => host.showStatusMessage(message));
  controller.setTextureLockSettings(host.textureLock);
  controller.setActiveCameraProvider(() => host.viewport3D?.getCamera() ?? null);
  controller.setGridIntervalProvider(() => host.gridSnap.getInterval());
  controller.setGridSnapProvider(() => host.gridSnap);
}

/**
 * Wires inspector solid-brush controls to the controller.
 *
 * @param host Layout host.
 * @param controller Solid model controller.
 */
function wireSolidBrushPropertyHandlers(host: SolidModelLayoutHost, controller: SolidModelController): void {
  host.propertiesPanel.setSolidBrushHandlers({
    onSetOperation: (meshes: THREE.Mesh[], operation: SolidOperation) =>
      controller.setBrushOperationForMeshes(meshes, operation),
    onSetGroupOperation: (groups: THREE.Group[], operation: SolidOperation) =>
      controller.setGroupOperationForGroups(groups, operation),
    onAddBoxBrush: () => controller.addBoxBrush(),
    onAddGenerator: (kind: string) => controller.addGenerator(kind),
    onMoveToFirst: (nodes: THREE.Object3D[]) => controller.moveBrushesInOrder(nodes, 'first'),
    onMoveToLast: (nodes: THREE.Object3D[]) => controller.moveBrushesInOrder(nodes, 'last'),
    onSetInvertedWorld: (inverted: boolean) => controller.setInvertedWorldForSelection(inverted),
    onSceneChanged: () => {
      host.selectionManager.pruneSelectionNotInScene(host.worldObject);
      host.refreshOutliner();
      host.refreshAfterWorldMutation();
    },
  });
}
