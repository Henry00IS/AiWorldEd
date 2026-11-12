import * as THREE from 'three';
import { paintShapeFind } from '@/paint/shape/paint_shape_catalog.js';
import type { PaintShape } from '@/paint/shape/paint_shape.js';
import { PAINT_DAB_STRIDE, type PaintStroke } from '@/paint/stroke/paint_stroke.js';
import { paintDabsQuantize } from '@/paint/stroke/paint_stroke_codec.js';
import type { PaintStrokeStyle } from '@/paint/stroke/paint_stroke_style.js';

/**
 * Most dabs one stroke record holds before the stroke continues in a new
 * record.
 */
export const PAINT_STROKE_MAX_DABS = 2048;

/** Smallest distance between dabs as a fraction of the radius. */
const PAINT_STROKE_MIN_STEP = 0.05;

/**
 * Distance, as a fraction of the spacing, the pointer must travel before the
 * first stamp is placed, so stamps face the direction of travel.
 */
const PAINT_STROKE_STAMP_AIM = 0.25;

/** A brush a stroke may reach. */
export interface PaintStrokeTarget {
  /** Unique key of the brush. */
  readonly key: string;
  /** World to brush-local transform. */
  readonly worldToLocal: THREE.Matrix4;
  /** World bounds of the brush. */
  readonly worldBounds: THREE.Box3;
  /** Order the first record on this brush gets. */
  readonly order: number;
}

/** One finished or growing record of a stroke on one brush. */
export interface PaintStrokeBuilderRecord {
  /** Target brush. */
  readonly target: PaintStrokeTarget;
  /** Record. */
  readonly stroke: PaintStroke;
}

/** Growing dab list of one record on one brush. */
interface PaintStrokeBuilderLane {
  readonly target: PaintStrokeTarget;
  readonly radius: number;
  readonly order: number;
  readonly id: string;
  dabs: Float32Array;
  count: number;
  stroke: PaintStroke | null;
}

/** World-space dab placed by the builder. */
export interface PaintStrokeBuilderDab {
  /** Center. */
  readonly center: THREE.Vector3;
  /** Direction into the surface. */
  readonly forward: THREE.Vector3;
  /** Up direction of the stamp. */
  readonly up: THREE.Vector3;
}

/**
 * Turns a pointer path over surfaces into stroke records. Dabs are placed at
 * the shape's spacing along the path, oriented along the direction of travel (a
 * stamp waits for the first movement to know its direction), and copied into
 * the local space of every brush they reach. Long strokes continue in fresh
 * records so no record grows past {@link PAINT_STROKE_MAX_DABS}.
 */
export class PaintStrokeBuilder {
  private readonly shape: PaintShape;
  private readonly lanes = new Map<string, PaintStrokeBuilderLane>();
  private readonly finished: PaintStrokeBuilderRecord[] = [];
  private readonly lastPoint = new THREE.Vector3();
  private readonly lastUp = new THREE.Vector3(0, 1, 0);
  private readonly lastNormal = new THREE.Vector3(0, 1, 0);
  private readonly scratchSphere = new THREE.Sphere();
  private readonly scratchCenter = new THREE.Vector3();
  private readonly scratchForward = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchStep = new THREE.Vector3();
  private readonly scratchDab = new Float32Array(PAINT_DAB_STRIDE);
  private started = false;
  private touched = false;
  private travelled = 0;
  private dabTotal = 0;
  private segment = 0;
  private segmentId: string;

  /**
   * Creates a builder.
   *
   * @param style Stroke style; its radius is in world units.
   * @param targets Brushes the stroke may reach.
   * @param idCreate Creates a fresh stroke id.
   */
  constructor(
    private readonly style: PaintStrokeStyle,
    private readonly targets: readonly PaintStrokeTarget[],
    private readonly idCreate: () => string,
  ) {
    this.shape = paintShapeFind(style.shape);
    this.segmentId = idCreate();
  }

  /** Distance between dabs in world units. */
  get spacing(): number {
    return Math.max(this.style.radius * PAINT_STROKE_MIN_STEP, this.style.radius * 2 * this.shape.spacing);
  }

  /** Number of dabs placed so far. */
  get dabCount(): number {
    return this.dabTotal;
  }

  /**
   * Adds a point of the pointer path on a surface.
   *
   * @param point World point.
   * @param normal World surface normal facing the viewer.
   * @param viewUp World up of the view, used to orient the first dab.
   * @returns Dabs placed by this point.
   */
  addPoint(point: THREE.Vector3, normal: THREE.Vector3, viewUp: THREE.Vector3): PaintStrokeBuilderDab[] {
    const placed: PaintStrokeBuilderDab[] = [];
    if (!this.started) {
      this.started = true;
      this.touched = true;
      this.lastPoint.copy(point);
      this.lastNormal.copy(normal);
      this.orient(normal, viewUp, this.lastUp);
      if (!this.shape.stamp) placed.push(this.place(point, normal));
      return placed;
    }
    const step = this.spacing;
    const length = this.scratchStep.subVectors(point, this.lastPoint).length();
    if (this.dabTotal === 0 && length < step * PAINT_STROKE_STAMP_AIM) return placed;
    if (length <= 1e-9) return placed;
    this.orient(normal, this.scratchStep, this.lastUp);
    const start = this.lastPoint.clone();
    if (this.dabTotal === 0) placed.push(this.place(start, this.lastNormal));
    let distance = step - this.travelled;
    while (distance <= length) {
      placed.push(this.place(start.clone().lerp(point, distance / length), normal));
      distance += step;
    }
    this.travelled = length - (distance - step);
    this.lastPoint.copy(point);
    this.lastNormal.copy(normal);
    return placed;
  }

  /**
   * Lifts the stroke off the surface, so the next point starts a new path
   * instead of joining the last one across a gap.
   */
  lift(): void {
    this.started = false;
    this.travelled = 0;
  }

  /**
   * Ends the stroke. A stamp that was clicked without moving is placed now,
   * upright to the view.
   *
   * @returns Dabs placed by finishing.
   */
  finish(): PaintStrokeBuilderDab[] {
    if (!this.touched || this.dabTotal > 0) return [];
    return [this.place(this.lastPoint.clone(), this.lastNormal)];
  }

  /**
   * Returns the records of every brush the stroke reached, including the
   * growing ones.
   *
   * @returns Records in placement order.
   */
  records(): PaintStrokeBuilderRecord[] {
    const records = [...this.finished];
    for (const lane of this.lanes.values()) {
      const stroke = this.laneStroke(lane);
      if (stroke !== null) records.push({ target: lane.target, stroke });
    }
    return records;
  }

  /**
   * Returns the records on one brush.
   *
   * @param key Brush key.
   * @returns Records, oldest first.
   */
  recordsFor(key: string): PaintStroke[] {
    return this.records()
      .filter((record) => record.target.key === key)
      .map((record) => record.stroke);
  }

  /**
   * Sets an up direction on the surface: the hint projected onto the surface,
   * falling back to the previous up when the hint is along the normal.
   *
   * @param normal Surface normal.
   * @param hint Wanted up.
   * @param output Receives the up.
   */
  private orient(normal: THREE.Vector3, hint: THREE.Vector3, output: THREE.Vector3): void {
    const projected = this.scratchUp.copy(hint).addScaledVector(normal, -hint.dot(normal));
    if (projected.lengthSq() > 1e-10) {
      output.copy(projected.normalize());
      return;
    }
    const fallback = this.scratchUp.copy(output).addScaledVector(normal, -output.dot(normal));
    if (fallback.lengthSq() > 1e-10) {
      output.copy(fallback.normalize());
      return;
    }
    const axis = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
    output.copy(axis.addScaledVector(normal, -axis.dot(normal)).normalize());
  }

  /**
   * Places one dab and copies it into every brush it reaches.
   *
   * @param point World center on the path.
   * @param normal World surface normal.
   * @returns The placed dab.
   */
  private place(point: THREE.Vector3, normal: THREE.Vector3): PaintStrokeBuilderDab {
    const variant = this.dabTotal % 256;
    const forward = normal.clone().negate().normalize();
    const up = this.lastUp.clone();
    const center = point.clone();
    if (this.shape.alternatingOffset !== 0) {
      const right = this.scratchRight.crossVectors(forward, up).normalize();
      const side = variant % 2 === 0 ? -1 : 1;
      center.addScaledVector(right, side * this.shape.alternatingOffset * this.style.radius);
    }
    this.dabTotal++;
    this.scratchSphere.set(center, this.style.radius);
    for (const target of this.targets) {
      if (!target.worldBounds.intersectsSphere(this.scratchSphere)) continue;
      this.append(target, center, forward, up, variant);
    }
    return { center, forward, up };
  }

  /**
   * Appends one dab to the growing record of a brush, starting a new record for
   * every brush when it is full.
   *
   * @param target Brush.
   * @param center World center.
   * @param forward World forward.
   * @param up World up.
   * @param variant Dab variant.
   */
  private append(
    target: PaintStrokeTarget,
    center: THREE.Vector3,
    forward: THREE.Vector3,
    up: THREE.Vector3,
    variant: number,
  ): void {
    let lane = this.lanes.get(target.key);
    if (lane !== undefined && lane.count >= PAINT_STROKE_MAX_DABS) {
      this.segmentFinish();
      lane = undefined;
    }
    lane ??= this.laneCreate(target);
    const local = this.scratchCenter.copy(center).applyMatrix4(target.worldToLocal);
    const localForward = this.scratchForward.copy(forward).transformDirection(target.worldToLocal);
    const localUp = this.scratchUp.copy(up).transformDirection(target.worldToLocal);
    localUp.addScaledVector(localForward, -localUp.dot(localForward)).normalize();
    const dab = this.scratchDab;
    local.toArray(dab, 0);
    localForward.toArray(dab, 3);
    localUp.toArray(dab, 6);
    dab[9] = variant;
    if ((lane.count + 1) * PAINT_DAB_STRIDE > lane.dabs.length) {
      const grown = new Float32Array(Math.max(PAINT_DAB_STRIDE * 16, lane.dabs.length * 2));
      grown.set(lane.dabs.subarray(0, lane.count * PAINT_DAB_STRIDE));
      lane.dabs = grown;
    }
    lane.dabs.set(paintDabsQuantize(dab), lane.count * PAINT_DAB_STRIDE);
    lane.count++;
    lane.stroke = null;
  }

  /**
   * Starts the record of a brush in the current segment.
   *
   * @param target Brush.
   * @returns New lane.
   */
  private laneCreate(target: PaintStrokeTarget): PaintStrokeBuilderLane {
    const scale = Math.cbrt(Math.abs(target.worldToLocal.determinant()));
    const lane: PaintStrokeBuilderLane = {
      target,
      radius: this.style.radius * (scale > 1e-9 ? scale : 1),
      order: target.order + this.segment,
      id: this.segmentId,
      dabs: new Float32Array(PAINT_DAB_STRIDE * 16),
      count: 0,
      stroke: null,
    };
    this.lanes.set(target.key, lane);
    return lane;
  }

  /** Moves every growing record to the finished list and starts a new segment. */
  private segmentFinish(): void {
    for (const lane of this.lanes.values()) {
      const stroke = this.laneStroke(lane);
      if (stroke !== null)
        this.finished.push({ target: lane.target, stroke: { ...stroke, dabs: stroke.dabs.slice() } });
    }
    this.lanes.clear();
    this.segment++;
    this.segmentId = this.idCreate();
  }

  /**
   * Returns the record of a lane. Records of one lane share a buffer that only
   * grows at the end, so an earlier record stays a valid prefix of a later
   * one.
   *
   * @param lane Lane.
   * @returns Record, or null when the lane is empty.
   */
  private laneStroke(lane: PaintStrokeBuilderLane): PaintStroke | null {
    if (lane.count === 0) return null;
    lane.stroke ??= {
      id: lane.id,
      order: lane.order,
      mode: this.style.mode,
      shape: this.style.shape,
      stencilTextureId: this.style.stencilTextureId,
      stencilScale: this.style.stencilScale,
      stampTextureId: this.style.stampTextureId,
      color: this.style.color,
      opacity: this.style.opacity,
      hardness: this.style.hardness,
      radius: lane.radius,
      dabs: lane.dabs.subarray(0, lane.count * PAINT_DAB_STRIDE),
    };
    return lane.stroke;
  }
}
