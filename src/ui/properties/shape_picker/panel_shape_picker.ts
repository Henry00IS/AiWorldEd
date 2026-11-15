import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  modifierGeneratorIconBrushSvg,
  modifierGeneratorIconSvg,
} from '@/modifier/stack/ui/generator_icon/modifier_generator_icon.js';
import { SOLID_BRUSH_SHAPE_LABELS, SOLID_BRUSH_SHAPES, type SolidBrushShape } from '@/solid/brush/solid_brush_shape.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** What the picker does when a tile is clicked. */
export interface PanelShapePickerHandlers {
  /** Adds a plain brush of a shape. */
  onAddBrush: (shape: SolidBrushShape) => void;
  /** Adds a generator node of a kind. */
  onAddGenerator: (kind: string) => void;
}

/** Caption shown while no tile is hovered. */
const PANEL_SHAPE_PICKER_CAPTION = 'Add Shape';

/** Class of every tile, styled by the shared stylesheet. */
const PANEL_SHAPE_PICKER_TILE_CLASS = 'aiworlded-shape-picker-tile';

/** Identifier of the shared tile stylesheet. */
const PANEL_SHAPE_PICKER_STYLE_ID = 'aiworlded-shape-picker-style';

/** What adding each plain brush shape does. */
const PANEL_SHAPE_PICKER_BRUSH_DESCRIPTIONS: Readonly<Record<SolidBrushShape, string>> = {
  box: 'Adds a plain box brush to the solid model.',
  wedge: 'Adds a plain wedge (ramp) brush to the solid model, edited like any other brush.',
};

/**
 * Grid of icon tiles adding a box or wedge brush or a generator node to the
 * solid, each icon drawn from the shape itself. A caption above names the
 * hovered tile.
 */
export class PanelShapePicker {
  private readonly element: HTMLElement;
  private readonly caption: HTMLElement;

  /**
   * Builds the caption and tile grid.
   *
   * @param handlers Click handlers.
   */
  constructor(private readonly handlers: PanelShapePickerHandlers) {
    panelShapePickerStylesheetEnsure();
    this.element = document.createElement('div');
    Object.assign(this.element.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
    this.caption = document.createElement('div');
    this.caption.dataset['shapePickerCaption'] = '';
    this.caption.textContent = PANEL_SHAPE_PICKER_CAPTION;
    const palette = getActiveUiThemePalette();
    Object.assign(this.caption.style, { fontSize: '11px', color: palette.panelTextColor, minHeight: '14px' });
    this.element.append(this.caption, this.createGrid());
  }

  /**
   * Returns the picker element.
   *
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Builds the tile grid: the plain brushes first, then every generator kind.
   *
   * @returns Grid element.
   */
  private createGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.dataset['shapePickerGrid'] = '';
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))',
      gap: '4px',
    });
    grid.append(
      ...SOLID_BRUSH_SHAPES.map((shape) => this.createBrushTile(shape)),
      ...MODIFIER_GENERATOR_NODE_KINDS.map((kind) => this.createGeneratorTile(kind)),
    );
    return grid;
  }

  /**
   * Builds the tile of one plain brush shape.
   *
   * @param shape Brush shape.
   * @returns Tile button.
   */
  private createBrushTile(shape: SolidBrushShape): HTMLButtonElement {
    const label = SOLID_BRUSH_SHAPE_LABELS[shape];
    const tile = this.createTile(
      label,
      PANEL_SHAPE_PICKER_BRUSH_DESCRIPTIONS[shape],
      modifierGeneratorIconBrushSvg(shape),
    );
    tile.dataset['addBrush'] = shape;
    tile.addEventListener('click', () => this.handlers.onAddBrush(shape));
    return tile;
  }

  /**
   * Builds the tile of one generator kind.
   *
   * @param kind Generator kind id.
   * @returns Tile button.
   */
  private createGeneratorTile(kind: string): HTMLButtonElement {
    const found = modifierStackKindFind(kind);
    const label = found?.label ?? kind;
    const tile = this.createTile(
      label,
      `${found?.description ?? ''} Stays editable until converted to brushes.`,
      modifierGeneratorIconSvg(kind),
    );
    tile.dataset['addGenerator'] = kind;
    tile.addEventListener('click', () => this.handlers.onAddGenerator(kind));
    return tile;
  }

  /**
   * Builds one icon tile that names itself in the caption while hovered.
   *
   * @param label Shape name in Title Case.
   * @param description What adding the shape does.
   * @param icon SVG markup.
   * @returns Tile button.
   */
  private createTile(label: string, description: string, icon: string): HTMLButtonElement {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = PANEL_SHAPE_PICKER_TILE_CLASS;
    tile.innerHTML = icon;
    tile.title = `${label}: ${description}`;
    tile.setAttribute('aria-label', `Add ${label}`);
    tile.addEventListener('mouseenter', () => (this.caption.textContent = label));
    tile.addEventListener('mouseleave', () => (this.caption.textContent = PANEL_SHAPE_PICKER_CAPTION));
    return tile;
  }
}

/**
 * Adds the tile stylesheet once. Colours are theme variables, so tiles follow
 * the light and dark themes live; the icon backing matches the tile so shapes
 * hide what is behind them.
 */
function panelShapePickerStylesheetEnsure(): void {
  if (document.getElementById(PANEL_SHAPE_PICKER_STYLE_ID)) return;
  const palette = getActiveUiThemePalette();
  const style = document.createElement('style');
  style.id = PANEL_SHAPE_PICKER_STYLE_ID;
  const tile = `.${PANEL_SHAPE_PICKER_TILE_CLASS}`;
  style.textContent = [
    `${tile} { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; min-width: 0; padding: 4px; cursor: pointer; border-radius: 6px; border: 1px solid ${palette.panelBorderColorInner}; background: ${palette.controlBackground}; color: ${palette.panelTextColor}; --generator-icon-backing: ${palette.controlBackground}; }`,
    `${tile}:hover, ${tile}:focus-visible { background: ${palette.controlHoverBackground}; --generator-icon-backing: ${palette.controlHoverBackground}; }`,
    `${tile} svg { width: 100%; height: 100%; max-width: 26px; max-height: 26px; pointer-events: none; }`,
  ].join('\n');
  document.head.appendChild(style);
}
