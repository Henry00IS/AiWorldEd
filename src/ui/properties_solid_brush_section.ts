import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';
import { SolidModel } from '../solid/model/solid_model.js';
import {
  SolidOperation,
  solidOperationLabel
} from '../solid/types/solid_operation.js';

/**
 * Handlers for solid-brush context controls in the inspector.
 */
export interface SolidBrushPropertyHandlers {
  onSetOperation: (meshes: THREE.Mesh[], operation: SolidOperation) => void;
  onBrushEdited: (meshes: THREE.Mesh[]) => void;
  onAddBoxBrush: () => void;
}

/**
 * Builds and updates the inspector Solid Brush section (CSG ops + add brush).
 */
export class PropertiesSolidBrushSection {
  private readonly theme: typeof Theme;
  private readonly section: HTMLElement;
  private readonly operationButtons: Map<SolidOperation, HTMLButtonElement>;
  private handlers: SolidBrushPropertyHandlers | null;
  private getEditableBrushMeshes: (() => THREE.Mesh[]) | null;
  private boundObjects: THREE.Object3D[];
  private hexToRgb: (hex: number) => string;

  /**
   * Creates the solid brush section UI.
   * @param theme Editor theme.
   * @param createSectionContainer Factory for a section container element.
   * @param createSectionHeader Factory for a section header element.
   * @param hexToRgb Converts theme hex colors to CSS rgb strings.
   */
  constructor(
    theme: typeof Theme,
    createSectionContainer: () => HTMLElement,
    createSectionHeader: (title: string) => HTMLElement,
    hexToRgb: (hex: number) => string
  ) {
    this.theme = theme;
    this.hexToRgb = hexToRgb;
    this.operationButtons = new Map();
    this.handlers = null;
    this.getEditableBrushMeshes = null;
    this.boundObjects = [];
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.section.appendChild(createSectionHeader('Solid Brush'));
    const content = this.createContent();
    this.section.appendChild(content);
  }

  /**
   * Returns the section root element for mounting in the properties panel.
   * @returns Section element.
   */
  getElement(): HTMLElement {
    return this.section;
  }

  /**
   * Wires solid-brush operation and rebuild handlers.
   * @param handlers Brush property handlers, or null to clear.
   */
  setHandlers(handlers: SolidBrushPropertyHandlers | null): void {
    this.handlers = handlers;
  }

  /**
   * Sets a provider for unlocked brush meshes in the current selection.
   * @param provider Returns editable brush meshes, or null to clear.
   */
  setEditableBrushMeshProvider(provider: (() => THREE.Mesh[]) | null): void {
    this.getEditableBrushMeshes = provider;
  }

  /**
   * Shows or hides the section and highlights the shared active operation.
   * @param objects Currently bound selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    this.boundObjects = objects.slice();
    const brushMeshes = this.collectBrushMeshes(objects);
    if (!this.hasSolidContext(objects)) {
      this.section.style.display = 'none';
      return;
    }
    this.section.style.display = 'block';
    if (brushMeshes.length === 0) {
      this.dimOperationButtons();
      return;
    }
    this.highlightSharedOperation(brushMeshes);
  }

  /**
   * Applies a CSG operation to the provided brush meshes.
   * @param brushMeshes Editable solid brush meshes.
   * @param operation Selected operation.
   * @param boundObjects Full selection used to refresh button state.
   */
  applyOperation(
    brushMeshes: THREE.Mesh[],
    operation: SolidOperation,
    boundObjects: THREE.Object3D[]
  ): void {
    if (!this.handlers || brushMeshes.length === 0) return;
    this.handlers.onSetOperation(brushMeshes, operation);
    this.updateFromObjects(boundObjects);
  }

  /**
   * Notifies handlers that solid brushes were transform-edited in the inspector.
   * @param objects Edited objects.
   */
  notifyBrushEdits(objects: THREE.Object3D[]): void {
    if (!this.handlers) return;
    const meshes = this.collectBrushMeshes(objects);
    if (meshes.length === 0) return;
    this.handlers.onBrushEdited(meshes);
  }

  /**
   * Invokes the add-box-brush handler when configured.
   */
  requestAddBoxBrush(): void {
    this.handlers?.onAddBoxBrush();
  }

  /**
   * Builds the section body with operation icons and add-brush control.
   * @returns Content element.
   */
  private createContent(): HTMLElement {
    const content = document.createElement('div');
    content.style.padding = '6px 8px';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '8px';
    content.appendChild(this.createOperationButtons());
    content.appendChild(this.createAddBoxBrushButton());
    return content;
  }

  /**
   * Builds compact icon buttons for Additive / Subtractive / Intersecting.
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
        icon: this.operationIconSvg('add'),
        title: solidOperationLabel(SolidOperation.Additive)
      },
      {
        operation: SolidOperation.Subtractive,
        icon: this.operationIconSvg('sub'),
        title: solidOperationLabel(SolidOperation.Subtractive)
      },
      {
        operation: SolidOperation.Intersecting,
        icon: this.operationIconSvg('int'),
        title: solidOperationLabel(SolidOperation.Intersecting)
      }
    ];
  }

  /**
   * Creates one CSG operation button.
   * @param operation CSG operation.
   * @param icon SVG markup.
   * @param title Accessible title.
   * @returns Configured button.
   */
  private createOperationButton(
    operation: SolidOperation,
    icon: string,
    title: string
  ): HTMLButtonElement {
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
   * Applies a CSG operation to editable selected brush meshes.
   * @param operation Selected operation.
   */
  private onOperationClicked(operation: SolidOperation): void {
    const meshes =
      this.getEditableBrushMeshes?.() ??
      this.collectBrushMeshes(this.boundObjects);
    this.applyOperation(meshes, operation, this.boundObjects);
  }

  /**
   * Builds the add-box-brush action button.
   * @returns Button element.
   */
  private createAddBoxBrushButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '+ Box Brush';
    button.title = 'Add a box brush to the solid model';
    button.style.width = '100%';
    button.style.padding = '6px 8px';
    button.style.fontSize = '11px';
    button.style.fontFamily = 'monospace';
    button.style.cursor = 'pointer';
    button.style.borderRadius = '6px';
    button.style.border = `1px solid ${this.hexToRgb(Theme.separatorColor)}`;
    button.style.background = this.hexToRgb(Theme.buttonBackground);
    button.style.color = this.theme.buttonTextColor;
    button.addEventListener('click', () => this.requestAddBoxBrush());
    return button;
  }

  /**
   * Returns inline SVG markup for a solid CSG operation icon.
   * @param kind Operation visual kind.
   * @returns SVG HTML string.
   */
  private operationIconSvg(kind: 'add' | 'sub' | 'int'): string {
    if (kind === 'add') {
      return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.35"/><rect x="6" y="6" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.85"/><path d="M11 8.5h2v5h-2zM9.5 11h5v2h-5z" fill="#1a1a1a"/></svg>`;
    }
    if (kind === 'sub') {
      return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="1.5" fill="currentColor" opacity="0.85"/><rect x="6" y="6" width="8" height="8" rx="1" fill="#1a1a1a"/><path d="M7 9.2h6v1.6H7z" fill="currentColor"/></svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="7" cy="9" r="5" fill="currentColor" opacity="0.45"/><circle cx="11" cy="9" r="5" fill="currentColor" opacity="0.45"/><path d="M9 5.2a5 5 0 0 1 0 7.6 5 5 0 0 1 0-7.6z" fill="currentColor"/></svg>`;
  }

  /**
   * Collects solid brush meshes from a selection list.
   * @param objects Selected objects.
   * @returns Brush preview meshes.
   */
  private collectBrushMeshes(objects: THREE.Object3D[]): THREE.Mesh[] {
    return objects.filter(
      (object): object is THREE.Mesh =>
        object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object)
    );
  }

  /**
   * Returns whether the selection is inside a solid model context.
   * @param objects Selected objects.
   * @returns True when solid brush UI should show.
   */
  private hasSolidContext(objects: THREE.Object3D[]): boolean {
    return objects.some(
      (object) =>
        SolidBrushVisual.isBrushObject(object) ||
        SolidModel.isSolidModelObject(object) ||
        SolidModel.fromObject(object) !== null
    );
  }

  /**
   * Dims operation buttons when no brush is selected.
   */
  private dimOperationButtons(): void {
    this.operationButtons.forEach((button) => {
      button.style.outline = 'none';
      button.style.opacity = '0.55';
    });
  }

  /**
   * Highlights the shared CSG operation across selected brushes.
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
      button.style.outline = active
        ? `1px solid ${this.hexToRgb(Theme.selectionColor)}`
        : 'none';
      button.style.background = active
        ? this.hexToRgb(Theme.buttonHoverColor)
        : this.hexToRgb(Theme.buttonBackground);
      button.style.opacity = '1';
    });
  }
}
