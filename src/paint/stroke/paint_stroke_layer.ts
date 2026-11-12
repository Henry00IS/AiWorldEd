import { paintStrokeCompare, type PaintStroke } from './paint_stroke.js';
import { paintStrokeDecode, paintStrokeEncode, type PaintStrokeSerialized } from './paint_stroke_codec.js';

/** Saved form of a brush's strokes, keyed by stroke id. */
export type PaintStrokeLayerSerialized = Record<string, PaintStrokeSerialized>;

/**
 * The stroke records of one brush. Strokes are immutable and keyed by id, so
 * adding, removing and syncing one stroke never touches the others. The
 * revision changes on every mutation so caches know when to rebake.
 */
export class PaintStrokeLayer {
  private readonly strokes = new Map<string, PaintStroke>();
  private orderedCache: PaintStroke[] | null = null;
  private revisionValue = 0;

  /**
   * Returns a number that changes whenever the strokes change.
   *
   * @returns Revision.
   */
  get revision(): number {
    return this.revisionValue;
  }

  /**
   * Returns the number of strokes.
   *
   * @returns Stroke count.
   */
  get size(): number {
    return this.strokes.size;
  }

  /**
   * Returns whether the brush has no paint.
   *
   * @returns True when empty.
   */
  isEmpty(): boolean {
    return this.strokes.size === 0;
  }

  /**
   * Returns a stroke by id.
   *
   * @param id Stroke id.
   * @returns Stroke, or undefined.
   */
  get(id: string): PaintStroke | undefined {
    return this.strokes.get(id);
  }

  /**
   * Adds or replaces a stroke.
   *
   * @param stroke Stroke record.
   */
  add(stroke: PaintStroke): void {
    this.strokes.set(stroke.id, stroke);
    this.changed();
  }

  /**
   * Removes a stroke.
   *
   * @param id Stroke id.
   * @returns Removed stroke, or undefined when absent.
   */
  remove(id: string): PaintStroke | undefined {
    const stroke = this.strokes.get(id);
    if (stroke === undefined) return undefined;
    this.strokes.delete(id);
    this.changed();
    return stroke;
  }

  /** Removes every stroke. */
  clear(): void {
    if (this.strokes.size === 0) return;
    this.strokes.clear();
    this.changed();
  }

  /**
   * Returns the strokes in application order.
   *
   * @returns Ordered strokes (shared array; do not mutate).
   */
  ordered(): readonly PaintStroke[] {
    if (this.orderedCache === null) {
      this.orderedCache = Array.from(this.strokes.values()).sort(paintStrokeCompare);
    }
    return this.orderedCache;
  }

  /**
   * Returns the order a new stroke on this brush should use.
   *
   * @returns One more than the highest order so far.
   */
  nextOrder(): number {
    const ordered = this.ordered();
    const last = ordered[ordered.length - 1];
    return last === undefined ? 1 : last.order + 1;
  }

  /**
   * Copies the strokes into a new layer. Strokes are immutable and shared.
   *
   * @returns Independent layer.
   */
  clone(): PaintStrokeLayer {
    const copy = new PaintStrokeLayer();
    copy.replaceFrom(this);
    return copy;
  }

  /**
   * Replaces every stroke with the strokes of another layer.
   *
   * @param other Source layer.
   */
  replaceFrom(other: PaintStrokeLayer): void {
    if (this.sameStrokesAs(other)) return;
    this.strokes.clear();
    for (const stroke of other.ordered()) this.strokes.set(stroke.id, stroke);
    this.changed();
  }

  /**
   * Encodes the strokes in application order.
   *
   * @returns Saved record, or undefined when there is no paint.
   */
  encode(): PaintStrokeLayerSerialized | undefined {
    if (this.strokes.size === 0) return undefined;
    const record: PaintStrokeLayerSerialized = {};
    for (const stroke of this.ordered()) record[stroke.id] = paintStrokeEncode(stroke);
    return record;
  }

  /**
   * Decodes a saved record; malformed strokes are skipped.
   *
   * @param value Saved value, or anything else for an empty layer.
   * @returns Layer.
   */
  static decode(value: unknown): PaintStrokeLayer {
    const layer = new PaintStrokeLayer();
    layer.applySerialized(value);
    return layer;
  }

  /**
   * Makes the layer hold exactly the strokes of a saved record. Strokes whose
   * id the layer already holds are kept without decoding them again, since an
   * id never names two different records.
   *
   * @param value Saved record, or anything else for no paint.
   */
  applySerialized(value: unknown): void {
    const record =
      typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    let changed = false;
    for (const id of [...this.strokes.keys()]) {
      if (Object.hasOwn(record, id)) continue;
      this.strokes.delete(id);
      changed = true;
    }
    for (const [id, entry] of Object.entries(record)) {
      if (this.strokes.has(id)) continue;
      const stroke = paintStrokeDecode(id, entry);
      if (stroke === null) continue;
      this.strokes.set(id, stroke);
      changed = true;
    }
    if (changed) this.changed();
  }

  /**
   * Returns whether another layer holds the same stroke ids. A stroke id never
   * names two different records, so equal ids mean equal paint.
   *
   * @param other Other layer.
   * @returns True when both hold the same strokes.
   */
  private sameStrokesAs(other: PaintStrokeLayer): boolean {
    if (other.strokes.size !== this.strokes.size) return false;
    for (const id of other.strokes.keys()) {
      if (!this.strokes.has(id)) return false;
    }
    return true;
  }

  /** Invalidates caches and bumps the revision. */
  private changed(): void {
    this.orderedCache = null;
    this.revisionValue++;
  }
}
