import type { SnapHitKind } from '@/snap/hit/snap_hit_kind.js';

/** Screen radius for a geometry snap target, in CSS pixels. */
export const SNAP_SCREEN_RADIUS_PIXELS = 20;

/** Screen radius for locking a move-snap source vertex, in CSS pixels. */
export const SNAP_SOURCE_PICK_RADIUS_PIXELS = 48;

/**
 * Fraction of the screen radius that pulls an edge snap onto an endpoint or
 * midpoint.
 */
export const SNAP_EDGE_MAGNET_SCALE = 0.5;

/**
 * Which geometry kinds participate in snapping. Increment snap stays on
 * GridSnap. Kinds start off so existing increment behavior is unchanged.
 */
export class SnapPolicy {
  private masterEnabled: boolean;
  private shiftHeld: boolean;
  private vertexEnabled: boolean;
  private edgeEnabled: boolean;
  private faceEnabled: boolean;

  /** Creates a policy with geometry kinds disabled. */
  constructor() {
    this.masterEnabled = false;
    this.shiftHeld = false;
    this.vertexEnabled = false;
    this.edgeEnabled = false;
    this.faceEnabled = false;
  }

  /**
   * Sets the master snap switch. Geometry kinds do nothing while this is off.
   *
   * @param enabled True when the Snap control is on.
   */
  setMasterEnabled(enabled: boolean): void {
    this.masterEnabled = enabled;
  }

  /**
   * Sets whether Shift is holding snap off for this sample.
   *
   * @param held True while Shift is down.
   */
  setShiftHeld(held: boolean): void {
    this.shiftHeld = held;
  }

  /**
   * Enables or disables vertex targets.
   *
   * @param enabled True to consider vertices.
   */
  setVertexEnabled(enabled: boolean): void {
    this.vertexEnabled = enabled;
  }

  /**
   * Enables or disables edge targets.
   *
   * @param enabled True to consider edges.
   */
  setEdgeEnabled(enabled: boolean): void {
    this.edgeEnabled = enabled;
  }

  /**
   * Enables or disables face targets.
   *
   * @param enabled True to consider faces.
   */
  setFaceEnabled(enabled: boolean): void {
    this.faceEnabled = enabled;
  }

  /**
   * Returns whether a geometry query should run.
   *
   * @returns True when the master switch is on, Shift is up, and a kind is on.
   */
  isGeometrySnapActive(): boolean {
    if (!this.masterEnabled || this.shiftHeld) {
      return false;
    }
    return this.vertexEnabled || this.edgeEnabled || this.faceEnabled;
  }

  /**
   * Returns whether the vertex toggle is on, ignoring the master switch.
   *
   * @returns True when vertex targets are enabled.
   */
  isVertexEnabled(): boolean {
    return this.vertexEnabled;
  }

  /**
   * Returns whether the edge toggle is on, ignoring the master switch.
   *
   * @returns True when edge targets are enabled.
   */
  isEdgeEnabled(): boolean {
    return this.edgeEnabled;
  }

  /**
   * Returns whether the face toggle is on, ignoring the master switch.
   *
   * @returns True when face targets are enabled.
   */
  isFaceEnabled(): boolean {
    return this.faceEnabled;
  }

  /**
   * Returns whether a hit kind is currently allowed.
   *
   * @param kind Hit kind.
   * @returns True when that kind is enabled and geometry snap is active.
   */
  allowsKind(kind: SnapHitKind): boolean {
    if (!this.isGeometrySnapActive()) {
      return false;
    }
    return this.kindFlag(kind);
  }

  /**
   * Returns the screen radius for target hits.
   *
   * @returns Radius in CSS pixels.
   */
  getScreenRadiusPixels(): number {
    return SNAP_SCREEN_RADIUS_PIXELS;
  }

  /**
   * Returns the screen radius used to lock a source vertex.
   *
   * @returns Radius in CSS pixels.
   */
  getSourcePickRadiusPixels(): number {
    return SNAP_SOURCE_PICK_RADIUS_PIXELS;
  }

  /**
   * Returns the enabled flag for one kind, ignoring the master switch.
   *
   * @param kind Hit kind.
   * @returns True when that kind's toggle is on.
   */
  private kindFlag(kind: SnapHitKind): boolean {
    if (kind === 'vertex') {
      return this.vertexEnabled;
    }
    if (kind === 'edge') {
      return this.edgeEnabled;
    }
    return this.faceEnabled;
  }
}
