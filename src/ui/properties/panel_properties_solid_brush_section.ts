import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation, solidOperationLabel } from '@/solid/types/solid_operation.js';
import { SolidCsgOperationIcons } from '@/ui/properties/solid_csg_operation_icons.js';
import type { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesBevelVolumeSection } from './panel_properties_bevel_volume_section.js';

/** Handlers for solid-brush context controls in the inspector. */
export interface SolidBrushPropertyHandlers {
  onSetOperation: (meshes: THREE.Mesh[], operation: SolidOperation) => void;
  /**
   * Sets CSG operation on solid compound groups (branch nodes).
   *
   * @param groups Solid CSG groups.
   * @param operation New group operation.
   */
  onSetGroupOperation?: (groups: THREE.Group[], operation: SolidOperation) => void;
  onAddBoxBrush: () => void;
  /** Moves brushes/groups to first among siblings under their own parent. */
  onMoveToFirst: (nodes: THREE.Object3D[]) => void;
  /** Moves brushes/groups to last among siblings under their own parent. */
  onMoveToLast: (nodes: THREE.Object3D[]) => void;
  /**
   * Sets inverted-world mode on the solid model owning the selection.
   *
   * @param inverted True when CSG starts solid (carve rooms with subtract).
   */
  onSetInvertedWorld?: (inverted: boolean) => void;
}

/** Builds and updates the inspector Solid Brush section (CSG ops + add brush). */
export class PanelPropertiesSolidBrushSection {
  private readonly theme: typeof Theme;
  private readonly section: HTMLElement;
  private readonly operationButtons: Map<SolidOperation, HTMLButtonElement>;
  private handlers: SolidBrushPropertyHandlers | null;
  private getEditableBrushMeshes: (() => THREE.Mesh[]) | null;
  private boundObjects: THREE.Object3D[];
  private hexToRgb: (hex: number) => string;
  private invertedWorldCheckbox: HTMLInputElement | null;
  private readonly root: HTMLElement;
  private readonly bevelSection: PanelPropertiesBevelVolumeSection;

  /**
   * Creates the solid brush section UI.
   *
   * @param theme Editor theme.
   * @param createSectionContainer Factory for a section container element.
   * @param createSectionHeader Factory for a section header element.
   * @param hexToRgb Converts theme hex colors to CSS rgb strings.
   */
  constructor(
    theme: typeof Theme,
    createSectionContainer: () => HTMLElement,
    createSectionHeader: (title: string) => HTMLElement,
    hexToRgb: (hex: number) => string,
  ) {
    this.theme = theme;
    this.hexToRgb = hexToRgb;
    this.operationButtons = new Map();
    this.handlers = null;
    this.getEditableBrushMeshes = null;
    this.boundObjects = [];
    this.invertedWorldCheckbox = null;
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.section.appendChild(createSectionHeader('Solid Model'));
    const content = this.createContent();
    this.section.appendChild(content);
    this.bevelSection = new PanelPropertiesBevelVolumeSection(createSectionContainer, createSectionHeader);
    this.root = document.createElement('div');
    this.root.appendChild(this.section);
    this.root.appendChild(this.bevelSection.getElement());
  }

  /**
   * Returns the section root element for mounting in the properties panel.
   *
   * @returns Section element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /**
   * Forwards the undo stack to the bevel volume section.
   *
   * @param stack Command stack, or null.
   */
  setCommandStack(stack: CommandStack | null): void {
    this.bevelSection.setCommandStack(stack);
  }

  /**
   * Wires solid-brush operation and rebuild handlers.
   *
   * @param handlers Brush property handlers, or null to clear.
   */
  setHandlers(handlers: SolidBrushPropertyHandlers | null): void {
    this.handlers = handlers;
  }

  /**
   * Sets a provider for unlocked brush meshes in the current selection.
   *
   * @param provider Returns editable brush meshes, or null to clear.
   */
  setEditableBrushMeshProvider(provider: (() => THREE.Mesh[]) | null): void {
    this.getEditableBrushMeshes = provider;
  }

  /**
   * Shows or hides the section and highlights the shared active operation.
   *
   * @param objects Currently bound selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    this.bevelSection.updateFromObjects(objects);
    this.boundObjects = objects.slice();
    const brushMeshes = this.collectBrushMeshes(objects);
    const solidGroups = this.collectSolidGroups(objects);
    if (!this.hasSolidContext(objects)) {
      this.section.style.display = 'none';
      return;
    }
    this.section.style.display = 'block';
    this.syncInvertedWorldCheckbox(objects);
    if (brushMeshes.length === 0 && solidGroups.length === 0) {
      this.dimOperationButtons();
      return;
    }
    if (solidGroups.length > 0 && brushMeshes.length === 0) {
      this.highlightSharedGroupOperation(solidGroups);
      return;
    }
    this.highlightSharedOperation(brushMeshes);
  }

  /**
   * Applies a CSG operation to the provided brush meshes and/or solid groups.
   *
   * @param brushMeshes Editable solid brush meshes.
   * @param operation Selected operation.
   * @param boundObjects Full selection used to refresh button state.
   */
  applyOperation(brushMeshes: THREE.Mesh[], operation: SolidOperation, boundObjects: THREE.Object3D[]): void {
    if (!this.handlers) return;
    const solidGroups = this.collectSolidGroups(boundObjects);
    if (solidGroups.length > 0 && this.handlers.onSetGroupOperation) {
      this.handlers.onSetGroupOperation(solidGroups, operation);
      this.updateFromObjects(boundObjects);
      return;
    }
    if (brushMeshes.length > 0) {
      this.handlers.onSetOperation(brushMeshes, operation);
    }
    this.updateFromObjects(boundObjects);
  }

  /** Invokes the add-box-brush handler when configured. */
  requestAddBoxBrush(): void {
    this.handlers?.onAddBoxBrush();
  }

  /**
   * Builds the section body with operation icons, order controls, and
   * add-brush.
   *
   * @returns Content element.
   */
  private createContent(): HTMLElement {
    const content = document.createElement('div');
    content.style.padding = '6px 8px';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '8px';
    content.appendChild(this.createInvertedWorldRow());
    content.appendChild(this.createOperationButtons());
    content.appendChild(this.createOrderButtons());
    content.appendChild(this.createAddBoxBrushButton());
    return content;
  }

  /**
   * Builds the inverted-world checkbox row for solid model settings.
   *
   * @returns Row element.
   */
  private createInvertedWorldRow(): HTMLElement {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.fontSize = '11px';
    row.style.fontFamily = 'monospace';
    row.style.color = this.theme.buttonTextColor;
    row.style.cursor = 'pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.title = 'Start CSG as solid so subtractive brushes carve rooms';
    checkbox.addEventListener('change', () => {
      this.handlers?.onSetInvertedWorld?.(checkbox.checked);
    });
    const text = document.createElement('span');
    text.textContent = 'Inverted world';
    row.appendChild(checkbox);
    row.appendChild(text);
    this.invertedWorldCheckbox = checkbox;
    return row;
  }

  /**
   * Syncs the inverted-world checkbox from the solid model in selection.
   *
   * @param objects Bound selection.
   */
  private syncInvertedWorldCheckbox(objects: THREE.Object3D[]): void {
    if (!this.invertedWorldCheckbox) return;
    const model = this.resolveSolidModelFromObjects(objects);
    if (!model) {
      this.invertedWorldCheckbox.checked = false;
      this.invertedWorldCheckbox.disabled = true;
      return;
    }
    this.invertedWorldCheckbox.disabled = false;
    this.invertedWorldCheckbox.checked = model.isInvertedWorld();
  }

  /**
   * Resolves the solid model for the current selection.
   *
   * @param objects Bound selection.
   * @returns Solid model or null.
   */
  private resolveSolidModelFromObjects(objects: THREE.Object3D[]): SolidModel | null {
    for (const object of objects) {
      const model = SolidModel.fromObject(object);
      if (model) return model;
    }
    return null;
  }

  /**
   * Builds To First / To Last CSG order buttons.
   *
   * @returns Button row element.
   */
  private createOrderButtons(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.appendChild(
      this.createTextActionButton('To First', 'Move brush to first in CSG order', () =>
        this.onMoveOrderClicked('first'),
      ),
    );
    row.appendChild(
      this.createTextActionButton('To Last', 'Move brush to last in CSG order', () => this.onMoveOrderClicked('last')),
    );
    return row;
  }

  /**
   * Creates a compact full-width text action button.
   *
   * @param label Visible label.
   * @param title Tooltip / aria label.
   * @param onClick Click handler.
   * @returns Button element.
   */
  private createTextActionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.style.flex = '1';
    button.style.padding = '6px 8px';
    button.style.fontSize = '11px';
    button.style.fontFamily = 'monospace';
    button.style.cursor = 'pointer';
    button.style.borderRadius = '6px';
    button.style.border = `1px solid ${this.hexToRgb(Theme.separatorColor)}`;
    button.style.background = this.hexToRgb(Theme.buttonBackground);
    button.style.color = this.theme.buttonTextColor;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Moves selected brushes and solid CSG groups to first or last among siblings
   * under each node's own parent.
   *
   * @param end Target end among content siblings.
   */
  private onMoveOrderClicked(end: 'first' | 'last'): void {
    if (!this.handlers) return;
    const nodes = this.collectReorderableNodes(this.boundObjects);
    if (nodes.length === 0) return;
    if (end === 'first') this.handlers.onMoveToFirst(nodes);
    else this.handlers.onMoveToLast(nodes);
  }

  /**
   * Collects solid brushes and solid CSG groups from the bound selection.
   *
   * @param objects Bound inspector objects.
   * @returns Nodes that support To First / To Last.
   */
  private collectReorderableNodes(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
    const nodes: THREE.Object3D[] = [];
    for (const object of objects) {
      if (SolidBrushVisual.isBrushObject(object)) {
        nodes.push(object);
        continue;
      }
      if (isSolidCsgGroup(object)) nodes.push(object);
    }
    return nodes;
  }

  /**
   * Builds compact icon buttons for Additive / Subtractive / Intersecting.
   *
   * @returns Button row element.
   */
  private createOperationButtons(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.justifyContent = 'space-between';
    for (const entry of this.operationButtonDefs()) {
      const button = this.createOperationButton(entry.operation, entry.icon, entry.title);
      this.operationButtons.set(entry.operation, button);
      row.appendChild(button);
    }
    return row;
  }

  /**
   * Returns metadata for CSG operation buttons.
   *
   * @returns Operation button definitions.
   */
  private operationButtonDefs(): Array<{
    operation: SolidOperation;
    icon: string;
    title: string;
  }> {
    return [
      {
        operation: SolidOperation.Additive,
        icon: SolidCsgOperationIcons.additive(),
        title: solidOperationLabel(SolidOperation.Additive),
      },
      {
        operation: SolidOperation.Subtractive,
        icon: SolidCsgOperationIcons.subtractive(),
        title: solidOperationLabel(SolidOperation.Subtractive),
      },
      {
        operation: SolidOperation.Intersecting,
        icon: SolidCsgOperationIcons.intersecting(),
        title: solidOperationLabel(SolidOperation.Intersecting),
      },
    ];
  }

  /**
   * Creates one CSG operation button.
   *
   * @param operation CSG operation.
   * @param icon SVG markup.
   * @param title Accessible title.
   * @returns Configured button.
   */
  private createOperationButton(operation: SolidOperation, icon: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = icon;
    button.style.flex = '1';
    button.style.height = '32px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.padding = '0';
    button.style.cursor = 'pointer';
    button.style.borderRadius = '6px';
    button.style.border = `1px solid ${this.hexToRgb(Theme.separatorColor)}`;
    button.style.background = this.hexToRgb(Theme.buttonBackground);
    button.style.color = this.theme.buttonTextColor;
    button.addEventListener('click', () => this.onOperationClicked(operation));
    return button;
  }

  /**
   * Applies a CSG operation to editable selected brush meshes and solid groups.
   *
   * @param operation Selected operation.
   */
  private onOperationClicked(operation: SolidOperation): void {
    const meshes = this.getEditableBrushMeshes?.() ?? this.collectBrushMeshes(this.boundObjects);
    this.applyOperation(meshes, operation, this.boundObjects);
  }

  /**
   * Collects solid CSG compound groups from a selection list.
   *
   * @param objects Selected objects.
   * @returns Solid CSG groups.
   */
  private collectSolidGroups(objects: THREE.Object3D[]): THREE.Group[] {
    return objects.filter((object): object is THREE.Group => isSolidCsgGroup(object));
  }

  /**
   * Highlights the shared CSG operation across selected solid groups.
   *
   * @param groups Selected solid CSG groups.
   */
  private highlightSharedGroupOperation(groups: THREE.Group[]): void {
    const operations = groups.map((group) => getSolidGroupOperation(group));
    const shared = operations.every((operation) => operation === operations[0]);
    this.operationButtons.forEach((button, operation) => {
      const active = shared && operation === operations[0];
      button.style.outline = active ? `1px solid ${this.hexToRgb(Theme.selectionColor)}` : 'none';
      button.style.background = active ? this.hexToRgb(Theme.buttonHoverColor) : this.hexToRgb(Theme.buttonBackground);
      button.style.opacity = '1';
    });
  }

  /**
   * Builds the add-box-brush action button.
   *
   * @returns Button element.
   */
  private createAddBoxBrushButton(): HTMLButtonElement {
    const button = this.createTextActionButton('+ Box Brush', 'Add a box brush to the solid model', () =>
      this.requestAddBoxBrush(),
    );
    button.style.flex = '';
    button.style.width = '100%';
    return button;
  }

  /**
   * Collects solid brush meshes from a selection list.
   *
   * @param objects Selected objects.
   * @returns Brush preview meshes.
   */
  private collectBrushMeshes(objects: THREE.Object3D[]): THREE.Mesh[] {
    return objects.filter(
      (object): object is THREE.Mesh => object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object),
    );
  }

  /**
   * Returns whether the selection is inside a solid model context.
   *
   * @param objects Selected objects.
   * @returns True when solid brush UI should show.
   */
  private hasSolidContext(objects: THREE.Object3D[]): boolean {
    return objects.some(
      (object) =>
        SolidBrushVisual.isBrushObject(object) ||
        isSolidCsgGroup(object) ||
        SolidModel.isSolidModelObject(object) ||
        SolidModel.fromObject(object) !== null,
    );
  }

  /** Dims operation buttons when no brush is selected. */
  private dimOperationButtons(): void {
    this.operationButtons.forEach((button) => {
      button.style.outline = 'none';
      button.style.opacity = '0.55';
    });
  }

  /**
   * Highlights the shared CSG operation across selected brushes.
   *
   * @param brushMeshes Selected brush meshes.
   */
  private highlightSharedOperation(brushMeshes: THREE.Mesh[]): void {
    const operations = brushMeshes.map((mesh) => {
      const model = SolidModel.fromObject(mesh);
      return model?.findBrushByMesh(mesh)?.operation ?? SolidOperation.Additive;
    });
    const shared = operations.every((operation) => operation === operations[0]);
    this.operationButtons.forEach((button, operation) => {
      const active = shared && operation === operations[0];
      button.style.outline = active ? `1px solid ${this.hexToRgb(Theme.selectionColor)}` : 'none';
      button.style.background = active ? this.hexToRgb(Theme.buttonHoverColor) : this.hexToRgb(Theme.buttonBackground);
      button.style.opacity = '1';
    });
  }
}
