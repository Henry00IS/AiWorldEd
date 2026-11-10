import type { CurveVector } from '@/curve/model/curve_model.js';

/** Margin the editor keeps around the unit square when framing, in pixels. */
const CURVE_EDITOR_VIEW_MARGIN_PX = 28;

/** Smallest and largest zoom relative to a framed view. */
const CURVE_EDITOR_VIEW_ZOOM_RANGE = { min: 0.25, max: 64 } as const;

/**
 * Pan, zoom and orientation of the curve editor canvas. Normally curve x runs
 * right and y up; rotated, curve x runs up and y right, like an upright
 * pillar.
 */
export class CurveEditorView {
  /** True when curve x runs up the screen. */
  rotated = false;
  private width = 1;
  private height = 1;
  private readonly center: CurveVector = { x: 0.5, y: 0.5 };
  private readonly scale: CurveVector = { x: 1, y: 1 };
  private framedScale: CurveVector = { x: 1, y: 1 };

  /**
   * Creates a view.
   *
   * @param margin Margin kept around the unit square when framing, in pixels;
   *   previews smaller than the editor pass a smaller one.
   */
  constructor(private readonly margin = CURVE_EDITOR_VIEW_MARGIN_PX) {}

  /**
   * Sets the canvas size in CSS pixels, stretching the view with it so the
   * curve keeps filling the same share of the canvas.
   *
   * @param width Canvas width.
   * @param height Canvas height.
   */
  resize(width: number, height: number): void {
    const before = { x: this.usable(this.width), y: this.usable(this.height) };
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const ratio = { x: this.usable(this.width) / before.x, y: this.usable(this.height) / before.y };
    this.scale.x *= ratio.x;
    this.scale.y *= ratio.y;
    this.framedScale = { x: this.framedScale.x * ratio.x, y: this.framedScale.y * ratio.y };
  }

  /**
   * Returns the drawable length of a canvas side inside the margins.
   *
   * @param side Side length in CSS pixels.
   * @returns Usable pixels, at least one.
   */
  private usable(side: number): number {
    return Math.max(1, side - this.margin * 2);
  }

  /** Fits the unit square into the canvas. */
  frameAll(): void {
    this.center.x = 0.5;
    this.center.y = 0.5;
    this.scale.x = this.usable(this.width);
    this.scale.y = this.usable(this.height);
    this.framedScale = { ...this.scale };
  }

  /**
   * Maps a curve point to canvas pixels.
   *
   * @param point Curve point.
   * @returns Screen point.
   */
  toScreen(point: CurveVector): CurveVector {
    const across = this.rotated ? point.y : point.x;
    const along = this.rotated ? point.x : point.y;
    const centerAcross = this.rotated ? this.center.y : this.center.x;
    const centerAlong = this.rotated ? this.center.x : this.center.y;
    return {
      x: this.width / 2 + (across - centerAcross) * this.scale.x,
      y: this.height / 2 - (along - centerAlong) * this.scale.y,
    };
  }

  /**
   * Maps canvas pixels to a curve point.
   *
   * @param screen Screen point.
   * @returns Curve point.
   */
  toCurve(screen: CurveVector): CurveVector {
    const across = (screen.x - this.width / 2) / this.scale.x;
    const along = -(screen.y - this.height / 2) / this.scale.y;
    if (this.rotated) return { x: this.center.x + along, y: this.center.y + across };
    return { x: this.center.x + across, y: this.center.y + along };
  }

  /**
   * Moves the view by a screen offset.
   *
   * @param dx Horizontal pixels.
   * @param dy Vertical pixels.
   */
  pan(dx: number, dy: number): void {
    const across = -dx / this.scale.x;
    const along = dy / this.scale.y;
    this.center.x += this.rotated ? along : across;
    this.center.y += this.rotated ? across : along;
  }

  /**
   * Zooms around a screen point, keeping the curve point under it in place.
   *
   * @param screen Zoom centre in pixels.
   * @param factor Zoom factor; above 1 zooms in.
   */
  zoomAt(screen: CurveVector, factor: number): void {
    const before = this.toCurve(screen);
    const relative = Math.min(
      CURVE_EDITOR_VIEW_ZOOM_RANGE.max,
      Math.max(CURVE_EDITOR_VIEW_ZOOM_RANGE.min, (this.scale.x * factor) / this.framedScale.x),
    );
    const applied = (relative * this.framedScale.x) / this.scale.x;
    this.scale.x *= applied;
    this.scale.y *= applied;
    const after = this.toCurve(screen);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
  }

  /**
   * Returns pixels per curve unit along curve x and curve y.
   *
   * @returns Pixel density per axis.
   */
  pixelsPerUnit(): CurveVector {
    return this.rotated ? { x: this.scale.y, y: this.scale.x } : { x: this.scale.x, y: this.scale.y };
  }

  /**
   * Returns the canvas size.
   *
   * @returns Width and height in CSS pixels.
   */
  size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
