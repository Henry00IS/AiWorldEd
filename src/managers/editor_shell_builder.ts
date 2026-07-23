import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SelectionManager } from './selection_manager.js';
import { HierarchyReparentHandler } from './hierarchy_reparent_handler.js';
import { Toolbar } from '../ui/toolbar.js';
import { ToolbarIcons } from '../ui/toolbar_icons.js';
import { OutlinerPanel } from '../ui/outliner_panel.js';
import { PropertiesPanel } from '../ui/properties_panel.js';
import { StatusBar } from '../ui/status_bar.js';
import { CommandStack } from '../commands/command_stack.js';
import { GridSnap } from '../transform/grid_snap.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { RenameCommand } from '../commands/rename_command.js';
import { ToggleVisibilityCommand } from '../commands/toggle_visibility_command.js';
import { ObjectActionHandler } from './object_action_handler.js';
import {
  isObjectOrAncestorLocked,
  toggleObjectLocked
} from '../utils/object_lock.js';

/**
 * Callbacks the shell builder needs from the layout manager for outliner actions.
 */
export interface EditorShellOutlinerActions {
  onDuplicateFromOutliner: (obj: THREE.Object3D) => void;
  onDeleteFromOutliner: (obj: THREE.Object3D) => void;
  onGroupFromOutliner: (objects: THREE.Object3D[]) => void;
  onUngroupFromOutliner: (group: THREE.Group) => void;
  onRenameFromOutliner: (obj: THREE.Object3D, newName: string) => void;
  onToggleVisibilityFromOutliner: (obj: THREE.Object3D) => void;
  onToggleLockFromOutliner: (obj: THREE.Object3D) => void;
  reparentFromDrop: (dragged: THREE.Object3D, target: THREE.Object3D) => void;
  syncViewports: () => void;
  refreshOutliner: () => void;
  showStatusMessage: (message: string) => void;
}

/**
 * Toolbar action callbacks bound when toolbar buttons are created.
 */
export interface EditorToolbarActions {
  onAddCube: () => void;
  onAddSphere: () => void;
  onAddCylinder: () => void;
  onAddPlane: () => void;
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
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onCsgUnion: () => void;
  onCsgSubtract: () => void;
  onCsgIntersect: () => void;
  onToggleSnap: () => void;
  onSnapIntervalBackward: () => void;
  onSnapIntervalForward: () => void;
  onToggleTextureLock: () => void;
  onAlignToOrigin: () => void;
  onAlignToGridCenter: () => void;
  onAlignToObject: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onImportVmf: () => void;
  onExportGlb: () => void;
  isUserSnapEnabled: () => boolean;
  isTextureLockEnabled: () => boolean;
}

/**
 * Result of building the main editor shell DOM structure.
 */
export interface EditorShellElements {
  toolbarContainer: HTMLElement;
  mainLayout: HTMLElement;
  viewportArea: HTMLElement;
  viewports: HTMLElement[];
  toolbar: Toolbar;
  outlinerPanel: OutlinerPanel;
  propertiesPanel: PropertiesPanel;
  statusBar: StatusBar;
}

/**
 * Builds the editor DOM shell: toolbar, viewport grid, outliner, properties, status bar.
 */
export class EditorShellBuilder {
  /**
   * Builds and appends the full editor shell under the given container.
   * @param editorContainer Root DOM element for the editor UI.
   * @param selectionManager Shared selection manager.
   * @param worldObject Root scene hierarchy group.
   * @param commandStack Undo/redo stack for properties and status.
   * @param gridSnap Grid snap for initial status bar values.
   * @param textureLock Texture lock for properties panel wiring.
   * @param hierarchyReparentHandler Handler for outliner reparent drops.
   * @param outlinerActions Outliner context and rename/visibility actions.
   * @param toolbarActions Callbacks for all primary toolbar buttons.
   * @returns Created shell elements and UI components.
   */
  build(
    editorContainer: HTMLElement,
    selectionManager: SelectionManager,
    worldObject: THREE.Group,
    commandStack: CommandStack,
    gridSnap: GridSnap,
    textureLock: TextureLockSettings,
    hierarchyReparentHandler: HierarchyReparentHandler,
    outlinerActions: EditorShellOutlinerActions,
    toolbarActions: EditorToolbarActions
  ): EditorShellElements {
    const toolbarContainer = this.createToolbarContainer(editorContainer);
    const toolbar = new Toolbar(toolbarContainer);
    this.createToolbarButtons(toolbar, toolbarActions);
    const mainLayout = this.createMainLayout(toolbarContainer);
    const viewportArea = this.createViewportArea(mainLayout);
    const viewports = this.createViewportContainers(viewportArea);
    const outlinerPanel = this.createOutliner(
      mainLayout,
      selectionManager,
      worldObject,
      hierarchyReparentHandler,
      outlinerActions
    );
    const propertiesPanel = this.createPropertiesPanel(
      mainLayout,
      selectionManager,
      commandStack,
      textureLock
    );
    const statusBar = this.createStatusBar(toolbarContainer, gridSnap, commandStack);
    return {
      toolbarContainer,
      mainLayout,
      viewportArea,
      viewports,
      toolbar,
      outlinerPanel,
      propertiesPanel,
      statusBar
    };
  }

  /**
   * Creates and styles the root toolbar container element.
   * @param editorContainer Root editor container.
   * @returns The toolbar container element.
   */
  private createToolbarContainer(editorContainer: HTMLElement): HTMLElement {
    const toolbarContainer = document.createElement('div');
    toolbarContainer.style.display = 'flex';
    toolbarContainer.style.flexDirection = 'column';
    toolbarContainer.style.width = '100%';
    toolbarContainer.style.height = '100%';
    editorContainer.appendChild(toolbarContainer);
    return toolbarContainer;
  }

  /**
   * Creates and styles the main layout element that holds viewports and outliner.
   * @param toolbarContainer Parent flex column.
   * @returns The main layout element.
   */
  private createMainLayout(toolbarContainer: HTMLElement): HTMLElement {
    const mainLayout = document.createElement('div');
    mainLayout.style.display = 'flex';
    mainLayout.style.flex = '1';
    mainLayout.style.overflow = 'hidden';
    toolbarContainer.appendChild(mainLayout);
    return mainLayout;
  }

  /**
   * Creates and styles the viewport grid area element.
   * @param mainLayout Parent main layout.
   * @returns The viewport area element.
   */
  private createViewportArea(mainLayout: HTMLElement): HTMLElement {
    const viewportArea = document.createElement('div');
    viewportArea.style.display = 'grid';
    viewportArea.style.gridTemplateColumns = '1fr 1fr';
    viewportArea.style.gridTemplateRows = '1fr 1fr';
    viewportArea.style.gridTemplateAreas =
      '"top front"\n"side perspective"';
    viewportArea.style.background = `#${Theme.separatorColor.toString(16).padStart(6, '0')}`;
    viewportArea.style.gap = `${Theme.separatorGapPx}px`;
    viewportArea.style.padding = `${Theme.separatorGapPx}px`;
    viewportArea.style.flex = '1';
    viewportArea.style.overflow = 'hidden';
    mainLayout.appendChild(viewportArea);
    return viewportArea;
  }

  /**
   * Creates viewport container elements for each grid area.
   * @param viewportArea Parent grid container.
   * @returns Containers ordered top, front, side, perspective.
   */
  private createViewportContainers(viewportArea: HTMLElement): HTMLElement[] {
    return [
      this.createContainer(viewportArea, 'top'),
      this.createContainer(viewportArea, 'front'),
      this.createContainer(viewportArea, 'side'),
      this.createContainer(viewportArea, 'perspective')
    ];
  }

  /**
   * Creates a viewport container element for a grid area.
   * @param viewportArea Parent grid container.
   * @param area The grid area name for the viewport.
   * @returns The created container element.
   */
  private createContainer(viewportArea: HTMLElement, area: string): HTMLElement {
    const el = document.createElement('div');
    el.style.gridArea = area;
    el.style.overflow = 'hidden';
    el.style.position = 'relative';
    viewportArea.appendChild(el);
    return el;
  }

  /**
   * Creates the outliner panel and registers context callbacks.
   * @param mainLayout Parent layout.
   * @param selectionManager Shared selection manager.
   * @param worldObject Root hierarchy group.
   * @param hierarchyReparentHandler Reparent drop handler.
   * @param outlinerActions Outliner action callbacks.
   * @returns Configured OutlinerPanel.
   */
  private createOutliner(
    mainLayout: HTMLElement,
    selectionManager: SelectionManager,
    worldObject: THREE.Group,
    hierarchyReparentHandler: HierarchyReparentHandler,
    outlinerActions: EditorShellOutlinerActions
  ): OutlinerPanel {
    const outlinerPanel = new OutlinerPanel(
      mainLayout,
      selectionManager,
      worldObject
    );
    outlinerPanel.setContextCallbacks(
      (mesh) => outlinerActions.onDuplicateFromOutliner(mesh),
      (mesh) => outlinerActions.onDeleteFromOutliner(mesh)
    );
    outlinerPanel.setGroupCallback(
      (objects) => outlinerActions.onGroupFromOutliner(objects)
    );
    outlinerPanel.setUngroupCallback(
      (group) => outlinerActions.onUngroupFromOutliner(group)
    );
    outlinerPanel.setRenameCallback(
      (obj, newName) => outlinerActions.onRenameFromOutliner(obj, newName)
    );
    outlinerPanel.setVisibilityCallback(
      (obj) => outlinerActions.onToggleVisibilityFromOutliner(obj)
    );
    outlinerPanel.setLockCallback(
      (obj) => outlinerActions.onToggleLockFromOutliner(obj)
    );
    hierarchyReparentHandler.setSyncViewports(() => outlinerActions.syncViewports());
    hierarchyReparentHandler.setRefreshOutliner(() => outlinerActions.refreshOutliner());
    hierarchyReparentHandler.setShowStatus(
      (message) => outlinerActions.showStatusMessage(message)
    );
    outlinerPanel.setReparentCallback((dragged, target) =>
      outlinerActions.reparentFromDrop(dragged, target)
    );
    return outlinerPanel;
  }

  /**
   * Creates the properties panel and wires command stack and texture lock.
   * @param mainLayout Parent layout.
   * @param selectionManager Shared selection manager.
   * @param commandStack Undo stack for property edits.
   * @param textureLock Texture lock settings.
   * @returns Configured PropertiesPanel.
   */
  private createPropertiesPanel(
    mainLayout: HTMLElement,
    selectionManager: SelectionManager,
    commandStack: CommandStack,
    textureLock: TextureLockSettings
  ): PropertiesPanel {
    const propertiesPanel = new PropertiesPanel(
      mainLayout,
      Theme,
      selectionManager
    );
    propertiesPanel.setCommandStack(commandStack);
    propertiesPanel.setTextureLockSettings(textureLock);
    return propertiesPanel;
  }

  /**
   * Creates the status bar and binds command stack updates to it.
   * @param toolbarContainer Parent flex column.
   * @param gridSnap Snap source for initial status values.
   * @param commandStack Undo stack for count updates.
   * @returns Configured StatusBar.
   */
  private createStatusBar(
    toolbarContainer: HTMLElement,
    gridSnap: GridSnap,
    commandStack: CommandStack
  ): StatusBar {
    const statusBar = new StatusBar(toolbarContainer, Theme);
    statusBar.setUndoRedoCounts(0, 0);
    statusBar.setTransformMode('Bounds');
    statusBar.setSnapInterval(gridSnap.getInterval());
    statusBar.setSnapStatus(gridSnap.isEnabled());
    commandStack.onStackChanged((undoCount, redoCount) => {
      statusBar.setUndoRedoCounts(undoCount, redoCount);
    });
    return statusBar;
  }

  /**
   * Creates the modern top toolbar: menus, history, snap, and panel toggles.
   * Transform modes live in the Tools palette (object-select context).
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private createToolbarButtons(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    this.addMenuControls(toolbar, actions);
    this.addHistoryControls(toolbar, actions);
    this.addPrimitiveControls(toolbar, actions);
    this.addSnapControls(toolbar, actions);
    this.addPanelToggleControls(toolbar, actions);
  }

  /**
   * Adds primary menu dropdowns (File, Edit, Add, CSG, Align).
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addMenuControls(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    toolbar.addDropdown('File', [
      { label: 'Save', onClick: () => actions.onSaveScene() },
      { label: 'Load', onClick: () => actions.onLoadScene() },
      { label: 'Import VMF…', onClick: () => actions.onImportVmf() },
      { label: 'Export GLB', onClick: () => actions.onExportGlb() }
    ]);
    toolbar.addDropdown('Edit', [
      { label: 'Delete', onClick: () => actions.onDeleteSelected() },
      { label: 'Duplicate', onClick: () => actions.onDuplicateSelected() },
      { label: 'Group', onClick: () => actions.onGroupSelected() },
      { label: 'Ungroup', onClick: () => actions.onUngroupSelected() }
    ]);
    toolbar.addDropdown('Add', [
      { label: 'Cube', onClick: () => actions.onAddCube() },
      { label: 'Sphere', onClick: () => actions.onAddSphere() },
      { label: 'Cylinder', onClick: () => actions.onAddCylinder() },
      { label: 'Plane', onClick: () => actions.onAddPlane() },
      { label: 'Terrain', onClick: () => actions.onAddTerrain() },
      { label: 'Solid Model', onClick: () => actions.onAddSolidModel() }
    ]);
    toolbar.addDropdown('CSG', [
      { label: 'Union', onClick: () => actions.onCsgUnion() },
      { label: 'Subtract', onClick: () => actions.onCsgSubtract() },
      { label: 'Intersect', onClick: () => actions.onCsgIntersect() }
    ]);
    toolbar.addDropdown('Align', [
      { label: 'Origin', onClick: () => actions.onAlignToOrigin() },
      { label: 'Grid Center', onClick: () => actions.onAlignToGridCenter() },
      { label: 'To Object', onClick: () => actions.onAlignToObject() }
    ]);
  }

  /**
   * Adds undo/redo icon controls.
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addHistoryControls(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Undo', ToolbarIcons.undo(), () => actions.onUndo());
    toolbar.addIconButton('Redo', ToolbarIcons.redo(), () => actions.onRedo());
  }

  /**
   * Adds one-click primitive creation icons (faster than the Add menu).
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addPrimitiveControls(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Add Cube', ToolbarIcons.primitiveCube(), () =>
      actions.onAddCube()
    );
    toolbar.addIconButton('Add Sphere', ToolbarIcons.primitiveSphere(), () =>
      actions.onAddSphere()
    );
    toolbar.addIconButton('Add Cylinder', ToolbarIcons.primitiveCylinder(), () =>
      actions.onAddCylinder()
    );
    toolbar.addIconButton('Add Plane', ToolbarIcons.primitivePlane(), () =>
      actions.onAddPlane()
    );
    toolbar.addIconButton('Add Terrain', ToolbarIcons.primitiveTerrain(), () =>
      actions.onAddTerrain()
    );
    toolbar.addIconButton('Add Solid Model', ToolbarIcons.solidModel(), () =>
      actions.onAddSolidModel()
    );
  }

  /**
   * Adds snap and texture-lock controls.
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addSnapControls(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Snap', ToolbarIcons.snap(), () => actions.onToggleSnap());
    toolbar.setButtonActiveByLabel('Snap', actions.isUserSnapEnabled());
    toolbar.addButton('−', () => actions.onSnapIntervalBackward()).title =
      'Decrease snap interval';
    toolbar.addButton('+', () => actions.onSnapIntervalForward()).title =
      'Increase snap interval';
    toolbar.addButton('Tex Lock', () => actions.onToggleTextureLock());
    toolbar.setButtonActiveByLabel('Tex Lock', actions.isTextureLockEnabled());
  }

  /**
   * Adds floating panel toggle icons (UV, textures, tools) and About.
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addPanelToggleControls(
    toolbar: Toolbar,
    actions: EditorToolbarActions
  ): void {
    toolbar.addSeparator();
    toolbar.addIconButton(
      'UV Editor',
      ToolbarIcons.uvEditor(),
      () => actions.onToggleUvEditor()
    );
    toolbar.addIconButton(
      'Texture Browser',
      ToolbarIcons.textureBrowser(),
      () => actions.onToggleTextureBrowser()
    );
    toolbar.addIconButton(
      'Tools',
      ToolbarIcons.toolsPanel(),
      () => actions.onToggleToolsPalette()
    );
    toolbar.addIconButton(
      'Solid Model',
      ToolbarIcons.solidModel(),
      () => actions.onToggleSolidModelPanel()
    );
    toolbar.addSeparator();
    toolbar.addIconButton(
      'About',
      ToolbarIcons.about(),
      () => actions.onOpenAboutDialog()
    );
  }
}

/**
 * Applies outliner rename via command stack.
 * @param commandStack Undo stack.
 * @param obj Object to rename.
 * @param newName Requested name.
 * @param refreshOutliner Callback after rename.
 */
export function applyOutlinerRename(
  commandStack: CommandStack,
  obj: THREE.Object3D,
  newName: string,
  refreshOutliner: () => void
): void {
  if (newName.trim().length === 0) return;
  if (isObjectOrAncestorLocked(obj)) return;
  commandStack.push(new RenameCommand(obj, newName));
  refreshOutliner();
}

/**
 * Toggles outliner lock state on an object and refreshes the tree.
 * @param obj Object whose lock flag toggles.
 * @param refreshOutliner Callback after toggle.
 * @param showStatusMessage Optional status feedback.
 * @returns True when the object is now locked.
 */
export function applyOutlinerLockToggle(
  obj: THREE.Object3D,
  refreshOutliner: () => void,
  showStatusMessage?: (message: string) => void
): boolean {
  const locked = toggleObjectLocked(obj);
  refreshOutliner();
  if (showStatusMessage) {
    const label = obj.name || 'Object';
    showStatusMessage(locked ? `Locked ${label}` : `Unlocked ${label}`);
  }
  return locked;
}

/**
 * Applies outliner visibility toggle via command stack.
 * @param commandStack Undo stack.
 * @param obj Object whose visibility toggles.
 * @param refreshOutliner Callback after toggle.
 */
export function applyOutlinerVisibilityToggle(
  commandStack: CommandStack,
  obj: THREE.Object3D,
  refreshOutliner: () => void
): void {
  commandStack.push(new ToggleVisibilityCommand(obj));
  refreshOutliner();
}

/**
 * Handles Duplicate from the outliner context menu.
 * @param obj Hierarchy object to duplicate.
 * @param selectionManager Selection manager.
 * @param objectActionHandler Object action handler.
 */
export function handleOutlinerDuplicate(
  obj: THREE.Object3D,
  selectionManager: SelectionManager,
  objectActionHandler: ObjectActionHandler
): void {
  if (obj instanceof THREE.Mesh) {
    selectionManager.selectObject(obj);
    objectActionHandler.onDuplicateSelected();
  }
}
