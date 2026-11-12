import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';
import { paintShapes } from '@/paint/shape/paint_shape_catalog.js';
import type { PaintShape } from '@/paint/shape/paint_shape.js';
import { PAINT_SHAPE_IMAGE_ID } from '@/paint/raster/paint_tile_raster.js';
import {
  PAINT_TOOL_RADIUS_MAX,
  PAINT_TOOL_RADIUS_MIN,
  PAINT_TOOL_STENCIL_SCALE_MAX,
  PAINT_TOOL_STENCIL_SCALE_MIN,
  type PaintToolMode,
  type PaintToolSettings,
} from '@/paint/tool/paint_tool_settings.js';
import { PAINT_PALETTE_CLASS, paintPaletteStylesheetEnsure } from './paint_palette_styles.js';

/** Steps of the logarithmic sliders. */
const PAINT_PALETTE_LOG_STEPS = 1000;

/** Pixel size of the shape previews (drawn at twice the shown size). */
const PAINT_PALETTE_SHAPE_PIXELS = 52;

/** A texture the palette can offer as a stamp or stencil. */
export interface PaintPaletteTextureChoice {
  /** Texture id. */
  readonly value: string;
  /** Shown name. */
  readonly label: string;
}

/** What the palette needs from the editor. */
export interface PaintPaletteHost {
  /** Returns the textures that can be used as stamps or stencils. */
  textureChoices(): readonly PaintPaletteTextureChoice[];
  /** Clears paint from the selected brushes. */
  onClearPaint(): void;
}

const PAINT_PALETTE_ICON_ERASER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M14.5 4.5l5 5-9 9H6l-2.5-2.5 11-11.5z"/><path fill="currentColor" opacity="0.45" d="M8.6 10.6l5 5-2.9 2.9H6l-2.5-2.5z"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 19.5h8"/></svg>';
const PAINT_PALETTE_ICON_PICK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M14 6l4 4-8.5 8.5L5 20l1.5-4.5z"/><path fill="currentColor" d="M15.2 3.8a2.3 2.3 0 0 1 3.3 0l1.7 1.7a2.3 2.3 0 0 1 0 3.3L18.6 10.4 13.6 5.4z"/></svg>';

/**
 * Maps a value in a range to a logarithmic slider step.
 *
 * @param value Value.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Step 0..PAINT_PALETTE_LOG_STEPS.
 */
export function paintPaletteLogStep(value: number, min: number, max: number): number {
  return Math.round((Math.log(value / min) / Math.log(max / min)) * PAINT_PALETTE_LOG_STEPS);
}

/**
 * Maps a logarithmic slider step to a value.
 *
 * @param step Step.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Value.
 */
export function paintPaletteLogValue(step: number, min: number, max: number): number {
  return min * Math.pow(max / min, step / PAINT_PALETTE_LOG_STEPS);
}

/**
 * Formats a length in meters for the palette.
 *
 * @param meters Length.
 * @returns Text such as "15 cm" or "1.2 m".
 */
export function paintPaletteLength(meters: number): string {
  if (meters < 1) return `${String(Math.round(meters * 100))} cm`;
  return `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
}

/**
 * Formats a color as #RRGGBB.
 *
 * @param color 0xRRGGBB.
 * @returns Hex text.
 */
function paintPaletteHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** One labelled slider. */
interface PaintPaletteSlider {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

/**
 * Floating palette of the paint tool: mode, color, size, strength, hardness,
 * stamp shapes, stamp image, stencil and clearing. It edits the shared tool
 * settings and redraws itself whenever they change, including from keyboard
 * shortcuts.
 */
export class PaintPalette {
  readonly root: HTMLElement;
  private readonly modeButtons = new Map<PaintToolMode, HTMLButtonElement>();
  private readonly shapeChips = new Map<
    string,
    { button: HTMLButtonElement; canvas: HTMLCanvasElement; shape: PaintShape }
  >();
  private readonly colorButton: HTMLElement;
  private readonly colorInput: HTMLInputElement;
  private readonly swatches: HTMLElement;
  private readonly size: PaintPaletteSlider;
  private readonly strength: PaintPaletteSlider;
  private readonly hardness: PaintPaletteSlider;
  private readonly stencilScale: PaintPaletteSlider;
  private readonly stampSelect: HTMLSelectElement;
  private readonly stencilSelect: HTMLSelectElement;
  private readonly removeListener: () => void;
  private drawnShapeColor = -1;
  private drawnHardness = -1;

  /**
   * Creates the palette inside a container; it starts hidden.
   *
   * @param container Element the palette floats in.
   * @param settings Tool settings.
   * @param host Editor access.
   */
  constructor(
    container: HTMLElement,
    private readonly settings: PaintToolSettings,
    private readonly host: PaintPaletteHost,
  ) {
    paintPaletteStylesheetEnsure();
    const c = PAINT_PALETTE_CLASS;
    this.root = document.createElement('div');
    this.root.className = c;
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', 'Paint');
    this.root.hidden = true;
    for (const type of ['pointerdown', 'mousedown', 'wheel', 'contextmenu'] as const) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }

    const top = this.element('div', `${c}-row`);
    const bottom = this.element('div', `${c}-row`);
    this.root.append(top, bottom);

    const modes = this.element('div', `${c}-group`);
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Mode');
    modes.append(
      this.modeButton('paint', 'Brush', 'B', ToolbarIcons.toolPaint()),
      this.modeButton('erase', 'Eraser', 'E', PAINT_PALETTE_ICON_ERASER),
      this.modeButton('pick', 'Pick Color', 'I or Alt+Click', PAINT_PALETTE_ICON_PICK),
    );

    this.colorButton = this.element('label', `${c}-color`);
    this.colorButton.title = 'Paint Color';
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.setAttribute('aria-label', 'Paint Color');
    this.colorInput.addEventListener('input', () =>
      this.settings.setColor(parseInt(this.colorInput.value.slice(1), 16)),
    );
    this.colorInput.addEventListener('change', () => this.settings.rememberColor(this.settings.color));
    this.colorButton.append(this.colorInput);
    this.swatches = this.element('div', `${c}-swatches`);
    this.swatches.setAttribute('role', 'group');
    this.swatches.setAttribute('aria-label', 'Recent Colors');
    const colors = this.element('div', `${c}-group`);
    colors.append(this.colorButton, this.swatches);

    this.size = this.slider('Size', 0, PAINT_PALETTE_LOG_STEPS, (step) =>
      this.settings.setRadius(paintPaletteLogValue(step, PAINT_TOOL_RADIUS_MIN, PAINT_TOOL_RADIUS_MAX)),
    );
    this.size.root.title = 'Brush Size ([ and ])';
    this.strength = this.slider('Strength', 2, 100, (value) => this.settings.setOpacity(value / 100));
    this.strength.root.title = 'Strength (1 to 0 keys)';
    this.hardness = this.slider('Hardness', 0, 100, (value) => this.settings.setHardness(value / 100));
    this.hardness.root.title = 'Edge Hardness (Shift+[ and Shift+])';
    top.append(modes, this.divider(), colors, this.divider(), this.size.root, this.strength.root, this.hardness.root);

    const shapes = this.element('div', `${c}-group`);
    shapes.setAttribute('role', 'group');
    shapes.setAttribute('aria-label', 'Shape');
    for (const shape of paintShapes) shapes.append(this.shapeChip(shape));

    this.stampSelect = this.select('Stamp Image', (value) => this.settings.setStampTextureId(value));
    this.stencilSelect = this.select('Stencil', (value) => this.settings.setStencilTextureId(value));
    this.stencilScale = this.slider('Stencil Size', 0, PAINT_PALETTE_LOG_STEPS, (step) =>
      this.settings.setStencilScale(
        paintPaletteLogValue(step, PAINT_TOOL_STENCIL_SCALE_MIN, PAINT_TOOL_STENCIL_SCALE_MAX),
      ),
    );
    const clear = this.button('Clear Paint', 'Remove all paint from the selected brushes', () =>
      this.host.onClearPaint(),
    );
    bottom.append(
      shapes,
      this.divider(),
      this.field('Stamp Image', this.stampSelect),
      this.field('Stencil', this.stencilSelect),
      this.stencilScale.root,
      this.divider(),
      clear,
    );

    container.append(this.root);
    this.removeListener = this.settings.listen(() => this.refresh());
    this.refresh();
  }

  /**
   * Shows or hides the palette.
   *
   * @param visible True to show.
   */
  setVisible(visible: boolean): void {
    if (visible) this.refreshTextureChoices();
    this.root.hidden = !visible;
  }

  /** Removes the palette. */
  dispose(): void {
    this.removeListener();
    this.root.remove();
  }

  /** Redraws every control from the settings. */
  refresh(): void {
    const settings = this.settings;
    for (const [mode, button] of this.modeButtons) button.setAttribute('aria-pressed', String(settings.mode === mode));
    const hex = paintPaletteHex(settings.color);
    this.colorButton.style.background = hex;
    if (this.colorInput.value !== hex) this.colorInput.value = hex;
    this.refreshSwatches();
    this.size.input.value = String(paintPaletteLogStep(settings.radius, PAINT_TOOL_RADIUS_MIN, PAINT_TOOL_RADIUS_MAX));
    this.size.output.value = paintPaletteLength(settings.radius);
    this.strength.input.value = String(Math.round(settings.opacity * 100));
    this.strength.output.value = `${String(Math.round(settings.opacity * 100))}%`;
    this.hardness.input.value = String(Math.round(settings.hardness * 100));
    this.hardness.output.value = `${String(Math.round(settings.hardness * 100))}%`;
    this.stencilScale.input.value = String(
      paintPaletteLogStep(settings.stencilScale, PAINT_TOOL_STENCIL_SCALE_MIN, PAINT_TOOL_STENCIL_SCALE_MAX),
    );
    this.stencilScale.output.value = paintPaletteLength(settings.stencilScale);
    this.stencilScale.input.disabled = settings.stencilTextureId === '';
    const imageShape = settings.shape === PAINT_SHAPE_IMAGE_ID && settings.stampTextureId !== '';
    for (const [id, chip] of this.shapeChips)
      chip.button.setAttribute('aria-pressed', String(!imageShape && settings.shape === id));
    this.selectValue(this.stampSelect, imageShape ? settings.stampTextureId : '');
    this.selectValue(this.stencilSelect, settings.stencilTextureId);
    if (this.drawnShapeColor !== settings.color || this.drawnHardness !== settings.hardness) this.drawShapes();
  }

  /** Refills the stamp and stencil lists from the texture library. */
  refreshTextureChoices(): void {
    const choices = this.host.textureChoices();
    for (const select of [this.stampSelect, this.stencilSelect]) {
      const options = [{ value: '', label: 'None' }, ...choices].map((choice) => {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        return option;
      });
      select.replaceChildren(...options);
    }
    this.refresh();
  }

  /**
   * Selects a value, adding it when the list does not have it.
   *
   * @param select Select element.
   * @param value Value.
   */
  private selectValue(select: HTMLSelectElement, value: string): void {
    if (![...select.options].some((option) => option.value === value)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = value;
  }

  /** Rebuilds the recent color swatches. */
  private refreshSwatches(): void {
    const colors = this.settings.recentColors;
    const current = [...this.swatches.children].map((child) => (child as HTMLElement).dataset['color']).join(',');
    if (current === colors.map(paintPaletteHex).join(',')) return;
    this.swatches.replaceChildren(
      ...colors.map((color) => {
        const hex = paintPaletteHex(color);
        const swatch = this.element('button', `${PAINT_PALETTE_CLASS}-swatch`) as HTMLButtonElement;
        swatch.type = 'button';
        swatch.dataset['color'] = hex;
        swatch.style.background = hex;
        swatch.title = hex.toUpperCase();
        swatch.setAttribute('aria-label', `Use Color ${hex.toUpperCase()}`);
        swatch.addEventListener('click', () => {
          this.settings.setColor(color);
          if (this.settings.mode !== 'paint') this.settings.setMode('paint');
        });
        return swatch;
      }),
    );
  }

  /** Draws the shape previews in the paint color. */
  private drawShapes(): void {
    this.drawnShapeColor = this.settings.color;
    this.drawnHardness = this.settings.hardness;
    const red = (this.settings.color >> 16) & 255;
    const green = (this.settings.color >> 8) & 255;
    const blue = this.settings.color & 255;
    for (const chip of this.shapeChips.values()) {
      const context = chip.canvas.getContext('2d');
      if (context === null) continue;
      const size = PAINT_PALETTE_SHAPE_PIXELS;
      const pixels = context.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) / size) * 2 - 1;
          const v = 1 - ((y + 0.5) / size) * 2;
          const coverage = chip.shape.coverage(u, v, 2.5 / size, Math.max(0.5, this.settings.hardness), 0);
          const index = (y * size + x) * 4;
          pixels.data[index] = red;
          pixels.data[index + 1] = green;
          pixels.data[index + 2] = blue;
          pixels.data[index + 3] = Math.round(coverage * 255);
        }
      }
      context.putImageData(pixels, 0, 0);
    }
  }

  /**
   * Creates an element with a class.
   *
   * @param tag Tag name.
   * @param className Class.
   * @returns Element.
   */
  private element(tag: string, className: string): HTMLElement {
    const element = document.createElement(tag);
    element.className = className;
    return element;
  }

  /**
   * Creates a vertical divider.
   *
   * @returns Divider.
   */
  private divider(): HTMLElement {
    const divider = this.element('div', `${PAINT_PALETTE_CLASS}-divider`);
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  }

  /**
   * Creates a text button.
   *
   * @param label Label.
   * @param tooltip Tooltip.
   * @param onClick Click handler.
   * @returns Button.
   */
  private button(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
    const button = this.element('button', `${PAINT_PALETTE_CLASS}-button`) as HTMLButtonElement;
    button.type = 'button';
    button.textContent = label;
    button.title = tooltip;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Creates a mode toggle.
   *
   * @param mode Mode.
   * @param label Label.
   * @param shortcut Shortcut text.
   * @param icon SVG icon.
   * @returns Button.
   */
  private modeButton(mode: PaintToolMode, label: string, shortcut: string, icon: string): HTMLButtonElement {
    const button = this.button('', `${label} (${shortcut})`, () => this.settings.setMode(mode));
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    this.modeButtons.set(mode, button);
    return button;
  }

  /**
   * Creates a shape chip.
   *
   * @param shape Shape.
   * @returns Button.
   */
  private shapeChip(shape: PaintShape): HTMLButtonElement {
    const button = this.element('button', `${PAINT_PALETTE_CLASS}-chip`) as HTMLButtonElement;
    button.type = 'button';
    button.title = shape.label;
    button.setAttribute('aria-label', shape.label);
    const canvas = document.createElement('canvas');
    canvas.width = PAINT_PALETTE_SHAPE_PIXELS;
    canvas.height = PAINT_PALETTE_SHAPE_PIXELS;
    canvas.setAttribute('aria-hidden', 'true');
    button.append(canvas);
    button.addEventListener('click', () => {
      this.settings.setShape(shape.id);
      if (this.settings.mode === 'pick') this.settings.setMode('paint');
    });
    this.shapeChips.set(shape.id, { button, canvas, shape });
    return button;
  }

  /**
   * Creates a labelled slider.
   *
   * @param label Label.
   * @param min Minimum step.
   * @param max Maximum step.
   * @param onInput Called with the step while dragging.
   * @returns Slider parts.
   */
  private slider(label: string, min: number, max: number, onInput: (value: number) => void): PaintPaletteSlider {
    const root = this.element('div', `${PAINT_PALETTE_CLASS}-slider`);
    const id = `${PAINT_PALETTE_CLASS}-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const text = document.createElement('label');
    text.textContent = label;
    text.htmlFor = id;
    const output = document.createElement('output');
    output.htmlFor.add(id);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.addEventListener('input', () => onInput(Number(input.value)));
    root.append(text, output, input);
    return { root, input, output };
  }

  /**
   * Creates a texture select.
   *
   * @param label Accessible label.
   * @param onChange Called with the chosen texture id.
   * @returns Select element.
   */
  private select(label: string, onChange: (value: string) => void): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    select.addEventListener('change', () => onChange(select.value));
    select.addEventListener('focus', () => {
      const value = select.value;
      this.refreshTextureChoices();
      select.value = value;
    });
    return select;
  }

  /**
   * Wraps a control with a label above it.
   *
   * @param label Label.
   * @param control Control.
   * @returns Field.
   */
  private field(label: string, control: HTMLElement): HTMLElement {
    const field = this.element('div', `${PAINT_PALETTE_CLASS}-field`);
    const text = document.createElement('label');
    text.textContent = label;
    const id = `${PAINT_PALETTE_CLASS}-${label.toLowerCase().replace(/\s+/g, '-')}`;
    control.id = id;
    text.htmlFor = id;
    field.append(text, control);
    return field;
  }
}
