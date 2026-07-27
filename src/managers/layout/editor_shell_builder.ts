import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { HierarchyReparentHandler } from '../hierarchy/hierarchy_reparent_handler.js';
import { Toolbar } from '../../ui/toolbar.js';
import { ToolbarIcons } from '../../ui/toolbar_icons.js';
import { OutlinerPanel } from '../../ui/outliner_panel.js';
import { PropertiesPanel } from '../../ui/properties/properties_panel.js';
import { StatusBar } from '../../ui/status_bar.js';
import { CommandStack } from '../../commands/command_stack.js';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';

/**
 * Callbacks the shell builder needs from the layout manager for outliner
 * actions.
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

/** Toolbar action callbacks bound when toolbar buttons are created. */
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
  onToggleSettingsDialog: () => void;
  onOpenDocumentation: () => void;
  onOpenAboutDialog: () => void;
  onOpenDetachedViewport: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onCsgUnion: () => void;
  onCsgSubtract: () => void;
  onCsgIntersect: () => void;
  /** True when mesh CSG menu actions apply to the current selection. */
  canRunCsgBoolean: () => boolean;
  onToggleSnap: () => void;
  onSnapIntervalBackward: () => void;
  onSnapIntervalForward: () => void;
  onToggleTextureLock: () => void;
  onTogglePositionLock: () => void;
  onToggleStretchLock: () => void;
  onAlignToOrigin: () => void;
  onAlignToGridCenter: () => void;
  onAlignToObject: () => void;
  onNewScene: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onImportVmf: () => void;
  onExportGlb: () => void;
  onExportObj: () => void;
  onExportFbx: () => void;
  /** Resolves a live keyboard shortcut label for File menu items. */
  getShortcutLabel: (action: 'save' | 'load' | 'export_glb') => string;
  onSetTransformSpaceGlobal: () => void;
  onSetTransformSpaceLocal: () => void;
  isUserSnapEnabled: () => boolean;
  isTextureLockEnabled: () => boolean;
  isPositionLockEnabled: () => boolean;
  isStretchLockEnabled: () => boolean;
  isTransformSpaceLocal: () => boolean;
}

/** Result of building the main editor shell DOM structure. */
export interface EditorShellElements {
  toolbarContainer: HTMLElement;
  mainLayout: HTMLElement;
  /** Outer host for the shared WebGL canvas (not a CSS grid). */
  viewportArea: HTMLElement;
  /** Absolute grid layer that holds pane chrome containers. */
  viewportPaneGrid: HTMLElement;
  viewports: HTMLElement[];
  toolbar: Toolbar;
  outlinerPanel: OutlinerPanel;
  propertiesPanel: PropertiesPanel;
  statusBar: StatusBar;
}

/**
 * Builds the editor DOM shell: toolbar, viewport grid, outliner, properties,
 * status bar.
 */
export class EditorShellBuilder {
  /**
   * Builds and appends the full editor shell under the given container.
   *
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
    toolbarActions: EditorToolbarActions,
  ): EditorShellElements {
    const toolbarContainer = this.createToolbarContainer(editorContainer);
    const toolbar = new Toolbar(toolbarContainer);
    this.createToolbarButtons(toolbar, toolbarActions);
    const mainLayout = this.createMainLayout(toolbarContainer);
    const viewportShell = this.createViewportShell(mainLayout);
    const viewports = this.createViewportContainers(viewportShell.paneGrid);
    const outlinerPanel = this.createOutliner(
      mainLayout,
      selectionManager,
      worldObject,
      hierarchyReparentHandler,
      outlinerActions,
    );
    const propertiesPanel = this.createPropertiesPanel(mainLayout, selectionManager, commandStack, textureLock);
    const statusBar = this.createStatusBar(toolbarContainer, gridSnap, commandStack);
    return {
      toolbarContainer,
      mainLayout,
      viewportArea: viewportShell.host,
      viewportPaneGrid: viewportShell.paneGrid,
      viewports,
      toolbar,
      outlinerPanel,
      propertiesPanel,
      statusBar,
    };
  }

  /**
   * Creates and styles the root toolbar container element.
   *
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
   * Creates and styles the main layout element that holds viewports and
   * outliner.
   *
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
   * Creates the viewport workspace host and the absolute pane grid overlay. The
   * shared WebGL canvas is parented to the host so it is never a CSS grid item
   * (which previously collapsed it into a zero-height implicit track).
   *
   * @param mainLayout Parent main layout.
   * @returns Host for the canvas and grid layer for pane chrome.
   */
  private createViewportShell(mainLayout: HTMLElement): { host: HTMLElement; paneGrid: HTMLElement } {
    const host = this.createViewportHost();
    const paneGrid = this.createViewportPaneGrid();
    host.appendChild(paneGrid);
    mainLayout.appendChild(host);
    return { host, paneGrid };
  }

  /**
   * Creates the non-grid workspace host that owns the shared canvas.
   *
   * @returns Viewport workspace host element.
   */
  private createViewportHost(): HTMLElement {
    const host = document.createElement('div');
    host.classList.add('editor-viewport-area');
    host.style.position = 'relative';
    host.style.flex = '1';
    host.style.overflow = 'hidden';
    host.style.minWidth = '0';
    host.style.minHeight = '0';
    host.style.background = `#${Theme.separatorColor.toString(16).padStart(6, '0')}`;
    return host;
  }

  /**
   * Creates the absolute CSS grid layer for pane chrome containers.
   *
   * @returns Pane grid element.
   */
  private createViewportPaneGrid(): HTMLElement {
    const paneGrid = document.createElement('div');
    paneGrid.classList.add('editor-viewport-pane-grid');
    paneGrid.style.position = 'absolute';
    paneGrid.style.inset = '0';
    paneGrid.style.display = 'grid';
    paneGrid.style.gridTemplateColumns = '1fr 1fr';
    paneGrid.style.gridTemplateRows = '1fr 1fr';
    paneGrid.style.gridTemplateAreas = '"top front"\n"side perspective"';
    paneGrid.style.gap = `${Theme.separatorGapPx}px`;
    paneGrid.style.padding = `${Theme.separatorGapPx}px`;
    paneGrid.style.boxSizing = 'border-box';
    paneGrid.style.zIndex = '1';
    return paneGrid;
  }

  /**
   * Creates viewport container elements for each grid area.
   *
   * @param paneGrid Absolute grid layer that hosts pane chrome.
   * @returns Containers ordered top, front, side, perspective.
   */
  private createViewportContainers(paneGrid: HTMLElement): HTMLElement[] {
    return [
      this.createContainer(paneGrid, 'top'),
      this.createContainer(paneGrid, 'front'),
      this.createContainer(paneGrid, 'side'),
      this.createContainer(paneGrid, 'perspective'),
    ];
  }

  /**
   * Creates a viewport container element for a grid area.
   *
   * @param paneGrid Parent grid container.
   * @param area The grid area name for the viewport.
   * @returns The created container element.
   */
  private createContainer(paneGrid: HTMLElement, area: string): HTMLElement {
    const el = document.createElement('div');
    el.style.gridArea = area;
    el.style.overflow = 'hidden';
    el.style.position = 'relative';
    el.style.background = 'transparent';
    paneGrid.appendChild(el);
    return el;
  }

  /**
   * Creates the outliner panel and registers context callbacks.
   *
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
    outlinerActions: EditorShellOutlinerActions,
  ): OutlinerPanel {
    const outlinerPanel = new OutlinerPanel(mainLayout, selectionManager, worldObject);
    outlinerPanel.setContextCallbacks(
      (mesh) => outlinerActions.onDuplicateFromOutliner(mesh),
      (mesh) => outlinerActions.onDeleteFromOutliner(mesh),
    );
    outlinerPanel.setGroupCallback((objects) => outlinerActions.onGroupFromOutliner(objects));
    outlinerPanel.setUngroupCallback((group) => outlinerActions.onUngroupFromOutliner(group));
    outlinerPanel.setRenameCallback((obj, newName) => outlinerActions.onRenameFromOutliner(obj, newName));
    outlinerPanel.setVisibilityCallback((obj) => outlinerActions.onToggleVisibilityFromOutliner(obj));
    outlinerPanel.setLockCallback((obj) => outlinerActions.onToggleLockFromOutliner(obj));
    hierarchyReparentHandler.setSyncViewports(() => outlinerActions.syncViewports());
    hierarchyReparentHandler.setRefreshOutliner(() => outlinerActions.refreshOutliner());
    hierarchyReparentHandler.setShowStatus((message) => outlinerActions.showStatusMessage(message));
    outlinerPanel.setReparentCallback((dragged, target) => outlinerActions.reparentFromDrop(dragged, target));
    return outlinerPanel;
  }

  /**
   * Creates the properties panel and wires command stack and texture lock.
   *
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
    textureLock: TextureLockSettings,
  ): PropertiesPanel {
    const propertiesPanel = new PropertiesPanel(mainLayout, Theme, selectionManager);
    propertiesPanel.setCommandStack(commandStack);
    propertiesPanel.setTextureLockSettings(textureLock);
    return propertiesPanel;
  }

  /**
   * Creates the status bar and binds command stack updates to it.
   *
   * @param toolbarContainer Parent flex column.
   * @param gridSnap Snap source for initial status values.
   * @param commandStack Undo stack for count updates.
   * @returns Configured StatusBar.
   */
  private createStatusBar(toolbarContainer: HTMLElement, gridSnap: GridSnap, commandStack: CommandStack): StatusBar {
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
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private createToolbarButtons(toolbar: Toolbar, actions: EditorToolbarActions): void {
    this.addMenuControls(toolbar, actions);
    this.addHistoryControls(toolbar, actions);
    this.addPrimitiveControls(toolbar, actions);
    this.addSnapControls(toolbar, actions);
    this.addPanelToggleControls(toolbar, actions);
  }

  /**
   * Adds primary menu dropdowns (File, Edit, Add, CSG, Align).
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addMenuControls(toolbar: Toolbar, actions: EditorToolbarActions): void {
    this.addFileMenu(toolbar, actions);
    this.addEditMenu(toolbar, actions);
    this.addAddMenu(toolbar, actions);
    this.addCsgMenu(toolbar, actions);
    this.addAlignMenu(toolbar, actions);
  }

  /**
   * Adds the File menu with New, Save/Load, Import, and Export submenus.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addFileMenu(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addDropdown('File', [
      { label: 'New', onClick: () => actions.onNewScene() },
      { kind: 'separator' },
      {
        label: 'Save',
        onClick: () => actions.onSaveScene(),
        shortcut: () => actions.getShortcutLabel('save'),
      },
      {
        label: 'Load',
        onClick: () => actions.onLoadScene(),
        shortcut: () => actions.getShortcutLabel('load'),
      },
      { kind: 'separator' },
      {
        kind: 'submenu',
        label: 'Import',
        children: [
          {
            label: 'Valve Map Format 2006 (.vmf)…',
            onClick: () => actions.onImportVmf(),
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Export',
        children: [
          {
            label: 'Export GLTF (.glb)…',
            onClick: () => actions.onExportGlb(),
            shortcut: () => actions.getShortcutLabel('export_glb'),
          },
          {
            label: 'Wavefront OBJ/MTL (.obj)…',
            onClick: () => actions.onExportObj(),
          },
          {
            label: 'Autodesk FBX (.fbx)…',
            onClick: () => actions.onExportFbx(),
          },
        ],
      },
    ]);
  }

  /**
   * Adds the Edit menu (delete, duplicate, group, ungroup).
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addEditMenu(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addDropdown('Edit', [
      { label: 'Delete', onClick: () => actions.onDeleteSelected() },
      { label: 'Duplicate', onClick: () => actions.onDuplicateSelected() },
      { label: 'Group', onClick: () => actions.onGroupSelected() },
      { label: 'Ungroup', onClick: () => actions.onUngroupSelected() },
    ]);
  }

  /**
   * Adds the Add menu for primitives and solid models.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addAddMenu(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addDropdown('Add', [
      { label: 'Cube', onClick: () => actions.onAddCube() },
      { label: 'Sphere', onClick: () => actions.onAddSphere() },
      { label: 'Cylinder', onClick: () => actions.onAddCylinder() },
      { label: 'Plane', onClick: () => actions.onAddPlane() },
      { label: 'Terrain', onClick: () => actions.onAddTerrain() },
      { label: 'Solid Model', onClick: () => actions.onAddSolidModel() },
    ]);
  }

  /**
   * Adds the CSG boolean menu with enable gates.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addCsgMenu(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addDropdown('CSG', [
      {
        label: 'Union',
        onClick: () => actions.onCsgUnion(),
        isEnabled: () => actions.canRunCsgBoolean(),
      },
      {
        label: 'Subtract',
        onClick: () => actions.onCsgSubtract(),
        isEnabled: () => actions.canRunCsgBoolean(),
      },
      {
        label: 'Intersect',
        onClick: () => actions.onCsgIntersect(),
        isEnabled: () => actions.canRunCsgBoolean(),
      },
    ]);
  }

  /**
   * Adds the Align menu for selection alignment actions.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addAlignMenu(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addDropdown('Align', [
      { label: 'Origin', onClick: () => actions.onAlignToOrigin() },
      { label: 'Grid Center', onClick: () => actions.onAlignToGridCenter() },
      { label: 'To Object', onClick: () => actions.onAlignToObject() },
    ]);
  }

  /**
   * Adds undo/redo icon controls.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addHistoryControls(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Undo', ToolbarIcons.undo(), () => actions.onUndo());
    toolbar.addIconButton('Redo', ToolbarIcons.redo(), () => actions.onRedo());
  }

  /**
   * Adds one-click primitive creation icons (faster than the Add menu).
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addPrimitiveControls(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Add Cube', ToolbarIcons.primitiveCube(), () => actions.onAddCube());
    toolbar.addIconButton('Add Sphere', ToolbarIcons.primitiveSphere(), () => actions.onAddSphere());
    toolbar.addIconButton('Add Cylinder', ToolbarIcons.primitiveCylinder(), () => actions.onAddCylinder());
    toolbar.addIconButton('Add Plane', ToolbarIcons.primitivePlane(), () => actions.onAddPlane());
    toolbar.addIconButton('Add Terrain', ToolbarIcons.primitiveTerrain(), () => actions.onAddTerrain());
    toolbar.addIconButton('Add Solid Model', ToolbarIcons.solidModel(), () => actions.onAddSolidModel());
  }

  /**
   * Adds snap, transform-space, and texture-lock controls.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addSnapControls(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addSeparator();
    toolbar.addIconButton('Snap', ToolbarIcons.snap(), () => actions.onToggleSnap());
    toolbar.setButtonActiveByLabel('Snap', actions.isUserSnapEnabled());
    toolbar.addButton('−', () => actions.onSnapIntervalBackward()).title = 'Decrease snap interval';
    toolbar.addButton('+', () => actions.onSnapIntervalForward()).title = 'Increase snap interval';
    toolbar.addSeparator();
    toolbar.addButton('Global', () => actions.onSetTransformSpaceGlobal()).title = 'Gizmo axes: world (global)';
    toolbar.addButton('Local', () => actions.onSetTransformSpaceLocal()).title = 'Gizmo axes: object local';
    this.applyTransformSpaceButtonState(toolbar, actions.isTransformSpaceLocal());
    toolbar.addSeparator();
    toolbar.addButton('Pos Lock', () => actions.onTogglePositionLock()).title =
      'Position lock: UVs stick when moving/rotating (off = world slide)';
    toolbar.setButtonActiveByLabel('Pos Lock', actions.isPositionLockEnabled());
    toolbar.addButton('Stretch Lock', () => actions.onToggleStretchLock()).title =
      'Stretch lock: UVs stretch when scaling (off = tile density)';
    toolbar.setButtonActiveByLabel('Stretch Lock', actions.isStretchLockEnabled());
  }

  /**
   * Highlights Global or Local according to the current transform space.
   *
   * @param toolbar Toolbar with Global/Local buttons.
   * @param isLocal Whether local space is active.
   */
  private applyTransformSpaceButtonState(toolbar: Toolbar, isLocal: boolean): void {
    toolbar.setButtonActiveByLabel('Global', !isLocal);
    toolbar.setButtonActiveByLabel('Local', isLocal);
  }

  /**
   * Adds floating panel toggle icons (UV, textures, tools) and About.
   *
   * @param toolbar Toolbar instance to populate.
   * @param actions Callbacks for each toolbar control.
   */
  private addPanelToggleControls(toolbar: Toolbar, actions: EditorToolbarActions): void {
    toolbar.addSeparator();
    toolbar.addIconButton('UV Editor', ToolbarIcons.uvEditor(), () => actions.onToggleUvEditor());
    toolbar.addIconButton('Texture Browser', ToolbarIcons.textureBrowser(), () => actions.onToggleTextureBrowser());
    toolbar.addIconButton('Tools', ToolbarIcons.toolsPanel(), () => actions.onToggleToolsPalette());
    toolbar.addIconButton('Solid Model', ToolbarIcons.solidModel(), () => actions.onToggleSolidModelPanel());
    toolbar.addIconButton('Settings', ToolbarIcons.settings(), () => actions.onToggleSettingsDialog());
    toolbar.addSeparator();
    toolbar.addIconButton('Documentation', ToolbarIcons.documentation(), () => actions.onOpenDocumentation());
    toolbar.addIconButton('About', ToolbarIcons.about(), () => actions.onOpenAboutDialog());
    toolbar.addIconButton('Detached Viewport', ToolbarIcons.detachedViewport(), () => actions.onOpenDetachedViewport());
  }
}
