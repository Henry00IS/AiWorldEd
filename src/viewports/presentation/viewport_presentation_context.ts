import * as THREE from 'three';
import { axisToVector, buildCoordinateRotation, unitsPerMeter } from '@/io/coordinates/coordinate_space_transform.js';
import type { AxisDirection } from '@/settings/coordinate/coordinate_space_types.js';
import { getUnitLabel } from '@/settings/units/unit_presets.js';
import type { GameProfile } from '@/settings/store/settings_types.js';
import { DEFAULT_PERSPECTIVE_CAMERA_OFFSET } from '@/types/editor_config.js';

/** Semantic camera view used to derive profile-aware canonical poses. */
export type ViewportPresentationView = 'top' | 'front' | 'side' | 'perspective';

/**
 * Profile-aware basis and unit conversion shared by viewport presentation
 * systems.
 */
export class ViewportPresentationContext {
  private profile: GameProfile | null;
  private editorFromProfile: THREE.Matrix3;
  private editorRight: THREE.Vector3;
  private editorUp: THREE.Vector3;
  private editorForward: THREE.Vector3;
  private profileUnitsPerMeter: number;
  private unitLabel: string;

  /** Creates a presentation context using the editor convention by default. */
  constructor(profile: GameProfile | null = null) {
    this.profile = null;
    this.editorFromProfile = new THREE.Matrix3();
    this.editorRight = new THREE.Vector3(1, 0, 0);
    this.editorUp = new THREE.Vector3(0, 1, 0);
    this.editorForward = new THREE.Vector3(0, 0, -1);
    this.profileUnitsPerMeter = 1;
    this.unitLabel = 'm';
    this.setProfile(profile);
  }

  /** Applies a new active profile and rebuilds the derived presentation basis. */
  setProfile(profile: GameProfile | null): void {
    this.profile = profile;
    this.rebuildDerivedBasis();
  }

  /** Returns the active profile or null when the editor convention is active. */
  getProfile(): GameProfile | null {
    return this.profile;
  }

  /** Returns whether a profile differs from the context's current profile. */
  hasProfileChanged(profile: GameProfile | null): boolean {
    if (!this.profile || !profile) return this.profile !== profile;
    return !this.areProfilesEquivalent(this.profile, profile);
  }

  /** Returns the editor-space direction represented as profile right. */
  getEditorRight(): THREE.Vector3 {
    return this.editorRight.clone();
  }

  /** Returns the editor-space direction represented as profile up. */
  getEditorUp(): THREE.Vector3 {
    return this.editorUp.clone();
  }

  /** Returns the editor-space direction represented as profile forward. */
  getEditorForward(): THREE.Vector3 {
    return this.editorForward.clone();
  }

  /** Converts an editor-space length in meters into active profile units. */
  toProfileUnits(meters: number): number {
    return meters * this.profileUnitsPerMeter;
  }

  /** Converts an active profile-unit length into editor meters. */
  fromProfileUnits(units: number): number {
    return units / this.profileUnitsPerMeter;
  }

  /** Returns the short unit label used by viewport measurements. */
  getUnitLabel(): string {
    return this.unitLabel;
  }

  /** Returns a profile axis token formatted for the orientation widget. */
  getAxisLabel(role: 'right' | 'up' | 'forward'): string {
    const axis = this.resolveProfileAxis(role);
    return axis.toUpperCase();
  }

  /** Returns the canonical orthographic camera position for a viewport view. */
  getOrthographicCameraPosition(
    view: Exclude<ViewportPresentationView, 'perspective'>,
    distance: number,
  ): THREE.Vector3 {
    const direction = this.resolveOrthographicDirection(view);
    return direction.multiplyScalar(distance);
  }

  /** Returns a stable camera-up direction for a canonical orthographic view. */
  getOrthographicCameraUp(view: Exclude<ViewportPresentationView, 'perspective'>): THREE.Vector3 {
    if (view === 'top') {
      return this.editorForward.clone();
    }
    return this.editorUp.clone();
  }

  /** Returns the canonical perspective camera position in editor space. */
  getPerspectiveCameraPosition(): THREE.Vector3 {
    const direction = this.editorRight.clone().add(this.editorUp).sub(this.editorForward).normalize();
    return direction.multiplyScalar(DEFAULT_PERSPECTIVE_CAMERA_OFFSET * Math.sqrt(3));
  }

  /** Returns the profile-aware floor orientation as a quaternion. */
  getGridOrientation(): THREE.Quaternion {
    const zAxis = new THREE.Vector3().crossVectors(this.editorRight, this.editorUp).normalize();
    const matrix = new THREE.Matrix4().makeBasis(this.editorRight, this.editorUp, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }

  /** Rebuilds all cached axis and unit values from the current profile. */
  private rebuildDerivedBasis(): void {
    this.profileUnitsPerMeter = this.profile ? unitsPerMeter(this.profile) : 1;
    this.unitLabel = this.profile ? this.resolveUnitLabel(this.profile) : 'm';
    this.editorFromProfile.copy(this.resolveEditorFromProfileRotation());
    this.editorRight.copy(this.resolveEditorAxis('right'));
    this.editorUp.copy(this.resolveEditorAxis('up'));
    this.editorForward.copy(this.resolveEditorAxis('forward'));
  }

  /** Returns the inverse of the editor-to-profile axis rotation. */
  private resolveEditorFromProfileRotation(): THREE.Matrix3 {
    const target = this.profile?.coordinateSpace;
    if (!target) {
      return new THREE.Matrix3().identity();
    }
    return buildCoordinateRotation(target).invert();
  }

  /** Resolves one semantic profile axis into editor coordinates. */
  private resolveEditorAxis(role: 'right' | 'up' | 'forward'): THREE.Vector3 {
    const axis = this.resolveProfileAxis(role);
    return axisToVector(axis).applyMatrix3(this.editorFromProfile).normalize();
  }

  /** Resolves the stored axis token for one semantic role. */
  private resolveProfileAxis(role: 'right' | 'up' | 'forward'): AxisDirection {
    if (!this.profile) {
      if (role === 'right') return '+x';
      if (role === 'up') return '+y';
      return '-z';
    }
    return this.profile.coordinateSpace[role];
  }

  /** Resolves the short display unit label for a profile. */
  private resolveUnitLabel(profile: GameProfile): string {
    const unit = profile.unitSystem === 'metric' ? profile.metricUnit : profile.imperialUnit;
    return this.resolveShortUnitLabel(getUnitLabel(profile.unitSystem, unit));
  }

  /** Converts a long unit label to the compact viewport suffix. */
  private resolveShortUnitLabel(label: string): string {
    const labels: Record<string, string> = {
      Millimeter: 'mm',
      Centimeter: 'cm',
      Meter: 'm',
      Kilometer: 'km',
      Inch: 'in',
      Foot: 'ft',
      Yard: 'yd',
      Mile: 'mi',
    };
    return labels[label] ?? label;
  }

  /** Compares all profile values that affect viewport presentation. */
  private areProfilesEquivalent(left: GameProfile, right: GameProfile): boolean {
    const leftSpace = left.coordinateSpace;
    const rightSpace = right.coordinateSpace;
    return (
      left.id === right.id &&
      left.unitSystem === right.unitSystem &&
      left.metricUnit === right.metricUnit &&
      left.imperialUnit === right.imperialUnit &&
      leftSpace.presetId === rightSpace.presetId &&
      leftSpace.handedness === rightSpace.handedness &&
      leftSpace.up === rightSpace.up &&
      leftSpace.right === rightSpace.right &&
      leftSpace.forward === rightSpace.forward
    );
  }

  /** Resolves the direction from the origin toward a canonical view camera. */
  private resolveOrthographicDirection(view: Exclude<ViewportPresentationView, 'perspective'>): THREE.Vector3 {
    if (view === 'top') return this.editorUp.clone();
    if (view === 'front') return this.editorForward.clone().negate();
    return this.editorRight.clone();
  }
}
