import * as THREE from 'three';
import { buildPlaneFromPlacementPoints } from '@/csg/csg_plane_from_points.js';
import { ClipPlanePlacementHint, resolveClipPlaneDepthAxis } from './clip_plane_depth_axis.js';

/** Interactive state for placing a 2–3 point clipping plane. */
export class ToolClipPlane {
  private active: boolean;
  private points: THREE.Vector3[];
  private plane: THREE.Plane | null;
  private keepFront: boolean;
  private depthAxis: THREE.Vector3 | null;
  private changeCallback: (() => void) | null;

  /** Creates an inactive clip plane tool. */
  constructor() {
    this.active = false;
    this.points = [];
    this.plane = null;
    this.keepFront = true;
    this.depthAxis = null;
    this.changeCallback = null;
  }

  /**
   * Registers a callback invoked when tool state changes.
   *
   * @param callback Change listener.
   */
  setChangeCallback(callback: (() => void) | null): void {
    this.changeCallback = callback;
  }

  /**
   * Returns whether the tool is active.
   *
   * @returns True when placing or ready to commit.
   */
  isActive(): boolean {
    return this.active;
  }

  /** Activates the tool and clears previous points. */
  activate(): void {
    this.active = true;
    this.clearPlacement();
    this.notifyChange();
  }

  /**
   * Deactivates an active tool and clears placement. Does nothing when the tool
   * is already inactive.
   */
  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.clearPlacement();
    this.notifyChange();
  }

  /**
   * Adds a world-space placement point (up to three). With two points the plane
   * is view- or surface-aware via the placement hint. A third point unlocks
   * free orientation and drops depth awareness.
   *
   * @param point World point to add.
   * @param placementHint Optional camera/surface context for two-point planes.
   * @returns True when the point was accepted.
   */
  addPoint(point: THREE.Vector3, placementHint?: ClipPlanePlacementHint | null): boolean {
    if (!this.active) return false;
    if (this.points.length >= 3) {
      this.beginNewPlacementFromPoint(point, placementHint);
    } else {
      this.appendPlacementPoint(point, placementHint);
    }
    this.rebuildPlane();
    this.notifyChange();
    return true;
  }

  /**
   * Moves an existing placement point and rebuilds the plane. Keeps the locked
   * two-point depth axis so drags stay stable.
   *
   * @param index Zero-based point index.
   * @param point New world position.
   * @returns True when the point was updated.
   */
  setPoint(index: number, point: THREE.Vector3): boolean {
    if (!this.active) return false;
    if (index < 0 || index >= this.points.length) return false;
    this.points[index]!.copy(point);
    this.rebuildPlane();
    this.notifyChange();
    return true;
  }

  /**
   * Flips which half-space is kept for clip operations. The stored plane is
   * unchanged; only the keep side toggles.
   */
  flipKeepSide(): void {
    if (!this.active) return;
    this.keepFront = !this.keepFront;
    this.notifyChange();
  }

  /**
   * Returns the current plane when at least two points are placed.
   *
   * @returns Plane or null.
   */
  getPlane(): THREE.Plane | null {
    return this.plane ? this.plane.clone() : null;
  }

  /**
   * Returns whether clip/split can be committed.
   *
   * @returns True when a valid plane exists.
   */
  isPlaneReady(): boolean {
    return this.plane !== null;
  }

  /**
   * Returns whether the front half-space is currently the keep side.
   *
   * @returns True when keep-front is selected.
   */
  getKeepFront(): boolean {
    return this.keepFront;
  }

  /**
   * Returns a copy of the placed points.
   *
   * @returns Placement points.
   */
  getPoints(): THREE.Vector3[] {
    return this.points.map((point) => point.clone());
  }

  /**
   * Returns the locked two-point depth axis when active, or null for free
   * three-point mode / incomplete placement.
   *
   * @returns Unit depth axis clone, or null.
   */
  getDepthAxis(): THREE.Vector3 | null {
    return this.depthAxis ? this.depthAxis.clone() : null;
  }

  /**
   * Returns a short status string for the UI.
   *
   * @returns Human-readable status.
   */
  getStatusMessage(): string {
    if (!this.active) return 'Clip tool inactive';
    if (this.points.length === 0) return 'Click point 1 (mesh or grid)';
    if (this.points.length === 1) return 'Click point 2 · cuts into view / brush';
    if (this.points.length === 2) {
      return this.plane
        ? 'Plane ready (optional point 3 for free tilt) · Flip / Clip / Split · USE KEYBOARD SHORTCUTS (UI FIXED SOON)'
        : 'Need a valid second point';
    }
    return this.plane
      ? '3-point plane ready · Flip / Clip / Split · USE KEYBOARD SHORTCUTS (UI FIXED SOON)'
      : 'Invalid 3-point plane';
  }

  /**
   * Clears points and plane while remaining active. Resets keep-front to the
   * default (used when activating the tool).
   */
  clearPlacement(): void {
    this.points = [];
    this.plane = null;
    this.depthAxis = null;
    this.keepFront = true;
  }

  /**
   * Clears placement points for another cut while keeping the tool active.
   * Preserves the keep-front preference so repeated clips stay consistent.
   */
  resetPlacementForNextCut(): void {
    if (!this.active) return;
    this.points = [];
    this.plane = null;
    this.depthAxis = null;
    this.notifyChange();
  }

  /**
   * Starts a fresh placement sequence after three points were already set.
   *
   * @param point First point of the new sequence.
   * @param placementHint Optional depth context for later two-point lock.
   */
  private beginNewPlacementFromPoint(point: THREE.Vector3, placementHint?: ClipPlanePlacementHint | null): void {
    this.points = [point.clone()];
    this.depthAxis = null;
    this.rememberDepthHint(placementHint);
  }

  /**
   * Appends a point and locks depth when the plane becomes two-point ready.
   *
   * @param point World point to append.
   * @param placementHint Optional camera/surface context.
   */
  private appendPlacementPoint(point: THREE.Vector3, placementHint?: ClipPlanePlacementHint | null): void {
    this.points.push(point.clone());
    if (this.points.length === 1) {
      this.rememberDepthHint(placementHint);
      return;
    }
    if (this.points.length === 2) {
      this.lockDepthAxisFromHint(placementHint);
      return;
    }
    this.depthAxis = null;
  }

  /**
   * Stores a provisional depth axis from the first pick so a second ground pick
   * can still cut into the brush when the first hit was on a face.
   *
   * @param placementHint Optional first-point context.
   */
  private rememberDepthHint(placementHint?: ClipPlanePlacementHint | null): void {
    if (!placementHint) return;
    this.depthAxis = resolveClipPlaneDepthAxis(placementHint);
  }

  /**
   * Locks the two-point depth axis when the plane becomes ready. Orthographic
   * and surface picks replace the provisional first-pick axis. A perspective
   * ground/void second pick keeps the first surface axis when present so the
   * cut still slices into the brush.
   *
   * @param placementHint Optional second-point context.
   */
  private lockDepthAxisFromHint(placementHint?: ClipPlanePlacementHint | null): void {
    if (!placementHint) {
      if (!this.depthAxis) this.depthAxis = new THREE.Vector3(0, 1, 0);
      return;
    }
    const secondHasSurface = placementHint.surfaceNormal !== null;
    if (placementHint.isOrthographic || secondHasSurface || !this.depthAxis) {
      this.depthAxis = resolveClipPlaneDepthAxis(placementHint);
    }
  }

  /** Rebuilds the plane from the current points and locked depth axis. */
  private rebuildPlane(): void {
    this.plane = buildPlaneFromPlacementPoints(this.points, this.depthAxis);
  }

  /** Notifies listeners of state changes. */
  private notifyChange(): void {
    if (this.changeCallback) {
      this.changeCallback();
    }
  }
}
