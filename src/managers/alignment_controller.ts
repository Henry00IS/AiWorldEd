import * as THREE from 'three';
import { AlignmentAxis } from '../types/alignment_axis.js';
import { AlignCommand, ObjectAlignSnapshot } from '../commands/align_command.js';
import { CommandStack } from '../commands/command_stack.js';

/**
 * Core alignment logic for snapping objects to origin, grid, or other objects.
 * Produces AlignCommand instances for full undo/redo support.
 */
export class AlignmentController {
  private currentAxis: AlignmentAxis;
  private static readonly AXIS_CYCLE: AlignmentAxis[] = [
    AlignmentAxis.ALL,
    AlignmentAxis.X,
    AlignmentAxis.Y,
    AlignmentAxis.Z
  ];

  /**
   * Creates a new alignment controller with axis restriction set to ALL.
   */
  constructor() {
    this.currentAxis = AlignmentAxis.ALL;
  }

  /**
   * Returns the currently active axis restriction.
   * @returns The current alignment axis setting.
   */
  getAxisRestriction(): AlignmentAxis {
    return this.currentAxis;
  }

  /**
   * Cycles the axis restriction through ALL -> X -> Y -> Z -> ALL.
   * @returns The new axis restriction after cycling.
   */
  cycleAxisRestriction(): AlignmentAxis {
    const currentIndex = AlignmentController.AXIS_CYCLE.indexOf(this.currentAxis);
    const nextIndex = (currentIndex + 1) % AlignmentController.AXIS_CYCLE.length;
    this.currentAxis = AlignmentController.AXIS_CYCLE[nextIndex];
    return this.currentAxis;
  }

  /**
   * Aligns selected objects to world origin (0, 0, 0) on the restricted axes.
   * @param objects The meshes to align.
   * @param axis The axis restriction to apply.
   * @param commandStack The command stack to push the undoable command onto.
   */
  alignToOrigin(
    objects: THREE.Mesh[],
    axis: AlignmentAxis,
    commandStack: CommandStack
  ): void {
    if (objects.length === 0) return;
    const snapshots = this.buildSnapshots(objects);
    const targetPositions = this.computeOriginTargets(objects, axis);
    const command = new AlignCommand(snapshots, targetPositions);
    commandStack.push(command);
  }

  /**
   * Aligns the bounding-box center of selected objects to the nearest grid cell.
   * @param objects The meshes to align.
   * @param axis The axis restriction to apply.
   * @param snapInterval The grid snap interval.
   * @param commandStack The command stack to push the undoable command onto.
   */
  alignCenterToGrid(
    objects: THREE.Mesh[],
    axis: AlignmentAxis,
    snapInterval: number,
    commandStack: CommandStack
  ): void {
    if (objects.length === 0) return;
    const snapshots = this.buildSnapshots(objects);
    const targetPositions = this.computeGridCenterTargets(objects, axis, snapInterval);
    const command = new AlignCommand(snapshots, targetPositions);
    commandStack.push(command);
  }

  /**
   * Aligns source objects' bounding box edges to the target object's bounding box edges.
   * @param sources The meshes to align.
   * @param target The reference mesh to align against.
   * @param axis The axis restriction to apply.
   * @param commandStack The command stack to push the undoable command onto.
   */
  alignToObject(
    sources: THREE.Mesh[],
    target: THREE.Mesh,
    axis: AlignmentAxis,
    commandStack: CommandStack
  ): void {
    if (sources.length === 0) return;
    const snapshots = this.buildSnapshots(sources);
    const targetPositions = this.computeObjectTargets(sources, target, axis);
    const command = new AlignCommand(snapshots, targetPositions);
    commandStack.push(command);
  }

  /**
   * Creates position snapshots for undo support.
   * @param objects The meshes to snapshot.
   * @returns An array of alignment snapshots.
   */
  private buildSnapshots(objects: THREE.Mesh[]): ObjectAlignSnapshot[] {
    return objects.map((mesh) => ({
      mesh: mesh,
      originalPosition: mesh.position.clone()
    }));
  }

  /**
   * Computes target positions that align each object to world origin.
   * @param objects The meshes to compute targets for.
   * @param axis The axis restriction.
   * @returns A map from each mesh to its target position.
   */
  private computeOriginTargets(
    objects: THREE.Mesh[],
    axis: AlignmentAxis
  ): Map<THREE.Mesh, THREE.Vector3> {
    const targets = new Map<THREE.Mesh, THREE.Vector3>();
    objects.forEach((mesh) => {
      const box = this.getWorldBoundingBox(mesh);
      const center = this.computeBoxCenter(box);
      const target = this.applyOriginAlignment(center, axis);
      const offset = this.computePositionOffset(center, target);
      const finalPos = this.applyOffsetToCurrentPosition(mesh, offset);
      targets.set(mesh, finalPos);
    });
    return targets;
  }

  /**
   * Computes target positions that align each object's center to the nearest grid cell.
   * @param objects The meshes to compute targets for.
   * @param axis The axis restriction.
   * @param snapInterval The grid interval.
   * @returns A map from each mesh to its target position.
   */
  private computeGridCenterTargets(
    objects: THREE.Mesh[],
    axis: AlignmentAxis,
    snapInterval: number
  ): Map<THREE.Mesh, THREE.Vector3> {
    const targets = new Map<THREE.Mesh, THREE.Vector3>();
    objects.forEach((mesh) => {
      const box = this.getWorldBoundingBox(mesh);
      const center = this.computeBoxCenter(box);
      const snappedCenter = this.snapToGrid(center, axis, snapInterval);
      const offset = this.computePositionOffset(center, snappedCenter);
      const finalPos = this.applyOffsetToCurrentPosition(mesh, offset);
      targets.set(mesh, finalPos);
    });
    return targets;
  }

  /**
   * Computes target positions that align each source's bounding box min to the target's min.
   * @param sources The source meshes.
   * @param target The reference target mesh.
   * @param axis The axis restriction.
   * @returns A map from each source mesh to its target position.
   */
  private computeObjectTargets(
    sources: THREE.Mesh[],
    target: THREE.Mesh,
    axis: AlignmentAxis
  ): Map<THREE.Mesh, THREE.Vector3> {
    const targetBox = this.getWorldBoundingBox(target);
    const targetMin = targetBox.min.clone();
    const targets = new Map<THREE.Mesh, THREE.Vector3>();
    sources.forEach((source) => {
      const sourceBox = this.getWorldBoundingBox(source);
      const sourceCenter = this.computeBoxCenter(sourceBox);
      const sourceMin = sourceBox.min.clone();
      const delta = this.computeAlignmentDelta(sourceMin, targetMin, axis);
      const newCenter = sourceCenter.clone().add(delta);
      const offset = this.computePositionOffset(sourceCenter, newCenter);
      const finalPos = this.applyOffsetToCurrentPosition(source, offset);
      targets.set(source, finalPos);
    });
    return targets;
  }

  /**
   * Gets the world-space bounding box of a mesh.
   * @param mesh The mesh to measure.
   * @returns The world-space Box3.
   */
  private getWorldBoundingBox(mesh: THREE.Mesh): THREE.Box3 {
    const box = new THREE.Box3();
    box.setFromObject(mesh);
    return box;
  }

  /**
   * Computes the center point of a bounding box.
   * @param box The bounding box.
   * @returns The center vector.
   */
  private computeBoxCenter(box: THREE.Box3): THREE.Vector3 {
    const center = new THREE.Vector3();
    box.getCenter(center);
    return center;
  }

  /**
   * Aligns a position to world origin on the specified axes.
   * @param center The original position.
   * @param axis The axis restriction.
   * @returns The origin-aligned position.
   */
  private applyOriginAlignment(center: THREE.Vector3, axis: AlignmentAxis): THREE.Vector3 {
    const result = center.clone();
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.X) result.x = 0;
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Y) result.y = 0;
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Z) result.z = 0;
    return result;
  }

  /**
   * Snaps a position to the nearest grid cell on the specified axes.
   * @param center The original position.
   * @param axis The axis restriction.
   * @param snapInterval The grid interval.
   * @returns The snapped position.
   */
  private snapToGrid(
    center: THREE.Vector3,
    axis: AlignmentAxis,
    snapInterval: number
  ): THREE.Vector3 {
    const result = center.clone();
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.X) {
      result.x = Math.round(result.x / snapInterval) * snapInterval;
    }
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Y) {
      result.y = Math.round(result.y / snapInterval) * snapInterval;
    }
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Z) {
      result.z = Math.round(result.z / snapInterval) * snapInterval;
    }
    return result;
  }

  /**
   * Computes the positional offset needed to move from center to target center.
   * @param currentCenter The current bounding-box center.
   * @param targetCenter The desired bounding-box center.
   * @returns The position offset vector.
   */
  private computePositionOffset(
    currentCenter: THREE.Vector3,
    targetCenter: THREE.Vector3
  ): THREE.Vector3 {
    return targetCenter.clone().sub(currentCenter);
  }

  /**
   * Applies an offset to a mesh's current position.
   * @param mesh The mesh to move.
   * @param offset The displacement to apply.
   * @returns The final position.
   */
  private applyOffsetToCurrentPosition(
    mesh: THREE.Mesh,
    offset: THREE.Vector3
  ): THREE.Vector3 {
    return mesh.position.clone().add(offset);
  }

  /**
   * Computes the alignment delta between two bounding-box minimums.
   * @param sourceMin The source box minimum.
   * @param targetMin The target box minimum.
   * @param axis The axis restriction.
   * @returns The displacement vector.
   */
  private computeAlignmentDelta(
    sourceMin: THREE.Vector3,
    targetMin: THREE.Vector3,
    axis: AlignmentAxis
  ): THREE.Vector3 {
    const delta = new THREE.Vector3();
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.X) {
      delta.x = targetMin.x - sourceMin.x;
    }
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Y) {
      delta.y = targetMin.y - sourceMin.y;
    }
    if (axis === AlignmentAxis.ALL || axis === AlignmentAxis.Z) {
      delta.z = targetMin.z - sourceMin.z;
    }
    return delta;
  }
}
