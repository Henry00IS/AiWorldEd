import * as THREE from 'three';
import { GizmoAxis } from '../types/transform_mode.js';
import { GridSnap } from './grid_snap.js';

/**
 * Applies transform operations to selected objects.
 * Handles translation, rotation, and scale with optional snapping.
 */
export class TransformExecutor {
  private gridSnap: GridSnap;
  private boundingBox: THREE.Box3;

  /**
   * Creates a new transform executor with the given grid snap configuration.
   * @param gridSnap The grid snap settings for constraining transforms.
   */
  constructor(gridSnap: GridSnap) {
    this.gridSnap = gridSnap;
    this.boundingBox = new THREE.Box3();
  }

  /**
   * Translates all objects by the given delta without snapping the delta itself.
   * Moved axes snap so world-space bounds sit on the grid (not the pivot alone).
   * @param objects The meshes to translate.
   * @param delta The translation delta vector.
   */
  executeTranslation(objects: THREE.Mesh[], delta: THREE.Vector3): void {
    objects.forEach((mesh) => {
      const start = mesh.position.clone();
      mesh.position.add(delta);
      this.snapTranslationOnChangedAxes(mesh, start);
    });
  }

  /**
   * Sets absolute positions from initial positions plus a total delta.
   * Snaps only axes that moved so unconstrained axes stay put.
   * Snapping aligns mesh world bounds to the grid, not just the pivot.
   * @param objects The meshes to position.
   * @param initialPositions Map of mesh to pre-drag position.
   * @param totalDelta Accumulated unsnapped translation delta.
   */
  applyAbsoluteTranslation(
    objects: THREE.Mesh[],
    initialPositions: Map<THREE.Mesh, THREE.Vector3>,
    totalDelta: THREE.Vector3
  ): void {
    objects.forEach((mesh) => {
      const start = initialPositions.get(mesh);
      if (!start) return;
      mesh.position.copy(start).add(totalDelta);
      this.snapTranslationOnChangedAxes(mesh, start);
    });
  }

  /**
   * Snaps moved translation axes so each world AABB min lands on the grid.
   * Keeps odd-sized brushes (e.g. size 3.75 on a 0.25 grid) face-aligned:
   * the pivot may sit on a half-cell while edges stay on grid lines.
   * Falls back to pivot snapping when geometry bounds are unavailable.
   * @param mesh The mesh whose position was just updated.
   * @param startPosition Pre-drag local position used to detect changed axes.
   */
  private snapTranslationOnChangedAxes(
    mesh: THREE.Mesh,
    startPosition: THREE.Vector3
  ): void {
    if (!this.gridSnap.isEnabled()) return;
    const movedX = this.didAxisMove(mesh.position.x, startPosition.x);
    const movedY = this.didAxisMove(mesh.position.y, startPosition.y);
    const movedZ = this.didAxisMove(mesh.position.z, startPosition.z);
    if (!movedX && !movedY && !movedZ) return;
    const worldBox = this.computeWorldAabb(mesh);
    if (!worldBox) {
      this.gridSnap.snapChangedAxes(mesh.position, startPosition);
      return;
    }
    this.applyBoundsMinSnap(mesh, worldBox, movedX, movedY, movedZ);
  }

  /**
   * Returns whether a scalar axis value changed beyond a tiny epsilon.
   * @param current Current axis component.
   * @param start Start axis component.
   * @returns True when the axis should be snapped.
   */
  private didAxisMove(current: number, start: number): boolean {
    return Math.abs(current - start) > 1e-8;
  }

  /**
   * Computes the world-space axis-aligned bounds of a mesh from its geometry.
   * @param mesh The mesh to measure.
   * @returns World AABB, or null when geometry has no usable bounds.
   */
  private computeWorldAabb(mesh: THREE.Mesh): THREE.Box3 | null {
    const geometry = mesh.geometry;
    if (!geometry) return null;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const localBox = geometry.boundingBox;
    if (!localBox || localBox.isEmpty()) return null;
    mesh.updateMatrixWorld(true);
    this.boundingBox.copy(localBox).applyMatrix4(mesh.matrixWorld);
    return this.boundingBox;
  }

  /**
   * Applies per-axis corrections so world AABB mins snap to the grid.
   * @param mesh Mesh to adjust.
   * @param worldBox Current world AABB at the unsnapped position.
   * @param movedX Whether X should snap.
   * @param movedY Whether Y should snap.
   * @param movedZ Whether Z should snap.
   */
  private applyBoundsMinSnap(
    mesh: THREE.Mesh,
    worldBox: THREE.Box3,
    movedX: boolean,
    movedY: boolean,
    movedZ: boolean
  ): void {
    if (movedX) {
      mesh.position.x += this.gridSnap.snapValue(worldBox.min.x) - worldBox.min.x;
    }
    if (movedY) {
      mesh.position.y += this.gridSnap.snapValue(worldBox.min.y) - worldBox.min.y;
    }
    if (movedZ) {
      mesh.position.z += this.gridSnap.snapValue(worldBox.min.z) - worldBox.min.z;
    }
  }

  /**
   * Rotates all objects around a pivot point and updates each object's orientation.
   * @param objects The meshes to rotate.
   * @param pivot The center point of rotation.
   * @param axis The rotation axis vector.
   * @param angle The rotation angle in radians.
   */
  executeRotation(
    objects: THREE.Mesh[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    angle: number
  ): void {
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
      normalizedAxis,
      angle
    );
    objects.forEach((mesh) => {
      this.rotateMeshAroundPivot(mesh, pivot, rotationQuaternion);
    });
  }

  /**
   * Applies absolute rotation from pre-drag state using a total angle.
   * @param objects The meshes to rotate.
   * @param initialPositions Map of mesh to pre-drag position.
   * @param initialQuaternions Map of mesh to pre-drag quaternion.
   * @param pivot The rotation pivot point.
   * @param axis The rotation axis vector.
   * @param totalAngle Accumulated signed rotation angle in radians.
   */
  applyAbsoluteRotation(
    objects: THREE.Mesh[],
    initialPositions: Map<THREE.Mesh, THREE.Vector3>,
    initialQuaternions: Map<THREE.Mesh, THREE.Quaternion>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalAngle: number
  ): void {
    const snappedAngle = this.gridSnap.snapAngleRadians(totalAngle);
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
      normalizedAxis,
      snappedAngle
    );
    objects.forEach((mesh) => {
      this.applyAbsoluteRotationToMesh(
        mesh,
        initialPositions,
        initialQuaternions,
        pivot,
        rotationQuaternion
      );
    });
  }

  /**
   * Scales all objects along an axis relative to a pivot, updating mesh.scale.
   * @param objects The meshes to scale.
   * @param pivot The center point of scaling.
   * @param axis The scaling axis vector.
   * @param factor The multiplicative scale factor for this step.
   */
  executeScale(
    objects: THREE.Mesh[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number
  ): void {
    const normalizedAxis = axis.clone().normalize();
    const safeFactor = Math.max(0.01, factor);
    objects.forEach((mesh) => {
      this.scaleMeshAlongAxis(mesh, pivot, normalizedAxis, safeFactor);
    });
  }

  /**
   * Applies absolute scale from pre-drag state using a total factor.
   * @param objects The meshes to scale.
   * @param initialPositions Map of mesh to pre-drag position.
   * @param initialScales Map of mesh to pre-drag scale.
   * @param pivot The scale pivot point.
   * @param worldAxis World-space direction of the scale handle.
   * @param totalFactor Accumulated scale factor relative to drag start.
   * @param gizmoAxis Which local scale component the handle maps to (X/Y/Z).
   */
  applyAbsoluteScale(
    objects: THREE.Mesh[],
    initialPositions: Map<THREE.Mesh, THREE.Vector3>,
    initialScales: Map<THREE.Mesh, THREE.Vector3>,
    pivot: THREE.Vector3,
    worldAxis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis = GizmoAxis.X
  ): void {
    const snappedFactor = this.gridSnap.snapScaleFactor(totalFactor);
    const normalizedAxis = worldAxis.clone().normalize();
    objects.forEach((mesh) => {
      this.applyAbsoluteScaleToMesh(
        mesh,
        initialPositions,
        initialScales,
        pivot,
        normalizedAxis,
        snappedFactor,
        gizmoAxis
      );
    });
  }

  /**
   * Computes the center of the bounding box of all objects.
   * Used as the default pivot point for transforms.
   * @param objects The meshes to compute the pivot for.
   * @returns The bounding box center point.
   */
  computePivot(objects: THREE.Mesh[]): THREE.Vector3 {
    if (objects.length === 0) return new THREE.Vector3(0, 0, 0);
    if (objects.length === 1) return objects[0].position.clone();
    this.boundingBox.setFromObject(objects[0]);
    objects.slice(1).forEach((mesh) => {
      this.boundingBox.expandByObject(mesh);
    });
    return this.boundingBox.getCenter(new THREE.Vector3());
  }

  /**
   * Returns the grid snap configuration.
   * @returns The GridSnap instance.
   */
  getGridSnap(): GridSnap {
    return this.gridSnap;
  }

  /**
   * Rotates a single mesh around a pivot and updates its orientation.
   * @param mesh The mesh to rotate.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The rotation to apply.
   */
  private rotateMeshAroundPivot(
    mesh: THREE.Mesh,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion
  ): void {
    const relativePos = mesh.position.clone().sub(pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    mesh.position.copy(relativePos.add(pivot));
    mesh.quaternion.premultiply(rotationQuaternion);
  }

  /**
   * Restores rotation from initial state plus total rotation quaternion.
   * @param mesh The mesh to update.
   * @param initialPositions Pre-drag positions.
   * @param initialQuaternions Pre-drag quaternions.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The total rotation from drag start.
   */
  private applyAbsoluteRotationToMesh(
    mesh: THREE.Mesh,
    initialPositions: Map<THREE.Mesh, THREE.Vector3>,
    initialQuaternions: Map<THREE.Mesh, THREE.Quaternion>,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion
  ): void {
    const startPos = initialPositions.get(mesh);
    const startQuat = initialQuaternions.get(mesh);
    if (!startPos || !startQuat) return;
    const relativePos = startPos.clone().sub(pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    mesh.position.copy(relativePos.add(pivot));
    mesh.quaternion.copy(rotationQuaternion).multiply(startQuat);
  }

  /**
   * Scales a mesh along an axis and moves it relative to the pivot.
   * @param mesh The mesh to scale.
   * @param pivot The scale pivot.
   * @param axis The normalized scale axis.
   * @param factor The multiplicative factor for this step.
   */
  private scaleMeshAlongAxis(
    mesh: THREE.Mesh,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number
  ): void {
    const relativePos = mesh.position.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * factor));
    mesh.position.copy(scaledRelative.add(pivot));
    const absX = Math.abs(axis.x);
    const absY = Math.abs(axis.y);
    const absZ = Math.abs(axis.z);
    let gizmoAxis = GizmoAxis.Z;
    if (absX >= absY && absX >= absZ) gizmoAxis = GizmoAxis.X;
    else if (absY >= absX && absY >= absZ) gizmoAxis = GizmoAxis.Y;
    this.multiplyLocalScaleComponent(mesh.scale, gizmoAxis, factor);
  }

  /**
   * Restores scale from initial state plus total factor along an axis.
   * @param mesh The mesh to update.
   * @param initialPositions Pre-drag positions.
   * @param initialScales Pre-drag scales.
   * @param pivot The scale pivot.
   * @param axis The normalized world-space scale axis.
   * @param totalFactor The total scale factor from drag start.
   * @param gizmoAxis Local scale component controlled by the handle.
   */
  private applyAbsoluteScaleToMesh(
    mesh: THREE.Mesh,
    initialPositions: Map<THREE.Mesh, THREE.Vector3>,
    initialScales: Map<THREE.Mesh, THREE.Vector3>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis
  ): void {
    const startPos = initialPositions.get(mesh);
    const startScale = initialScales.get(mesh);
    if (!startPos || !startScale) return;
    const relativePos = startPos.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * totalFactor));
    mesh.position.copy(scaledRelative.add(pivot));
    mesh.scale.copy(startScale);
    this.multiplyLocalScaleComponent(mesh.scale, gizmoAxis, totalFactor);
  }

  /**
   * Multiplies one local scale component for a primary gizmo axis handle.
   * @param scale The scale vector to modify in place.
   * @param gizmoAxis Handle axis (X/Y/Z).
   * @param factor The multiplicative scale factor.
   */
  private multiplyLocalScaleComponent(
    scale: THREE.Vector3,
    gizmoAxis: GizmoAxis,
    factor: number
  ): void {
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
