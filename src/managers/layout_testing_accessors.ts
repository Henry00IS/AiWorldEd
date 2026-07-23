import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SelectionManager } from './selection_manager.js';
import { PrimitiveCreationTool } from './primitive_creation_tool.js';
import { Toolbar } from '../ui/toolbar.js';
import { OutlinerPanel } from '../ui/outliner_panel.js';
import { PropertiesPanel } from '../ui/properties_panel.js';
import { TransformGizmo } from '../transform/transform_gizmo.js';
import { TransformHandler } from '../transform/transform_handler.js';
import { TransformExecutor } from '../transform/transform_executor.js';
import { GridSnap } from '../transform/grid_snap.js';
import { CommandStack } from '../commands/command_stack.js';
import { StatusBar } from '../ui/status_bar.js';
import { FaceModeCoordinator } from './face_mode_coordinator.js';
import { SelectionMode } from '../types/selection_mode.js';

/**
 * Subsystems exposed for unit tests of the layout manager.
 */
export interface LayoutTestComponents {
  viewport3D: Viewport3D;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  selectionManager: SelectionManager;
  primitiveTool: PrimitiveCreationTool;
  toolbar: Toolbar;
  outlinerPanel: OutlinerPanel;
  transformGizmo: TransformGizmo;
  transformHandler: TransformHandler;
  gridSnap: GridSnap;
  propertiesPanel: PropertiesPanel;
  transformExecutor: TransformExecutor;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  faceExtrusionController: ReturnType<
    FaceModeCoordinator['getFaceExtrusionController']
  >;
  selectionMode: SelectionMode;
}

/**
 * Builds the testing component bag from live layout subsystems.
 * @param parts Live layout references.
 * @returns Object suitable for getComponentsForTesting.
 */
export function buildLayoutTestComponents(parts: {
  viewport3D: Viewport3D;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  selectionManager: SelectionManager;
  primitiveTool: PrimitiveCreationTool;
  toolbar: Toolbar;
  outlinerPanel: OutlinerPanel;
  transformGizmo: TransformGizmo;
  transformHandler: TransformHandler;
  gridSnap: GridSnap;
  propertiesPanel: PropertiesPanel;
  transformExecutor: TransformExecutor;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  faceModeCoordinator: FaceModeCoordinator;
}): LayoutTestComponents {
  return {
    viewport3D: parts.viewport3D,
    viewport2DTop: parts.viewport2DTop,
    viewport2DFront: parts.viewport2DFront,
    viewport2DSide: parts.viewport2DSide,
    selectionManager: parts.selectionManager,
    primitiveTool: parts.primitiveTool,
    toolbar: parts.toolbar,
    outlinerPanel: parts.outlinerPanel,
    transformGizmo: parts.transformGizmo,
    transformHandler: parts.transformHandler,
    gridSnap: parts.gridSnap,
    propertiesPanel: parts.propertiesPanel,
    transformExecutor: parts.transformExecutor,
    commandStack: parts.commandStack,
    statusBar: parts.statusBar,
    faceExtrusionController:
      parts.faceModeCoordinator.getFaceExtrusionController(),
    selectionMode: parts.faceModeCoordinator.getSelectionMode()
  };
}
