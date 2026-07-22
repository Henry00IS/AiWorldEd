import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { CommandStack } from '../commands/command_stack.js';
import { UndoCommand } from '../commands/undo_command.js';
import { SetPositionCommand } from '../commands/set_position_command.js';
import { SetRotationCommand } from '../commands/set_rotation_command.js';
import { SetScaleCommand } from '../commands/set_scale_command.js';
import { SetColorCommand } from '../commands/set_color_command.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { filterUnlockedObjects } from '../utils/object_lock.js';

/**
 * Configuration for a single axis input row in a property section.
 */
interface AxisInputConfig {
  label: string;
  color: string;
  axis: 'x' | 'y' | 'z';
}

/** Display string for mixed multi-selection values (Unity-style). */
const MIXED_VALUE_DISPLAY = '—';

/** Equality epsilon for shared numeric fields. */
const VALUE_EPSILON = 1e-5;

/**
 * Right-side properties panel with Position, Rotation, Scale, and Material.
 * Supports multi-selection: mixed fields show dashes; edits apply to all
 * selected objects (Unity-style inspector behavior).
 */
export class PropertiesPanel {
  private container: HTMLElement;
  private theme: typeof Theme;
  private selectionManager: SelectionManager;
  private boundObjects: THREE.Object3D[];
  private positionInputs: Map<string, HTMLInputElement>;
  private rotationInputs: Map<string, HTMLInputElement>;
  private scaleInputs: Map<string, HTMLInputElement>;
  private colorInput: HTMLInputElement | null;
  private commandStack: CommandStack | null;
  private textureLock: TextureLockSettings | null;
  private isDisposed: boolean;
  private sections: HTMLElement[];
  private inputChangeHandlers: { input: HTMLInputElement; handler: () => void }[];
  private activeColorCommand: SetColorCommand | null;
  private colorFinalizeTimerId: number | null;

  /**
   * Creates a new properties panel.
   * @param container The parent DOM element to append the panel into.
   * @param theme The theme containing color definitions.
   * @param selectionManager The selection manager to bind to.
   */
  constructor(
    container: HTMLElement,
    theme: typeof Theme,
    selectionManager: SelectionManager
  ) {
    this.container = document.createElement('div');
    this.theme = theme;
    this.selectionManager = selectionManager;
    this.boundObjects = [];
    this.positionInputs = new Map();
    this.rotationInputs = new Map();
    this.scaleInputs = new Map();
    this.colorInput = null;
    this.commandStack = null;
    this.textureLock = null;
    this.isDisposed = false;
    this.sections = [];
    this.inputChangeHandlers = [];
    this.activeColorCommand = null;
    this.colorFinalizeTimerId = null;
    this.applyContainerStyles();
    this.createPositionSection();
    this.createRotationSection();
    this.createScaleSection();
    this.createMaterialSection();
    container.appendChild(this.container);
    this.bindSelectionChanges();
  }

  /**
   * Sets the command stack for undo/redo support on property edits.
   * @param stack The command stack to use for property changes.
   */
  setCommandStack(stack: CommandStack): void {
    this.commandStack = stack;
  }

  /**
   * Sets texture lock settings for scale edits from the inspector.
   * @param settings Shared texture lock settings, or null.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Binds the panel to a single object for editing.
   * @param object The Three.js object to bind to.
   */
  bindObject(object: THREE.Object3D): void {
    this.bindObjects([object]);
  }

  /**
   * Binds the panel to multiple objects for multi-edit.
   * @param objects The objects currently selected.
   */
  bindObjects(objects: THREE.Object3D[]): void {
    this.finalizeColorEditSession();
    this.boundObjects = objects.slice();
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Unbinds the panel from any objects and clears inputs.
   */
  unbindObject(): void {
    this.finalizeColorEditSession();
    this.boundObjects = [];
    this.clearAllInputs();
  }

  /**
   * Re-reads transform values from the currently bound objects.
   * Call during gizmo drags so position/rotation/scale inputs stay live.
   */
  refreshBoundObject(): void {
    if (this.isDisposed || this.boundObjects.length === 0) return;
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Updates all input values from one object (single-selection helper).
   * @param object The Three.js object to read values from.
   */
  updateFromObject(object: THREE.Object3D): void {
    this.updateFromObjects([object]);
  }

  /**
   * Updates inputs from multiple objects, showing dashes for mixed fields.
   * @param objects Objects in the current selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    if (objects.length === 0) {
      this.clearAllInputs();
      return;
    }
    this.writeVectorInputs(
      this.positionInputs,
      objects.map((object) => object.position),
      2
    );
    this.writeVectorInputs(
      this.rotationInputs,
      objects.map((object) => this.eulerDegrees(object.rotation)),
      1
    );
    this.writeVectorInputs(
      this.scaleInputs,
      objects.map((object) => object.scale),
      2
    );
    this.updateColorFromObjects(objects);
  }

  /**
   * Disposes the panel and removes it from the DOM.
   */
  dispose(): void {
    this.isDisposed = true;
    this.finalizeColorEditSession();
    this.removeInputChangeListeners();
    this.positionInputs.clear();
    this.rotationInputs.clear();
    this.scaleInputs.clear();
    this.sections = [];
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  /**
   * Returns the container element for layout purposes.
   * @returns The DOM element of the panel.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Converts an Euler rotation to a Vector3 of degrees.
   * @param rotation Source Euler angles in radians.
   * @returns Degrees as x/y/z components.
   */
  private eulerDegrees(rotation: THREE.Euler): THREE.Vector3 {
    return new THREE.Vector3(
      THREE.MathUtils.radToDeg(rotation.x),
      THREE.MathUtils.radToDeg(rotation.y),
      THREE.MathUtils.radToDeg(rotation.z)
    );
  }

  /**
   * Writes shared or mixed axis values into an input map.
   * @param inputMap Axis inputs to update.
   * @param vectors Per-object vector values (position/scale/degrees).
   * @param decimals Fixed decimal places for shared numbers.
   */
  private writeVectorInputs(
    inputMap: Map<string, HTMLInputElement>,
    vectors: THREE.Vector3[],
    decimals: number
  ): void {
    this.writeAxisInput(inputMap, 'x', vectors.map((vector) => vector.x), decimals);
    this.writeAxisInput(inputMap, 'y', vectors.map((vector) => vector.y), decimals);
    this.writeAxisInput(inputMap, 'z', vectors.map((vector) => vector.z), decimals);
  }

  /**
   * Writes one axis field as a shared number or mixed dash.
   * @param inputMap Input map.
   * @param axis Axis key.
   * @param values Per-object values for this axis.
   * @param decimals Decimal places when shared.
   */
  private writeAxisInput(
    inputMap: Map<string, HTMLInputElement>,
    axis: string,
    values: number[],
    decimals: number
  ): void {
    const input = inputMap.get(axis);
    if (!input) return;
    if (this.areValuesShared(values)) {
      input.value = values[0].toFixed(decimals);
      return;
    }
    input.value = MIXED_VALUE_DISPLAY;
  }

  /**
   * Returns whether all numeric values match within epsilon.
   * @param values Values to compare.
   * @returns True when all values are effectively equal.
   */
  private areValuesShared(values: number[]): boolean {
    if (values.length === 0) return true;
    const first = values[0];
    return values.every((value) => Math.abs(value - first) <= VALUE_EPSILON);
  }

  /**
   * Parses an input string into a number, or null when mixed/empty/invalid.
   * @param text Raw input text.
   * @returns Parsed number, or null to leave the axis unchanged.
   */
  private parseOptionalNumber(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === MIXED_VALUE_DISPLAY || trimmed === '-') {
      return null;
    }
    const value = parseFloat(trimmed);
    if (isNaN(value)) return null;
    return value;
  }

  /**
   * Applies position edits from the panel to all bound objects.
   * Only axes with valid numbers are written (mixed axes keep per-object values).
   */
  private applyPositionCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = this.parseOptionalNumber(this.positionInputs.get('x')!.value);
    const y = this.parseOptionalNumber(this.positionInputs.get('y')!.value);
    const z = this.parseOptionalNumber(this.positionInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const positions = editable.map((object) => {
      const next = object.position.clone();
      if (x !== null) next.x = x;
      if (y !== null) next.y = y;
      if (z !== null) next.z = z;
      return next;
    });
    if (this.areObjectPositionsUnchanged(editable, positions)) return;
    this.pushOrExecute(new SetPositionCommand(editable, positions));
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Applies rotation edits (degrees in the UI) to unlocked bound objects.
   */
  private applyRotationCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = this.parseOptionalNumber(this.rotationInputs.get('x')!.value);
    const y = this.parseOptionalNumber(this.rotationInputs.get('y')!.value);
    const z = this.parseOptionalNumber(this.rotationInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const rotations = editable.map((object) => {
      const rx = x !== null ? THREE.MathUtils.degToRad(x) : object.rotation.x;
      const ry = y !== null ? THREE.MathUtils.degToRad(y) : object.rotation.y;
      const rz = z !== null ? THREE.MathUtils.degToRad(z) : object.rotation.z;
      return new THREE.Euler(rx, ry, rz, 'XYZ');
    });
    if (this.areObjectRotationsUnchanged(editable, rotations)) return;
    this.pushOrExecute(new SetRotationCommand(editable, rotations));
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Applies scale edits to unlocked bound objects.
   */
  private applyScaleCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = this.parseOptionalNumber(this.scaleInputs.get('x')!.value);
    const y = this.parseOptionalNumber(this.scaleInputs.get('y')!.value);
    const z = this.parseOptionalNumber(this.scaleInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const scales = editable.map((object) => {
      const next = object.scale.clone();
      if (x !== null) next.x = x;
      if (y !== null) next.y = y;
      if (z !== null) next.z = z;
      return next;
    });
    if (this.areObjectScalesUnchanged(editable, scales)) return;
    this.pushOrExecute(new SetScaleCommand(editable, scales));
    this.rebakeBoundMeshesIfTextureLocked();
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Returns bound objects that are not locked for editing.
   * @returns Unlocked bound objects.
   */
  private getEditableBoundObjects(): THREE.Object3D[] {
    return filterUnlockedObjects(this.boundObjects);
  }

  /**
   * Re-bakes world planar UVs on unlocked bound meshes when texture lock is on.
   */
  private rebakeBoundMeshesIfTextureLocked(): void {
    if (!this.textureLock) return;
    const meshes = this.getEditableBoundObjects().filter(
      (object): object is THREE.Mesh => object instanceof THREE.Mesh
    );
    this.textureLock.rebakeMeshesIfLocked(meshes);
  }

  /**
   * Returns true when proposed positions match the given objects.
   * @param objects Objects to compare.
   * @param positions Proposed positions.
   * @returns True when nothing would change.
   */
  private areObjectPositionsUnchanged(
    objects: THREE.Object3D[],
    positions: THREE.Vector3[]
  ): boolean {
    return objects.every((object, index) => {
      return object.position.distanceToSquared(positions[index]) < 1e-12;
    });
  }

  /**
   * Returns true when proposed rotations match the given objects.
   * @param objects Objects to compare.
   * @param rotations Proposed Euler rotations.
   * @returns True when nothing would change.
   */
  private areObjectRotationsUnchanged(
    objects: THREE.Object3D[],
    rotations: THREE.Euler[]
  ): boolean {
    return objects.every((object, index) => {
      const current = object.rotation;
      const next = rotations[index];
      return (
        Math.abs(current.x - next.x) < 1e-8 &&
        Math.abs(current.y - next.y) < 1e-8 &&
        Math.abs(current.z - next.z) < 1e-8
      );
    });
  }

  /**
   * Returns true when proposed scales match the given objects.
   * @param objects Objects to compare.
   * @param scales Proposed scales.
   * @returns True when nothing would change.
   */
  private areObjectScalesUnchanged(
    objects: THREE.Object3D[],
    scales: THREE.Vector3[]
  ): boolean {
    return objects.every((object, index) => {
      return object.scale.distanceToSquared(scales[index]) < 1e-12;
    });
  }

  /**
   * Pushes a command through the stack, or executes it directly.
   * @param command Undoable command to run.
   */
  private pushOrExecute(command: UndoCommand): void {
    if (this.commandStack) {
      this.commandStack.push(command);
      return;
    }
    command.execute();
  }

  /**
   * Applies styles to the panel container.
   */
  private applyContainerStyles(): void {
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.overflow = 'hidden';
    this.container.style.background = this.hexToRgb(Theme.propertiesPanelBackground);
    this.container.style.borderLeft = `2px solid ${this.hexToRgb(Theme.separatorColor)}`;
    this.container.style.width = '200px';
    this.container.style.minWidth = '200px';
    this.container.style.userSelect = 'none';
  }

  /**
   * Creates the Position collapsible section.
   */
  private createPositionSection(): void {
    const section = this.createSection('Position', [
      { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
      { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
      { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) }
    ], this.positionInputs);
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /**
   * Creates the Rotation collapsible section.
   */
  private createRotationSection(): void {
    const section = this.createSection('Rotation', [
      { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
      { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
      { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) }
    ], this.rotationInputs);
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /**
   * Creates the Scale collapsible section.
   */
  private createScaleSection(): void {
    const section = this.createSection('Scale', [
      { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
      { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
      { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) }
    ], this.scaleInputs);
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /**
   * Formats a theme hex color as a CSS #rrggbb string.
   * @param hex Theme color number.
   * @returns CSS color string.
   */
  private axisColor(hex: number): string {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  /**
   * Creates the Material color section for mesh color editing.
   */
  private createMaterialSection(): void {
    const section = this.createSectionContainer();
    const header = this.createSectionHeader('Material');
    section.appendChild(header);
    const content = document.createElement('div');
    content.style.padding = '6px 8px';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    const label = document.createElement('span');
    label.textContent = 'Color';
    label.style.color = this.theme.buttonTextColor;
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '12px';
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.value = '#ffffff';
    this.colorInput.style.width = '48px';
    this.colorInput.style.height = '24px';
    this.colorInput.style.border = 'none';
    this.colorInput.style.background = 'transparent';
    this.colorInput.style.cursor = 'pointer';
    this.colorInput.addEventListener('input', () => this.onColorPickerValueEdited());
    this.colorInput.addEventListener('change', () => this.onColorPickerValueEdited());
    this.colorInput.addEventListener('blur', () => this.finalizeColorEditSession());
    row.appendChild(label);
    row.appendChild(this.colorInput);
    content.appendChild(row);
    section.appendChild(content);
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /**
   * Updates the color picker from selected mesh materials.
   * @param objects Selected objects.
   */
  private updateColorFromObjects(objects: THREE.Object3D[]): void {
    if (!this.colorInput) return;
    const colors = this.collectMeshColors(objects);
    if (colors.length === 0) {
      this.colorInput.value = '#ffffff';
      this.colorInput.style.opacity = '1';
      return;
    }
    if (this.areColorsShared(colors)) {
      this.colorInput.value = `#${colors[0].toString(16).padStart(6, '0')}`;
      this.colorInput.style.opacity = '1';
      return;
    }
    this.colorInput.value = '#ffffff';
    this.colorInput.style.opacity = '0.55';
  }

  /**
   * Collects material color hex values from mesh objects.
   * @param objects Selected objects.
   * @returns Color hex list.
   */
  private collectMeshColors(objects: THREE.Object3D[]): number[] {
    const colors: number[] = [];
    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!material || Array.isArray(material) || !('color' in material)) return;
      colors.push((material as THREE.MeshStandardMaterial).color.getHex());
    });
    return colors;
  }

  /**
   * Returns whether all colors are identical.
   * @param colors Hex colors.
   * @returns True when shared.
   */
  private areColorsShared(colors: number[]): boolean {
    if (colors.length === 0) return true;
    return colors.every((color) => color === colors[0]);
  }

  /**
   * Applies a color picker value with a single coalesced undo command.
   * First edit pushes one command; further drag updates mutate that command.
   * Works across browsers that only fire input, only fire change, or both.
   */
  private onColorPickerValueEdited(): void {
    if (!this.colorInput || this.boundObjects.length === 0) return;
    const colorHex = this.parseColorInputHex(this.colorInput.value);
    if (colorHex === null) return;
    if (this.activeColorCommand) {
      this.updateActiveColorCommand(colorHex);
    } else {
      this.beginActiveColorCommand(colorHex);
    }
    this.colorInput.style.opacity = '1';
    this.scheduleColorEditFinalize();
  }

  /**
   * Finalizes the active color gesture shortly after picker activity stops.
   * Needed because some browsers never fire change when the picker closes.
   */
  private scheduleColorEditFinalize(): void {
    this.clearColorFinalizeTimer();
    this.colorFinalizeTimerId = window.setTimeout(() => {
      this.colorFinalizeTimerId = null;
      this.finalizeColorEditSession();
    }, 300);
  }

  /**
   * Cancels a pending delayed color-session finalize.
   */
  private clearColorFinalizeTimer(): void {
    if (this.colorFinalizeTimerId === null) return;
    window.clearTimeout(this.colorFinalizeTimerId);
    this.colorFinalizeTimerId = null;
  }

  /**
   * Creates and pushes a new color command for the start of a picker gesture.
   * @param colorHex First non-session color from the picker.
   */
  private beginActiveColorCommand(colorHex: number): void {
    const meshes = this.collectColorEditableMeshes(this.getEditableBoundObjects());
    if (meshes.length === 0) return;
    const originalColorHexes = meshes.map((mesh) => {
      return (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    });
    if (originalColorHexes.every((original) => original === colorHex)) return;
    const command = new SetColorCommand(meshes, colorHex, originalColorHexes);
    this.pushOrExecute(command);
    this.activeColorCommand = command;
  }

  /**
   * Updates the in-progress color command target and re-applies it.
   * @param colorHex Latest picker color.
   */
  private updateActiveColorCommand(colorHex: number): void {
    if (!this.activeColorCommand) return;
    if (this.activeColorCommand.getNewColorHex() === colorHex) return;
    this.activeColorCommand.setNewColorHex(colorHex);
    this.activeColorCommand.execute();
  }

  /**
   * Ends a color picker gesture and drops the command if it is a no-op.
   */
  private finalizeColorEditSession(): void {
    this.clearColorFinalizeTimer();
    if (!this.activeColorCommand) return;
    if (this.activeColorCommand.matchesOriginalColors()) {
      this.discardActiveColorCommand();
    }
    this.activeColorCommand = null;
  }

  /**
   * Removes a no-op active color command from the stack without undoing scene state.
   */
  private discardActiveColorCommand(): void {
    if (!this.activeColorCommand) return;
    if (this.commandStack) {
      this.commandStack.discardTopIf(this.activeColorCommand);
      return;
    }
    this.activeColorCommand.undo();
  }

  /**
   * Parses a CSS #rrggbb color string into a hex number.
   * @param value The color input value (e.g. "#ff0000").
   * @returns Hex number, or null when invalid.
   */
  private parseColorInputHex(value: string): number | null {
    const trimmed = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return null;
    return parseInt(trimmed.slice(1), 16);
  }

  /**
   * Collects bound meshes that expose a writable material color.
   * @param objects Selected objects.
   * @returns Editable meshes.
   */
  private collectColorEditableMeshes(objects: THREE.Object3D[]): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!material || Array.isArray(material) || !('color' in material)) return;
      meshes.push(object);
    });
    return meshes;
  }

  /**
   * Creates a collapsible section with axis inputs.
   * @param title The section title.
   * @param axes The axis configuration for each row.
   * @param inputMap The map to store input references.
   * @returns The created section element.
   */
  private createSection(
    title: string,
    axes: AxisInputConfig[],
    inputMap: Map<string, HTMLInputElement>
  ): HTMLElement {
    const section = this.createSectionContainer();
    const header = this.createSectionHeader(title);
    section.appendChild(header);
    const content = this.createSectionContent(axes, inputMap);
    section.appendChild(content);
    this.bindSectionToggle(header, content);
    return section;
  }

  /**
   * Creates the outer container element for a section.
   * @returns The styled section container element.
   */
  private createSectionContainer(): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '8px';
    section.style.borderBottom = `1px solid ${this.hexToRgb(Theme.separatorColor)}`;
    return section;
  }

  /**
   * Creates the clickable header element for a section.
   * @param title The text to display in the header.
   * @returns The styled header element.
   */
  private createSectionHeader(title: string): HTMLElement {
    const header = document.createElement('div');
    header.textContent = title;
    header.style.fontWeight = 'bold';
    header.style.fontSize = '11px';
    header.style.fontFamily = 'monospace';
    header.style.color = Theme.buttonTextColor;
    header.style.marginBottom = '6px';
    header.style.cursor = 'pointer';
    return header;
  }

  /**
   * Creates the content container with axis input rows.
   * @param axes The axis configuration for each row.
   * @param inputMap The map to store input references.
   * @returns The styled content element.
   */
  private createSectionContent(
    axes: AxisInputConfig[],
    inputMap: Map<string, HTMLInputElement>
  ): HTMLElement {
    const content = document.createElement('div');
    content.style.paddingLeft = '4px';
    axes.forEach((axisConfig) => {
      const row = this.createAxisRow(
        axisConfig.label.toUpperCase(),
        axisConfig.color,
        axisConfig.axis,
        inputMap
      );
      content.appendChild(row);
    });
    return content;
  }

  /**
   * Creates a single axis input row with label and number input.
   * @param label The axis label (X, Y, Z).
   * @param color The label color.
   * @param axis The axis identifier.
   * @param inputMap The map to store the input reference.
   * @returns The row element.
   */
  private createAxisRow(
    label: string,
    color: string,
    axis: string,
    inputMap: Map<string, HTMLInputElement>
  ): HTMLElement {
    const row = this.createAxisRowContainer();
    const labelEl = this.createAxisLabel(label, color);
    const input = this.createAxisInput(axis, inputMap);
    row.appendChild(labelEl);
    row.appendChild(input);
    return row;
  }

  /**
   * Creates the container element for an axis row.
   * @returns The styled row container.
   */
  private createAxisRowContainer(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';
    row.style.marginBottom = '2px';
    return row;
  }

  /**
   * Creates the axis label span element.
   * @param label The axis label text.
   * @param color The label text color.
   * @returns The styled label element.
   */
  private createAxisLabel(label: string, color: string): HTMLElement {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.color = color;
    labelEl.style.fontSize = '11px';
    labelEl.style.fontFamily = 'monospace';
    labelEl.style.width = '12px';
    return labelEl;
  }

  /**
   * Creates the text input element for an axis (supports mixed "—" display).
   * @param axis The axis identifier.
   * @param inputMap The map to store the input reference.
   * @returns The styled input element.
   */
  private createAxisInput(
    axis: string,
    inputMap: Map<string, HTMLInputElement>
  ): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = MIXED_VALUE_DISPLAY;
    input.style.width = '100%';
    input.style.padding = '2px 4px';
    input.style.background = Theme.inputBackgroundColor;
    input.style.color = Theme.inputTextColor;
    input.style.border = `1px solid ${Theme.inputBorderColor}`;
    input.style.borderRadius = '2px';
    input.style.fontSize = '11px';
    input.style.fontFamily = 'monospace';
    inputMap.set(axis, input);
    this.bindInputToChanges(input, inputMap);
    this.bindMixedValueFocusClear(input);
    return input;
  }

  /**
   * Clears a mixed-value dash when the user focuses the field so typing replaces it.
   * @param input Axis input element.
   */
  private bindMixedValueFocusClear(input: HTMLInputElement): void {
    const handleFocus = () => {
      if (input.value.trim() !== MIXED_VALUE_DISPLAY) return;
      input.value = '';
    };
    input.addEventListener('focus', handleFocus);
    this.inputChangeHandlers.push({ input, handler: handleFocus });
  }

  /**
   * Binds an input element to apply multi-object changes on commit.
   * @param input The input element.
   * @param inputMap The input map this belongs to.
   */
  private bindInputToChanges(
    input: HTMLInputElement,
    inputMap: Map<string, HTMLInputElement>
  ): void {
    const handleChange = () => {
      if (this.boundObjects.length === 0) return;
      if (inputMap === this.positionInputs) this.applyPositionCommand();
      if (inputMap === this.rotationInputs) this.applyRotationCommand();
      if (inputMap === this.scaleInputs) this.applyScaleCommand();
    };
    input.addEventListener('change', handleChange);
    this.inputChangeHandlers.push({ input, handler: handleChange });
  }

  /**
   * Removes all change and focus listeners from axis input elements.
   */
  private removeInputChangeListeners(): void {
    this.inputChangeHandlers.forEach(({ input, handler }) => {
      input.removeEventListener('change', handler);
      input.removeEventListener('focus', handler);
    });
    this.inputChangeHandlers = [];
  }

  /**
   * Binds selection change events to update the panel for multi-select.
   */
  private bindSelectionChanges(): void {
    this.selectionManager.onSelectionChanged(() => {
      if (this.isDisposed) return;
      const selected = this.selectionManager.getAllSelectedObjectsAsArray();
      if (selected.length > 0) {
        this.bindObjects(selected);
        return;
      }
      this.unbindObject();
    });
  }

  /**
   * Clears all input values to empty strings.
   */
  private clearAllInputs(): void {
    this.positionInputs.forEach((input) => {
      input.value = '';
    });
    this.rotationInputs.forEach((input) => {
      input.value = '';
    });
    this.scaleInputs.forEach((input) => {
      input.value = '';
    });
    if (this.colorInput) {
      this.colorInput.value = '#ffffff';
      this.colorInput.style.opacity = '1';
    }
  }

  /**
   * Toggles section visibility on header click.
   * @param header The header element.
   * @param content The content element to toggle.
   */
  private bindSectionToggle(header: HTMLElement, content: HTMLElement): void {
    let collapsed = false;
    header.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : 'block';
    });
  }

  /**
   * Converts a hex color number to an RGB CSS string.
   * @param hex The hex color value.
   * @returns An RGB CSS color string.
   */
  private hexToRgb(hex: number): string {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `rgb(${r}, ${g}, ${b})`;
  }
}
