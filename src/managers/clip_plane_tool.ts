import * as THREE from 'three';
import { buildPlaneFromPlacementPoints } from '../csg/csg_plane_from_points.js';

/**
 * Interactive state for placing a 2–3 point clipping plane.
 */
export class ClipPlaneTool {
  private active: boolean;
  private points: THREE.Vector3[];
  private plane: THREE.Plane | null;
  private keepFront: boolean;
  private changeCallback: (() => void) | null;

  /**
   * Creates an inactive clip plane tool.
   */
  constructor() {
    this.active = false;
    this.points = [];
    this.plane = null;
    this.keepFront = true;
    this.changeCallback = null;
  }

  /**
   * Registers a callback invoked when tool state changes.
   * @param callback Change listener.
   */
  setChangeCallback(callback: (() => void) | null): void {
    this.changeCallback = callback;
  }

  /**
   * Returns whether the tool is active.
   * @returns True when placing or ready to commit.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Activates the tool and clears previous points.
   */
  activate(): void {
    this.active = true;
    this.clearPlacement();
    this.notifyChange();
  }

  /**
   * Deactivates the tool and clears placement state.
   */
  deactivate(): void {
    this.active = false;
    this.clearPlacement();
    this.notifyChange();
  }

  /**
   * Adds a world-space placement point (up to three).
   * @param point World point to add.
   * @returns True when the point was accepted.
   */
  addPoint(point: THREE.Vector3): boolean {
    if (!this.active) return false;
    if (this.points.length >= 3) {
      this.points = [point.clone()];
    } else {
      this.points.push(point.clone());
    }
    this.rebuildPlane();
    this.notifyChange();
    return true;
  }

  /**
   * Moves an existing placement point and rebuilds the plane.
   * @param index Zero-based point index.
   * @param point New world position.
   * @returns True when the point was updated.
   */
  setPoint(index: number, point: THREE.Vector3): boolean {
    if (!this.active) return false;
    if (index < 0 || index >= this.points.length) return false;
    this.points[index].copy(point);
    this.rebuildPlane();
    this.notifyChange();
    return true;
  }

  /**
   * Flips which half-space is kept for clip operations.
   * The stored plane is unchanged; only the keep side toggles.
   */
  flipKeepSide(): void {
    if (!this.active) return;
    this.keepFront = !this.keepFront;
    this.notifyChange();
  }

  /**
   * Returns the current plane when at least two points are placed.
   * @returns Plane or null.
   */
  getPlane(): THREE.Plane | null {
    return this.plane ? this.plane.clone() : null;
  }

  /**
   * Returns whether clip/split can be committed.
   * @returns True when a valid plane exists.
   */
  isPlaneReady(): boolean {
    return this.plane !== null;
  }

  /**
   * Returns whether the front half-space is currently the keep side.
   * @returns True when keep-front is selected.
   */
  getKeepFront(): boolean {
    return this.keepFront;
  }

  /**
   * Returns a copy of the placed points.
   * @returns Placement points.
   */
  getPoints(): THREE.Vector3[] {
    return this.points.map((point) => point.clone());
  }

  /**
   * Returns a short status string for the UI.
   * @returns Human-readable status.
   */
  getStatusMessage(): string {
    if (!this.active) return 'Clip tool inactive';
    if (this.points.length === 0) return 'Click point 1 (mesh or grid)';
    if (this.points.length === 1) return 'Click point 2';
    if (this.points.length === 2) {
      return this.plane
        ? 'Plane ready (optional point 3) · Flip / Clip / Split'
        : 'Need a valid second point';
    }
    return this.plane
      ? '3-point plane ready · Flip / Clip / Split'
      : 'Invalid 3-point plane';
  }

  /**
   * Clears points and plane while remaining active.
   */
  clearPlacement(): void {
    this.points = [];
    this.plane = null;
    this.keepFront = true;
  }

  /**
   * Rebuilds the plane from the current points.
   */
  private rebuildPlane(): void {
    this.plane = buildPlaneFromPlacementPoints(this.points);
  }

  /**
   * Notifies listeners of state changes.
   */
  private notifyChange(): void {
    if (this.changeCallback) {
      this.changeCallback();
    }
  }
}
