import type { Curve } from '@/curve/model/curve_model.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { curveDrawPreview } from './curve_draw.js';
import { CurveEditor, curveEditorActiveFor } from './curve_editor.js';
import { curveDropBind } from './curve_drop.js';
import { CURVE_UI_COLORS, CURVE_UI_STRIP_HEIGHT_PX } from './curve_ui_style.js';
import type { CurveFileLoadResult } from './curve_file_io.js';

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
}

/**
 * Reusable curve field: a preview strip that opens the curve editor on click
 * and accepts dropped .curve files from the project browser or the desktop.
 */
export class CurveField {
  private readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private curve: Curve | null = null;
  private rotated = false;

  /**
   * Builds the field.
   *
   * @param options Field options.
   */
  constructor(private readonly options: CurveFieldOptions) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%' });
    this.element = this.createElement();
    this.element.appendChild(this.canvas);
    curveDropBind(this.element, (result) => this.dropped(result));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.draw()).observe(this.element);
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
    curveEditorActiveFor(this.element)?.adopt(curve);
    this.draw();
  }

  /** Opens the curve editor, or closes it when it is already open. */
  open(): void {
    const active = curveEditorActiveFor(this.element);
    if (active) return active.close();
    if (!this.curve) return;
    CurveEditor.open({
      title: `${this.options.label} curve`,
      anchor: this.element,
      curve: this.curve,
      presets: this.options.presets,
      fileName: this.options.fileName,
      rotated: this.rotated,
      onPreview: (curve) => this.changed(curve, false),
      onCommit: (curve) => this.changed(curve, true),
      onClose: (rotated) => (this.rotated = rotated),
    });
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
    element.setAttribute('aria-label', `${this.options.label}: click to edit, or drop a .curve file`);
    element.title = `${this.options.label}: click to edit. Drop a .curve file to load it.`;
    Object.assign(element.style, { height: `${CURVE_UI_STRIP_HEIGHT_PX}px`, flex: '1', minWidth: '0' });
    Object.assign(element.style, { cursor: 'pointer', borderRadius: '3px', overflow: 'hidden' });
    element.style.background = CURVE_UI_COLORS.background;
    element.style.border = '1px solid #4a4a4a';
    element.addEventListener('click', () => this.open());
    element.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && this.open());
    return element;
  }

  /** Redraws the strip at its current size. */
  private draw(): void {
    if (!this.curve) return;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round((this.element.clientWidth || 160) * ratio));
    this.canvas.height = Math.max(1, Math.round((this.element.clientHeight || CURVE_UI_STRIP_HEIGHT_PX) * ratio));
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
    if ('error' in result) {
      this.element.title = result.error;
      return;
    }
    this.setCurve(result.curve);
    this.options.onCommit(result.curve);
  }
}
