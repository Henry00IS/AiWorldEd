import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoVisualStyle } from '@/transform/gizmo/gizmo_visual_style.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { transformModalAxisColorHex } from '@/transform/modal/transform_modal_axis_vector.js';

/**
 * Infinite-looking RGB axis guide drawn through the gizmo origin when a modal
 * keyboard axis lock is active.
 */
export class TransformModalConstraintLine {
  private readonly root: THREE.Group;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.LineBasicMaterial;
  private readonly line: THREE.Line;
  private readonly halfLength: number;

  /**
   * Creates a hidden constraint line using theme axis colors.
   *
   * @param theme Editor theme (kept for API symmetry with other gizmo visuals).
   * @param halfLength Half-length of the guide ray in local units.
   */
  constructor(_theme: typeof Theme, halfLength: number = 500) {
    this.halfLength = halfLength;
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({
      color: 0xff3333,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.name = 'transform_modal_constraint_line';
    this.line.renderOrder = GizmoVisualStyle.frontRenderOrder + 2;
    this.line.frustumCulled = false;
    this.root = new THREE.Group();
    this.root.name = 'transform_modal_constraint_line_root';
    this.root.visible = false;
    this.root.add(this.line);
    this.writeAxisGeometry(new THREE.Vector3(1, 0, 0));
  }

  /**
   * Returns the root object to parent under the gizmo handle group.
   *
   * @returns Constraint line root group.
   */
  getObject(): THREE.Group {
    return this.root;
  }

  /**
   * Shows or hides the constraint guide for a modal axis lock.
   *
   * @param axis Modal axis lock; None hides the line.
   * @param frameQuaternion Orientation of the guide relative to its parent.
   */
  setAxis(axis: TransformModalAxis, frameQuaternion: THREE.Quaternion | null = null): void {
    if (axis === TransformModalAxis.None) {
      this.root.visible = false;
      return;
    }
    this.material.color.setHex(transformModalAxisColorHex(axis));
    this.writeAxisGeometry(this.localDirectionForAxis(axis));
    this.applyFrameQuaternion(frameQuaternion);
    this.root.visible = true;
  }

  /**
   * Copies a parent-relative orientation onto the guide root.
   *
   * @param frameQuaternion Orientation relative to the parent, or null for
   *   identity.
   */
  private applyFrameQuaternion(frameQuaternion: THREE.Quaternion | null): void {
    if (!frameQuaternion) {
      this.root.quaternion.identity();
      return;
    }
    this.root.quaternion.copy(frameQuaternion);
  }

  /** Hides the constraint line. */
  hide(): void {
    this.root.visible = false;
  }

  /**
   * Returns whether the constraint line is currently visible.
   *
   * @returns True when shown.
   */
  isVisible(): boolean {
    return this.root.visible;
  }

  /** Releases GPU resources. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Maps a modal axis to a unit local direction.
   *
   * @param axis Locked modal axis.
   * @returns Local unit vector.
   */
  private localDirectionForAxis(axis: TransformModalAxis): THREE.Vector3 {
    if (axis === TransformModalAxis.X) return new THREE.Vector3(1, 0, 0);
    if (axis === TransformModalAxis.Y) return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
  }

  /**
   * Writes line endpoints along a local direction.
   *
   * @param direction Unit local axis direction.
   */
  private writeAxisGeometry(direction: THREE.Vector3): void {
    const start = direction.clone().multiplyScalar(-this.halfLength);
    const end = direction.clone().multiplyScalar(this.halfLength);
    this.geometry.setFromPoints([start, end]);
  }
}
