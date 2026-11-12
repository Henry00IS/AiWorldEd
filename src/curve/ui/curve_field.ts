import type { Curve } from '@/curve/model/curve_model.js';
import { curveMarkerSwitch, type CurveMarkerSide } from '@/curve/model/curve_markers.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { curveDrawPreview } from './curve_draw.js';
import {
  CurveEditor,
  curveEditorActiveFor,
  curveEditorReattach,
  type CurveEditorHandlers,
  type CurveEditorHistory,
} from './curve_editor.js';
import { curveDropBind } from './curve_drop.js';
import { CURVE_UI_COLORS, CURVE_UI_STRIP_HEIGHT_PX } from './curve_ui_style.js';
import type { CurveFileLoadResult } from './curve_file_io.js';
import { curveDragSet } from './curve_drag.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';

/** What a curve field shows and whom it tells. */
export interface CurveFieldOptions {
  /** Accessible name and editor title. */
  label: string;
  /** Presets offered by the editor. */
  presets: readonly CurvePreset[];
  /** Default file name for Save. */
  fileName: string;
  /** Receives live drag steps. */
  onPreview: (curve: Curve) => void;
  /** Receives final changes. */
  onCommit: (curve: Curve) => void;
  /** Identity of the edited value, so a rebuilt field keeps the open editor. */
  editorKey?: string;
  /** History the commits enter, stepped by the editor's Undo and Redo. */
  history?: CurveEditorHistory;
  /** Base and Top marker toggles under the strip, styled by the host. */
  markers?: CurveFieldMarkerStyle;
}

/** How the host draws the marker toggles of a curve field. */
export interface CurveFieldMarkerStyle {
  /** Creates one toggle button. */
  create: (label: string, title: string, onClick: () => void) => HTMLButtonElement;
  /** Shows a toggle on or off. */
  active: (button: HTMLButtonElement, on: boolean) => void;
}

/** Caption and tooltip of the marker toggles under a curve field. */
export const CURVE_FIELD_MARKER_BUTTONS: Readonly<Record<CurveMarkerSide, readonly [string, string]>> = {
  bottom: [
    'Base',
    'Base marker: the profile below it keeps a fixed height. Switches it on at its remembered place, or off; same as Base in the curve editor',
  ],
  top: [
    'Top',
    'Top marker: the profile above it keeps a fixed height. Switches it on at its remembered place, or off; same as Top in the curve editor',
  ],
};

/**
 * Reusable curve field: a preview strip that opens the curve editor on click
 * and accepts dropped .aicurve files from the project browser or the desktop.
 */
export class CurveField {
  /** The strip, or the strip over a row of its marker toggles. */
  private readonly element: HTMLElement;
  /** The clickable preview; the editor's anchor. */
  private readonly strip: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly markerButtons = new Map<CurveMarkerSide, HTMLButtonElement>();
  private curve: Curve | null = null;
  private rotated = false;
  /** True while this strip's own curve is being dragged, so it ignores itself. */
  private dragging = false;

  /**
   * Builds the field.
   *
   * @param options Field options.
   */
  constructor(private readonly options: CurveFieldOptions) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%' });
    this.strip = this.createElement();
    this.strip.appendChild(this.canvas);
    this.element = options.markers ? this.createMarkerRow(options.markers) : this.strip;
    curveDropBind(this.element, (result) => this.dropped(result));
    if (options.editorKey) curveEditorReattach(options.editorKey, this.strip, this.editorHandlers());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.draw()).observe(this.strip);
  }

  /**
   * Returns the field element.
   *
   * @returns Element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Shows a curve; an open editor of this field follows it.
   *
   * @param curve Curve.
   */
  setCurve(curve: Curve): void {
    this.curve = curve;
    curveEditorActiveFor(this.strip)?.adopt(curve);
    this.draw();
  }

  /**
   * Switches a section marker on at its remembered place, or off, exactly as
   * the editor's toggle does: through an open editor (its undo, its view), else
   * straight on the curve, committed as one change.
   *
   * @param side Marker.
   */
  toggleMarker(side: CurveMarkerSide): void {
    if (!this.curve) return;
    const on = this.curve.markers?.[side] === undefined;
    const editor = curveEditorActiveFor(this.strip);
    if (editor) editor.setMarker(side, on);
    else this.changed(curveMarkerSwitch(this.curve, side, on), true);
  }

  /** Opens the curve editor, or closes it when it is already open. */
  open(): void {
    const active = curveEditorActiveFor(this.strip);
    if (active) return active.close();
    if (!this.curve) return;
    CurveEditor.open({
      title: `${this.options.label} curve`,
      anchor: this.strip,
      ...(this.options.editorKey ? { key: this.options.editorKey } : {}),
      curve: this.curve,
      presets: this.options.presets,
      fileName: this.options.fileName,
      rotated: this.rotated,
      ...this.editorHandlers(),
    });
  }

  /**
   * Returns the callbacks the editor reports to.
   *
   * @returns Handlers.
   */
  private editorHandlers(): CurveEditorHandlers {
    return {
      onPreview: (curve) => this.changed(curve, false),
      onCommit: (curve) => this.changed(curve, true),
      onClose: (rotated) => (this.rotated = rotated),
      ...(this.options.history ? { history: this.options.history } : {}),
    };
  }

  /**
   * Builds the clickable strip.
   *
   * @returns Strip element.
   */
  private createElement(): HTMLElement {
    const element = document.createElement('div');
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `${this.options.label}: click to edit, or drop a .aicurve file`);
    element.title = `${this.options.label}: click to edit. Drop a .aicurve file to load it.`;
    Object.assign(element.style, { height: `${CURVE_UI_STRIP_HEIGHT_PX}px`, flex: '1', minWidth: '0' });
    Object.assign(element.style, { cursor: 'pointer', borderRadius: '3px', overflow: 'hidden' });
    element.style.background = CURVE_UI_COLORS.background;
    element.style.border = '1px solid #4a4a4a';
    element.addEventListener('click', () => this.open());
    element.draggable = true;
    element.addEventListener('dragstart', (event) => this.dragStart(event));
    element.addEventListener('dragend', () => (this.dragging = false));
    element.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && this.open());
    return element;
  }

  /**
   * Stacks the strip over a full-width row of its Base and Top toggles.
   *
   * @param style Host button style.
   * @returns Field element.
   */
  private createMarkerRow(style: CurveFieldMarkerStyle): HTMLElement {
    const field = document.createElement('div');
    field.dataset['curveField'] = '';
    Object.assign(field.style, { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '6px', minWidth: '0' });
    for (const side of ['bottom', 'top'] as const) {
      const [label, title] = CURVE_FIELD_MARKER_BUTTONS[side];
      const button = style.create(label, title, () => this.toggleMarker(side));
      button.dataset['curveMarker'] = side;
      this.markerButtons.set(side, button);
      row.appendChild(button);
    }
    // In a column the strip's flex: 1 would size its height, not its width.
    this.strip.style.flex = '0 0 auto';
    field.append(this.strip, row);
    return field;
  }

  /**
   * Lets the preview be dragged into the chat or onto another curve field as a
   * .aicurve file.
   *
   * @param event Drag start.
   */
  private dragStart(event: DragEvent): void {
    if (!this.curve || !event.dataTransfer) return;
    const name = this.options.fileName || this.options.label;
    curveDragSet(event.dataTransfer, { name, text: curveFileWrite(this.curve, name) });
    this.dragging = true;
  }

  /** Redraws the strip at its current size. */
  private draw(): void {
    if (!this.curve) return;
    for (const [side, button] of this.markerButtons)
      this.options.markers?.active(button, this.curve.markers?.[side] !== undefined);
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round((this.strip.clientWidth || 160) * ratio));
    this.canvas.height = Math.max(1, Math.round((this.strip.clientHeight || CURVE_UI_STRIP_HEIGHT_PX) * ratio));
    curveDrawPreview(this.canvas, this.curve);
  }

  /**
   * Shows and reports an edit.
   *
   * @param curve New curve.
   * @param final True for a commit.
   */
  private changed(curve: Curve, final: boolean): void {
    this.curve = curve;
    this.draw();
    if (final) this.options.onCommit(curve);
    else this.options.onPreview(curve);
  }

  /**
   * Applies a dropped curve file.
   *
   * @param result Loaded curve or error.
   */
  private dropped(result: CurveFileLoadResult): void {
    if (this.dragging) return;
    if ('error' in result) {
      this.strip.title = result.error;
      return;
    }
    this.setCurve(result.curve);
    this.options.onCommit(result.curve);
  }
}
