import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';
import { ToolbarIcons } from './toolbar_icons.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../texture/face_texture_mapping.js';
import { FloatingPanelStack } from './floating_panel_stack.js';

/**
 * Callbacks the UV editor uses to apply texture mapping operations.
 */
export interface UvEditorHandlers {
  onAlign: (align: FaceTextureAlign) => void;
  onApplyMapping: (mapping: FaceTextureMapping) => void;
  onReset: () => void;
}

/**
 * Floating UV editor for CSG-style face texture mapping.
 * Icon strip for align/reset plus numeric scale, offset, and rotation.
 */
export class UvEditor {
  private root: HTMLElement;
  private host: HTMLElement;
  private handlers: UvEditorHandlers;
  private defaultAnchor: HTMLElement | null;
  private isVisible: boolean;
  private scaleUInput: HTMLInputElement;
  private scaleVInput: HTMLInputElement;
  private offsetUInput: HTMLInputElement;
  private offsetVInput: HTMLInputElement;
  private rotationInput: HTMLInputElement;
  private statusLabel: HTMLElement;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;
  private lastAlign: FaceTextureAlign;

  /**
   * Creates a UV editor attached to the host element.
   * @param host Parent element (editor root).
   * @param handlers Apply callbacks.
   * @param defaultAnchor Element whose bottom-left anchors the default panel position.
   */
  constructor(
    host: HTMLElement,
    handlers: UvEditorHandlers,
    defaultAnchor: HTMLElement | null = null
  ) {
    this.host = host;
    this.handlers = handlers;
    this.defaultAnchor = defaultAnchor;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.lastAlign = 'auto';
    this.scaleUInput = document.createElement('input');
    this.scaleVInput = document.createElement('input');
    this.offsetUInput = document.createElement('input');
    this.offsetVInput = document.createElement('input');
    this.rotationInput = document.createElement('input');
    this.statusLabel = document.createElement('div');
    this.root = this.buildRoot();
    this.host.appendChild(this.root);
    this.setMappingFields(createDefaultFaceTextureMapping());
  }

  /**
   * Sets the element used for the default open position (bottom-left of anchor).
   * @param anchor Viewport or other container element, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Shows the UV editor at the default anchor (bottom-left of the 3D viewport).
   */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the UV editor.
   * @param _force Kept for call-site compatibility; always hides.
   */
  hide(_force: boolean = false): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /**
   * Toggles visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide(true);
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is visible.
   * @returns True when shown.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Updates numeric fields from a common mapping (or blanks when mixed).
   * @param mapping Common mapping or null.
   * @param targetCount Number of targeted regions.
   */
  setFromSelection(
    mapping: FaceTextureMapping | null,
    targetCount: number
  ): void {
    if (mapping) {
      this.setMappingFields(mapping);
    } else if (targetCount > 0) {
      this.clearNumericFields();
    }
    this.statusLabel.textContent =
      targetCount === 0
        ? 'No surfaces selected'
        : `${targetCount} face region(s)`;
  }

  /**
   * Disposes DOM and listeners.
   */
  dispose(): void {
    this.hide(true);
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }

  /**
   * Builds the root panel element.
   * @returns Styled root.
   */
  private buildRoot(): HTMLElement {
    const root = document.createElement('div');
    this.styleRoot(root);
    root.appendChild(this.buildTitleBar());
    root.appendChild(this.buildIconStrip());
    root.appendChild(this.buildNumericSection('Scale', 'U', 'V', this.scaleUInput, this.scaleVInput, 0.25));
    root.appendChild(this.buildNumericSection('Offset', 'U', 'V', this.offsetUInput, this.offsetVInput, 0.25));
    root.appendChild(this.buildRotationRow());
    this.styleStatusLabel();
    root.appendChild(this.statusLabel);
    this.bindNumericApply();
    return root;
  }

  /**
   * Applies chrome styles to the floating panel.
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.width = '220px';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '6px';
    root.style.boxShadow = '0 8px 24px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.userSelect = 'none';
    root.style.paddingBottom = '8px';
    this.bindBringToFrontOnPointer(root);
  }

  /**
   * Raises this panel above other floating windows when the user interacts with it.
   * @param root Panel root element.
   */
  private bindBringToFrontOnPointer(root: HTMLElement): void {
    root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(root);
    });
  }

  /**
   * Builds the draggable title bar with close control.
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '6px';
    bar.style.padding = '8px 10px';
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    const title = document.createElement('span');
    title.textContent = 'UV Editor';
    title.style.flex = '1';
    title.style.color = Theme.buttonTextColor;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.fontFamily = 'monospace';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleSmallButton(close, false);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide(true);
    });
    bar.appendChild(title);
    bar.appendChild(close);
    this.bindDrag(bar);
    return bar;
  }

  /**
   * Builds the align/reset icon strip.
   * @returns Icon strip element.
   */
  private buildIconStrip(): HTMLElement {
    const strip = document.createElement('div');
    strip.style.display = 'flex';
    strip.style.gap = '4px';
    strip.style.padding = '8px 10px';
    strip.appendChild(this.createIconButton('Floor', ToolbarIcons.alignFloor(), () => {
      this.handlers.onAlign('floor');
    }));
    strip.appendChild(this.createIconButton('Wall', ToolbarIcons.alignWall(), () => {
      this.handlers.onAlign('wall');
    }));
    strip.appendChild(this.createIconButton('Ceiling', ToolbarIcons.alignCeiling(), () => {
      this.handlers.onAlign('ceiling');
    }));
    strip.appendChild(this.createIconButton('Reset', ToolbarIcons.textureReset(), () => {
      this.handlers.onReset();
    }));
    return strip;
  }

  /**
   * Creates a compact icon button.
   * @param title Tooltip.
   * @param svgIcon SVG markup.
   * @param onClick Click handler.
   * @returns Button element.
   */
  private createIconButton(
    title: string,
    svgIcon: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = svgIcon;
    button.style.width = '28px';
    button.style.height = '28px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '4px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    button.addEventListener('mouseenter', () => {
      button.style.background = hexToRgb(Theme.buttonHoverColor);
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = hexToRgb(Theme.buttonBackground);
    });
    return button;
  }

  /**
   * Builds a two-field numeric section.
   * @param title Section title.
   * @param labelA First field label.
   * @param labelB Second field label.
   * @param inputA First input.
   * @param inputB Second input.
   * @param step Input step.
   * @returns Section element.
   */
  private buildNumericSection(
    title: string,
    labelA: string,
    labelB: string,
    inputA: HTMLInputElement,
    inputB: HTMLInputElement,
    step: number
  ): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '4px 10px';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.color = Theme.buttonTextColor;
    header.style.fontFamily = 'monospace';
    header.style.fontSize = '11px';
    header.style.marginBottom = '4px';
    section.appendChild(header);
    section.appendChild(this.buildAxisRow(labelA, inputA, step));
    section.appendChild(this.buildAxisRow(labelB, inputB, step));
    return section;
  }

  /**
   * Builds the rotation single-field row.
   * @returns Section element.
   */
  private buildRotationRow(): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '4px 10px';
    const header = document.createElement('div');
    header.textContent = 'Rotation';
    header.style.color = Theme.buttonTextColor;
    header.style.fontFamily = 'monospace';
    header.style.fontSize = '11px';
    header.style.marginBottom = '4px';
    section.appendChild(header);
    section.appendChild(this.buildAxisRow('°', this.rotationInput, 1));
    return section;
  }

  /**
   * Builds one labeled number input row.
   * @param label Axis label.
   * @param input Input element to configure.
   * @param step Step size.
   * @returns Row element.
   */
  private buildAxisRow(
    label: string,
    input: HTMLInputElement,
    step: number
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.marginBottom = '3px';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.width = '14px';
    labelEl.style.color = Theme.buttonTextColor;
    labelEl.style.fontFamily = 'monospace';
    labelEl.style.fontSize = '11px';
    input.type = 'number';
    input.step = String(step);
    this.styleNumberInput(input);
    row.appendChild(labelEl);
    row.appendChild(input);
    return row;
  }

  /**
   * Styles a number input like the properties panel.
   * @param input Input to style.
   */
  private styleNumberInput(input: HTMLInputElement): void {
    input.style.flex = '1';
    input.style.background = Theme.inputBackgroundColor;
    input.style.color = Theme.inputTextColor;
    input.style.border = `1px solid ${Theme.inputBorderColor}`;
    input.style.borderRadius = '2px';
    input.style.padding = '2px 4px';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '11px';
  }

  /**
   * Styles a small title-bar button.
   * @param button Button element.
   * @param active Whether it appears active.
   */
  private styleSmallButton(button: HTMLButtonElement, active: boolean): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = active
      ? 'rgba(232, 106, 23, 0.28)'
      : hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '2px 6px';
    button.style.cursor = 'pointer';
  }

  /**
   * Styles the status label under the fields.
   */
  private styleStatusLabel(): void {
    this.statusLabel.style.padding = '4px 10px 0';
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontFamily = 'monospace';
    this.statusLabel.style.fontSize = '10px';
  }

  /**
   * Binds change events on numeric fields to apply mapping.
   */
  private bindNumericApply(): void {
    const apply = () => this.emitMappingFromFields();
    [
      this.scaleUInput,
      this.scaleVInput,
      this.offsetUInput,
      this.offsetVInput,
      this.rotationInput
    ].forEach((input) => {
      input.addEventListener('change', apply);
    });
  }

  /**
   * Reads fields and emits an apply mapping event.
   */
  private emitMappingFromFields(): void {
    const mapping = this.readMappingFromFields();
    if (!mapping) return;
    this.handlers.onApplyMapping(mapping);
  }

  /**
   * Reads a complete mapping from inputs (keeps auto align if not set by icons).
   * @returns Mapping or null when any field is invalid.
   */
  private readMappingFromFields(): FaceTextureMapping | null {
    const scaleU = parseFloat(this.scaleUInput.value);
    const scaleV = parseFloat(this.scaleVInput.value);
    const offsetU = parseFloat(this.offsetUInput.value);
    const offsetV = parseFloat(this.offsetVInput.value);
    const rotationDeg = parseFloat(this.rotationInput.value);
    if ([scaleU, scaleV, offsetU, offsetV, rotationDeg].some((v) => isNaN(v))) {
      return null;
    }
    return {
      align: this.lastAlign,
      scaleU,
      scaleV,
      offsetU,
      offsetV,
      rotationDeg,
      textureId: ''
    };
  }

  /**
   * Writes mapping values into inputs.
   * @param mapping Source mapping.
   */
  private setMappingFields(mapping: FaceTextureMapping): void {
    this.lastAlign = mapping.align;
    this.scaleUInput.value = mapping.scaleU.toFixed(2);
    this.scaleVInput.value = mapping.scaleV.toFixed(2);
    this.offsetUInput.value = mapping.offsetU.toFixed(2);
    this.offsetVInput.value = mapping.offsetV.toFixed(2);
    this.rotationInput.value = mapping.rotationDeg.toFixed(1);
  }

  /**
   * Clears numeric inputs for mixed multi-selection.
   */
  private clearNumericFields(): void {
    this.scaleUInput.value = '';
    this.scaleVInput.value = '';
    this.offsetUInput.value = '';
    this.offsetVInput.value = '';
    this.rotationInput.value = '';
  }

  /**
   * Places the panel at the bottom-left of the default anchor (3D viewport).
   * Uses CSS bottom so the panel bottom sits at the viewport bottom with inset,
   * without depending on measured panel height (which is often zero before layout).
   */
  private positionDefault(): void {
    const paddingPx = 8;
    const anchor = this.defaultAnchor ?? this.host;
    const rect = anchor.getBoundingClientRect();
    const bottomInset = window.innerHeight - rect.bottom + paddingPx;
    this.root.style.left = `${rect.left + paddingPx}px`;
    this.root.style.right = 'auto';
    this.root.style.top = 'auto';
    this.root.style.bottom = `${bottomInset}px`;
  }

  /**
   * Enables dragging the panel from the title bar.
   * @param bar Title bar element.
   */
  private bindDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).tagName === 'BUTTON') return;
      this.isDragging = true;
      const rect = this.root.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      const onMove = (moveEvent: PointerEvent) => {
        if (!this.isDragging) return;
        this.root.style.left = `${moveEvent.clientX - this.dragOffsetX}px`;
        this.root.style.top = `${moveEvent.clientY - this.dragOffsetY}px`;
        this.root.style.bottom = 'auto';
        this.root.style.right = 'auto';
      };
      const onUp = () => {
        this.isDragging = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
