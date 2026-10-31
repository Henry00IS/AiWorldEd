import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { TransformConstraint } from './transform_constraint.js';
import { applyWorldPivotRotation } from './transform_world_pose.js';

/**
 * Applies transform operations to selected objects. Handles translation,
 * rotation, and scale with optional snapping. Targets may be meshes or higher
 * hierarchy nodes such as solid model roots.
 */
export class TransformExecutor {
  private gridSnap: GridSnap;
  private boundingBox: THREE.Box3;
  private lastRaisedSnappedTranslationDelta: THREE.Vector3;
  private hasRaisedSnappedTranslationDelta: boolean;
  private lastRaisedSnappedScaleFactors: THREE.Vector3;
  private hasRaisedSnappedScaleFactors: boolean;
  private lastRaisedSnappedRotationAngle: number;
  private hasRaisedSnappedRotationAngle: boolean;

  /**
   * Creates a new transform executor with the given grid snap configuration.
   *
   * @param gridSnap The grid snap settings for constraining transforms.
   */
  constructor(gridSnap: GridSnap) {
    this.gridSnap = gridSnap;
    this.boundingBox = new THREE.Box3();
    this.lastRaisedSnappedTranslationDelta = new THREE.Vector3();
    this.hasRaisedSnappedTranslationDelta = false;
    this.lastRaisedSnappedScaleFactors = new THREE.Vector3(1, 1, 1);
    this.hasRaisedSnappedScaleFactors = false;
    this.lastRaisedSnappedRotationAngle = 0;
    this.hasRaisedSnappedRotationAngle = false;
  }

  /** Clears snap-step tracking so the next snapped transform can raise audio. */
  clearSnappedTranslationStepTracking(): void {
    this.hasRaisedSnappedTranslationDelta = false;
    this.lastRaisedSnappedTranslationDelta.set(0, 0, 0);
    this.hasRaisedSnappedScaleFactors = false;
    this.lastRaisedSnappedScaleFactors.set(1, 1, 1);
    this.hasRaisedSnappedRotationAngle = false;
    this.lastRaisedSnappedRotationAngle = 0;
  }

  /**
   * Translates all objects by the same snapped delta. Grid snap rounds the
   * movement vector, never each object's absolute position, so relative offsets
   * and off-grid placements stay intact.
   *
   * @param objects The objects to translate.
   * @param delta The unsnapped translation delta vector.
   */
  executeTranslation(objects: THREE.Object3D[], delta: THREE.Vector3): void {
    const snappedDelta = this.snapTranslationDelta(delta);
    objects.forEach((object) => {
      object.position.add(snappedDelta);
    });
    this.raiseSelectionMovedWithSnappingIfStepped(snappedDelta);
  }

  /**
   * Sets each object to its initial position plus one shared snapped delta.
   * Snapping applies to the movement only, so multi-selection keeps internal
   * spacing and off-grid offsets.
   *
   * @param objects The objects to position.
   * @param initialPositions Map of object to pre-drag position.
   * @param totalDelta Accumulated translation delta. Already final when
   *   skipIncrementSnap is true.
   * @param skipIncrementSnap When true, the delta is applied as given.
   */
  applyAbsoluteTranslation(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    totalDelta: THREE.Vector3,
    skipIncrementSnap: boolean = false,
  ): void {
    const snappedDelta = skipIncrementSnap ? totalDelta.clone() : this.snapTranslationDelta(totalDelta);
    objects.forEach((object) => {
      this.applySnappedTranslationToObject(object, initialPositions, snappedDelta);
    });
    if (!skipIncrementSnap) {
      this.raiseSelectionMovedWithSnappingIfStepped(snappedDelta);
    }
  }

  /**
   * Raises the snap-move audio event once when the snapped delta steps to a new
   * value while snap is enabled.
   *
   * @param snappedDelta Grid-snapped translation applied to the selection.
   */
  private raiseSelectionMovedWithSnappingIfStepped(snappedDelta: THREE.Vector3): void {
    if (!this.gridSnap.isEnabled()) {
      return;
    }
    if (!this.snappedTranslationDeltaStepped(snappedDelta)) {
      return;
    }
    const stepLength = this.measureSnappedTranslationStepLength(snappedDelta);
    this.lastRaisedSnappedTranslationDelta.copy(snappedDelta);
    this.hasRaisedSnappedTranslationDelta = true;
    NotificationGlobal.onSelectionMovedWithSnapping(stepLength);
  }

  /**
   * World length of this snap step from the previous raised snapped delta.
   *
   * @param snappedDelta Newly raised snapped translation delta.
   * @returns Step length in world units.
   */
  private measureSnappedTranslationStepLength(snappedDelta: THREE.Vector3): number {
    if (!this.hasRaisedSnappedTranslationDelta) {
      return snappedDelta.length();
    }
    return snappedDelta.distanceTo(this.lastRaisedSnappedTranslationDelta);
  }

  /**
   * Returns whether the snapped delta differs from the last raised step.
   *
   * @param snappedDelta Candidate snapped translation delta.
   * @returns True when this delta is a new snap step.
   */
  private snappedTranslationDeltaStepped(snappedDelta: THREE.Vector3): boolean {
    if (!this.hasRaisedSnappedTranslationDelta) {
      return snappedDelta.lengthSq() > 0;
    }
    return !this.lastRaisedSnappedTranslationDelta.equals(snappedDelta);
  }

  /**
   * Writes one object's local position from its start plus a shared delta.
   *
   * @param object The object to update.
   * @param initialPositions Map of object to pre-drag position.
   * @param snappedDelta Grid-snapped translation applied to every target.
   */
  private applySnappedTranslationToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    snappedDelta: THREE.Vector3,
  ): void {
    const start = initialPositions.get(object);
    if (!start) {
      return;
    }
    object.position.copy(start).add(snappedDelta);
  }

  /**
   * Returns a copy of the delta with each component snapped to the grid.
   *
   * @param delta Unsnapped translation delta.
   * @returns Snapped delta, or a clone of the original when snap is disabled.
   */
  private snapTranslationDelta(delta: THREE.Vector3): THREE.Vector3 {
    const snappedDelta = delta.clone();
    this.gridSnap.snapVector3(snappedDelta);
    return snappedDelta;
  }

  /**
   * Rotates all objects around a pivot point and updates each object's
   * orientation.
   *
   * @param objects The objects to rotate.
   * @param pivot The center point of rotation.
   * @param axis The rotation axis vector.
   * @param angle The rotation angle in radians.
   */
  executeRotation(objects: THREE.Object3D[], pivot: THREE.Vector3, axis: THREE.Vector3, angle: number): void {
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normalizedAxis, angle);
    objects.forEach((object) => {
      this.rotateObjectAroundPivot(object, pivot, rotationQuaternion);
    });
  }

  /**
   * Applies absolute rotation from pre-drag state using a total angle.
   *
   * @param objects The objects to rotate.
   * @param initialPositions Map of object to pre-drag position.
   * @param initialQuaternions Map of object to pre-drag quaternion.
   * @param pivot The rotation pivot point.
   * @param axis The rotation axis vector.
   * @param totalAngle Accumulated signed rotation angle in radians.
   */
  applyAbsoluteRotation(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalAngle: number,
  ): void {
    const snappedAngle = this.gridSnap.snapAngleRadians(totalAngle);
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normalizedAxis, snappedAngle);
    objects.forEach((object) => {
      this.applyAbsoluteRotationToObject(object, initialPositions, initialQuaternions, pivot, rotationQuaternion);
    });
    this.raiseSelectionRotatedWithSnappingIfStepped(snappedAngle);
  }

  /**
   * Raises rotate-snap audio when the snapped total angle steps to a new value.
   *
   * @param snappedAngle Grid-snapped total rotation from drag start (radians).
   */
  private raiseSelectionRotatedWithSnappingIfStepped(snappedAngle: number): void {
    if (!this.gridSnap.isEnabled()) {
      return;
    }
    if (!this.snappedRotationAngleStepped(snappedAngle)) {
      return;
    }
    const stepRadians = this.measureSnappedRotationStepRadians(snappedAngle);
    this.lastRaisedSnappedRotationAngle = snappedAngle;
    this.hasRaisedSnappedRotationAngle = true;
    NotificationGlobal.onSelectionRotatedWithSnapping(stepRadians);
  }

  /**
   * Returns whether the snapped rotation angle differs from the last raised
   * step.
   *
   * @param snappedAngle Candidate snapped total angle in radians.
   * @returns True when this angle is a new snap step.
   */
  private snappedRotationAngleStepped(snappedAngle: number): boolean {
    if (!this.hasRaisedSnappedRotationAngle) {
      return Math.abs(snappedAngle) > 1e-12;
    }
    return Math.abs(snappedAngle - this.lastRaisedSnappedRotationAngle) > 1e-12;
  }

  /**
   * Absolute angle of this snap step from the previous raised snapped angle.
   *
   * @param snappedAngle Newly raised snapped total angle in radians.
   * @returns Step magnitude in radians.
   */
  private measureSnappedRotationStepRadians(snappedAngle: number): number {
    if (!this.hasRaisedSnappedRotationAngle) {
      return Math.abs(snappedAngle);
    }
    return Math.abs(snappedAngle - this.lastRaisedSnappedRotationAngle);
  }

  /**
   * Scales all objects along an axis relative to a pivot, updating scale.
   *
   * @param objects The objects to scale.
   * @param pivot The center point of scaling.
   * @param axis The scaling axis vector.
   * @param factor The multiplicative scale factor for this step.
   */
  executeScale(objects: THREE.Object3D[], pivot: THREE.Vector3, axis: THREE.Vector3, factor: number): void {
    const normalizedAxis = axis.clone().normalize();
    const safeFactor = Math.max(0.01, factor);
    objects.forEach((object) => {
      this.scaleObjectAlongAxis(object, pivot, normalizedAxis, safeFactor);
    });
  }

  /**
   * Applies absolute scale from pre-drag state using a total factor.
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag position.
   * @param initialScales Map of object to pre-drag scale.
   * @param pivot The scale pivot point.
   * @param worldAxis World-space direction of the scale handle.
   * @param totalFactor Accumulated scale factor relative to drag start.
   * @param gizmoAxis Which local scale component the handle maps to (X/Y/Z).
   */
  applyAbsoluteScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    pivot: THREE.Vector3,
    worldAxis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis = GizmoAxis.X,
  ): void {
    const snappedFactor = this.gridSnap.snapScaleFactor(totalFactor);
    const normalizedAxis = worldAxis.clone().normalize();
    objects.forEach((object) => {
      this.applyAbsoluteScaleToObject(
        object,
        initialPositions,
        initialScales,
        pivot,
        normalizedAxis,
        snappedFactor,
        gizmoAxis,
      );
    });
    this.raiseSelectionScaledWithSnappingIfStepped(this.scaleFactorVectorForAxis(gizmoAxis, snappedFactor));
  }

  /**
   * Uniform scale about a world pivot using ScaleAroundPivot on all axes.
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag local position.
   * @param initialScales Map of object to pre-drag local scale.
   * @param worldPivot World-space scale origin.
   * @param totalFactor Radial distance ratio from drag start.
   */
  applyAbsoluteUniformScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    totalFactor: number,
  ): void {
    this.applyAbsoluteFreeScale(
      objects,
      initialPositions,
      initialScales,
      worldPivot,
      new THREE.Vector3(totalFactor, totalFactor, totalFactor),
    );
  }

  /**
   * Free scale about a world pivot with independent X/Y/Z multipliers (uniform
   * 3D or planar 2D free-scale from the center cube).
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag local position.
   * @param initialScales Map of object to pre-drag local scale.
   * @param worldPivot World-space scale origin.
   * @param axisFactors Multipliers per world axis (1 leaves that axis).
   */
  applyAbsoluteFreeScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const snapped = new THREE.Vector3(
      this.gridSnap.snapScaleFactor(axisFactors.x),
      this.gridSnap.snapScaleFactor(axisFactors.y),
      this.gridSnap.snapScaleFactor(axisFactors.z),
    );
    objects.forEach((object) => {
      this.applyAbsoluteFreeScaleToObject(object, initialPositions, initialScales, worldPivot, snapped);
    });
    this.raiseSelectionScaledWithSnappingIfStepped(snapped);
  }

  /**
   * Raises scale-snap audio once when snapped scale factors step to a new value
   * while snap is enabled. Travel (snap steps from identity) pitches the click
   * like bounds face travel.
   *
   * @param snappedFactors Snapped per-axis scale factors from the drag.
   */
  private raiseSelectionScaledWithSnappingIfStepped(snappedFactors: THREE.Vector3): void {
    if (!this.gridSnap.isEnabled()) {
      return;
    }
    if (!this.snappedScaleFactorsStepped(snappedFactors)) {
      return;
    }
    this.lastRaisedSnappedScaleFactors.copy(snappedFactors);
    this.hasRaisedSnappedScaleFactors = true;
    NotificationGlobal.onSelectionScaledWithSnapping(this.computeScaleTravelDistance(snappedFactors));
  }

  /**
   * Returns whether snapped scale factors differ from the last raised step.
   *
   * @param snappedFactors Candidate snapped scale factors.
   * @returns True when this is a new snap step away from identity.
   */
  private snappedScaleFactorsStepped(snappedFactors: THREE.Vector3): boolean {
    if (!this.hasRaisedSnappedScaleFactors) {
      return !this.isIdentityScaleFactors(snappedFactors);
    }
    return !this.lastRaisedSnappedScaleFactors.equals(snappedFactors);
  }

  /**
   * Returns whether scale factors leave the selection unscaled from drag start.
   *
   * @param factors Per-axis scale factors.
   * @returns True when all components are effectively 1.
   */
  private isIdentityScaleFactors(factors: THREE.Vector3): boolean {
    return Math.abs(factors.x - 1) < 1e-8 && Math.abs(factors.y - 1) < 1e-8 && Math.abs(factors.z - 1) < 1e-8;
  }

  /**
   * Maps scale factors from drag start (1 = unchanged) to pitch travel. Uses
   * absolute factor deviation (not snap-step count) so pitch rises over a large
   * scale range, similar to several meters of bounds face travel.
   *
   * @param snappedFactors Snapped per-axis scale factors from the drag.
   * @returns Non-negative travel for resize/scale pitch mapping.
   */
  private computeScaleTravelDistance(snappedFactors: THREE.Vector3): number {
    return Math.max(Math.abs(snappedFactors.x - 1), Math.abs(snappedFactors.y - 1), Math.abs(snappedFactors.z - 1));
  }

  /**
   * Builds a three-component scale factor vector for a single-axis scale
   * handle.
   *
   * @param gizmoAxis Handle axis.
   * @param factor Snapped scale factor along that axis.
   * @returns Vector with factor on the active axis and 1 elsewhere.
   */
  private scaleFactorVectorForAxis(gizmoAxis: GizmoAxis, factor: number): THREE.Vector3 {
    if (gizmoAxis === GizmoAxis.X) {
      return new THREE.Vector3(factor, 1, 1);
    }
    if (gizmoAxis === GizmoAxis.Y) {
      return new THREE.Vector3(1, factor, 1);
    }
    if (gizmoAxis === GizmoAxis.Z) {
      return new THREE.Vector3(1, 1, factor);
    }
    return new THREE.Vector3(factor, factor, factor);
  }

  /**
   * Computes the center of the bounding box of all objects. Used as the default
   * pivot point for transforms.
   *
   * @param objects The objects to compute the pivot for.
   * @returns The bounding box center point.
   */
  computePivot(objects: THREE.Object3D[]): THREE.Vector3 {
    if (objects.length === 0) {
      return new THREE.Vector3(0, 0, 0);
    }
    if (objects.length === 1) {
      const sole = objects[0]!;
      sole.updateMatrixWorld(true);
      return sole.getWorldPosition(new THREE.Vector3());
    }
    objects.forEach((object) => object.updateMatrixWorld(true));
    this.boundingBox.setFromObject(objects[0]!);
    objects.slice(1).forEach((object) => {
      this.boundingBox.expandByObject(object);
    });
    return this.boundingBox.getCenter(new THREE.Vector3());
  }

  /**
   * Returns the grid snap configuration.
   *
   * @returns The GridSnap instance.
   */
  getGridSnap(): GridSnap {
    return this.gridSnap;
  }

  /**
   * Rotates a single object around a pivot and updates its orientation.
   *
   * @param object The object to rotate.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The rotation to apply.
   */
  private rotateObjectAroundPivot(
    object: THREE.Object3D,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion,
  ): void {
    const relativePos = object.position.clone().sub(pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    object.position.copy(relativePos.add(pivot));
    object.quaternion.premultiply(rotationQuaternion);
  }

  /**
   * Restores rotation from initial state plus total rotation quaternion.
   *
   * @param object The object to update.
   * @param initialPositions Pre-drag positions.
   * @param initialQuaternions Pre-drag quaternions.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The total rotation from drag start.
   */
  private applyAbsoluteRotationToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion,
  ): void {
    const startLocalPosition = initialPositions.get(object);
    const startLocalQuaternion = initialQuaternions.get(object);
    if (!startLocalPosition || !startLocalQuaternion) {
      return;
    }
    this.applyWorldSpaceAbsoluteRotation(object, startLocalPosition, startLocalQuaternion, pivot, rotationQuaternion);
  }

  /**
   * Applies a world-space rotation around a world pivot, then writes local TRS.
   * Required for solid brushes under transformed solid roots so the green hull
   * and CSG pose stay locked to the same transform.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startLocalQuaternion Pre-drag local quaternion.
   * @param worldPivot World-space rotation pivot.
   * @param worldRotationQuaternion World-space rotation from drag start.
   */
  private applyWorldSpaceAbsoluteRotation(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startLocalQuaternion: THREE.Quaternion,
    worldPivot: THREE.Vector3,
    worldRotationQuaternion: THREE.Quaternion,
  ): void {
    applyWorldPivotRotation(
      object,
      startLocalPosition,
      startLocalQuaternion,
      worldPivot,
      worldRotationQuaternion,
      new THREE.Vector3(),
    );
  }

  /**
   * Scales an object along an axis and moves it relative to the pivot.
   *
   * @param object The object to scale.
   * @param pivot The scale pivot.
   * @param axis The normalized scale axis.
   * @param factor The multiplicative factor for this step.
   */
  private scaleObjectAlongAxis(
    object: THREE.Object3D,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number,
  ): void {
    const relativePos = object.position.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * factor));
    object.position.copy(scaledRelative.add(pivot));
    const absX = Math.abs(axis.x);
    const absY = Math.abs(axis.y);
    const absZ = Math.abs(axis.z);
    let gizmoAxis = GizmoAxis.Z;
    if (absX >= absY && absX >= absZ) gizmoAxis = GizmoAxis.X;
    else if (absY >= absX && absY >= absZ) gizmoAxis = GizmoAxis.Y;
    this.multiplyLocalScaleComponent(object.scale, gizmoAxis, factor);
  }

  /**
   * Restores scale from initial state plus total factor along an axis.
   *
   * @param object The object to update.
   * @param initialPositions Pre-drag positions.
   * @param initialScales Pre-drag scales.
   * @param pivot The scale pivot.
   * @param axis The normalized world-space scale axis.
   * @param totalFactor The total scale factor from drag start.
   * @param gizmoAxis Local scale component controlled by the handle.
   */
  private applyAbsoluteScaleToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis,
  ): void {
    const startPos = initialPositions.get(object);
    const startScale = initialScales.get(object);
    if (!startPos || !startScale) return;
    const relativePos = startPos.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * totalFactor));
    object.position.copy(scaledRelative.add(pivot));
    object.scale.copy(startScale);
    this.multiplyLocalScaleComponent(object.scale, gizmoAxis, totalFactor);
  }

  /**
   * Free ScaleAroundPivot in world space, then writes local TRS.
   *
   * @param object Object to update.
   * @param initialPositions Pre-drag local positions.
   * @param initialScales Pre-drag local scales.
   * @param worldPivot World-space pivot.
   * @param axisFactors Snapped per-axis scale factors.
   */
  private applyAbsoluteFreeScaleToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const startLocalPosition = initialPositions.get(object);
    const startScale = initialScales.get(object);
    if (!startLocalPosition || !startScale) {
      return;
    }
    this.writeFreeScaledLocalPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
  }

  /**
   * Writes local position and free scale from a world-space ScaleAroundPivot.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startScale Pre-drag local scale.
   * @param worldPivot World-space pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeFreeScaledLocalPose(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    if (!object.parent) {
      this.writeRootFreeScaledPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
      return;
    }
    this.writeChildFreeScaledPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
  }

  /**
   * Free scale when the object has no parent (world equals local).
   *
   * @param object Object to update.
   * @param startPosition Pre-drag position.
   * @param startScale Pre-drag scale.
   * @param worldPivot World pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeRootFreeScaledPose(
    object: THREE.Object3D,
    startPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    object.position.copy(
      TransformConstraint.scalePointAroundPivot(startPosition, worldPivot, axisFactors.x, axisFactors.y, axisFactors.z),
    );
    this.writeFreeLocalScale(object, startScale, axisFactors);
    object.updateMatrixWorld(true);
  }

  /**
   * Free scale for a child object under a transformed parent.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startScale Pre-drag local scale.
   * @param worldPivot World pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeChildFreeScaledPose(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const parent = object.parent;
    if (!parent) {
      return;
    }
    parent.updateMatrixWorld(true);
    const startWorldPosition = startLocalPosition.clone().applyMatrix4(parent.matrixWorld);
    const scaledWorldPosition = TransformConstraint.scalePointAroundPivot(
      startWorldPosition,
      worldPivot,
      axisFactors.x,
      axisFactors.y,
      axisFactors.z,
    );
    object.position.copy(scaledWorldPosition).applyMatrix4(parent.matrixWorld.clone().invert());
    this.writeFreeLocalScale(object, startScale, axisFactors);
    object.updateMatrixWorld(true);
  }

  /**
   * Multiplies local scale components by per-axis free-scale factors.
   *
   * @param object Object whose scale is written.
   * @param startScale Pre-drag local scale.
   * @param axisFactors Per-axis scale factors.
   */
  private writeFreeLocalScale(object: THREE.Object3D, startScale: THREE.Vector3, axisFactors: THREE.Vector3): void {
    object.scale.set(
      Math.max(0.01, startScale.x * axisFactors.x),
      Math.max(0.01, startScale.y * axisFactors.y),
      Math.max(0.01, startScale.z * axisFactors.z),
    );
  }

  /**
   * Multiplies one local scale component for a primary gizmo axis handle.
   *
   * @param scale The scale vector to modify in place.
   * @param gizmoAxis Handle axis (X/Y/Z).
   * @param factor The multiplicative scale factor.
   */
  private multiplyLocalScaleComponent(scale: THREE.Vector3, gizmoAxis: GizmoAxis, factor: number): void {
    if (gizmoAxis === GizmoAxis.X) {
      scale.x = Math.max(0.01, scale.x * factor);
      return;
    }
    if (gizmoAxis === GizmoAxis.Y) {
      scale.y = Math.max(0.01, scale.y * factor);
      return;
    }
    if (gizmoAxis === GizmoAxis.Z) {
      scale.z = Math.max(0.01, scale.z * factor);
      return;
    }
    scale.x = Math.max(0.01, scale.x * factor);
    scale.y = Math.max(0.01, scale.y * factor);
    scale.z = Math.max(0.01, scale.z * factor);
  }
}
