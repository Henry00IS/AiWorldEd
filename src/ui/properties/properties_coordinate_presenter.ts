import * as THREE from 'three';
import {
  CoordinateSpaceAdapter,
  type CoordinateTransformComponents,
} from '../../coordinates/coordinate_space_adapter.js';
import { createDefaultCoordinateSpace } from '../../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../../settings/coordinate_space_types.js';

/** Optional profile-axis values supplied by transform property inputs. */
export interface PropertyAxisValues {
  x: number | null;
  y: number | null;
  z: number | null;
}

/** Converts Properties panel transforms without changing stored object data. */
export class PropertiesCoordinatePresenter {
  private adapter: CoordinateSpaceAdapter;
  private identity: boolean;

  /** Creates the presenter in the identity editor profile. */
  constructor() {
    this.adapter = new CoordinateSpaceAdapter(createDefaultCoordinateSpace());
    this.identity = true;
  }

  /**
   * Changes the coordinate space used by subsequent reads and writes.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    this.adapter = new CoordinateSpaceAdapter(space);
    this.identity = this.adapter.isIdentity();
  }

  /**
   * Returns one object's local transform expressed in profile coordinates.
   *
   * @param object Editor object.
   * @returns Profile-space transform.
   */
  readTransform(object: THREE.Object3D): CoordinateTransformComponents {
    return this.adapter.toProfileTransform(object.position, object.quaternion, object.scale);
  }

  /**
   * Reads display rotation degrees while preserving identity-profile Eulers.
   *
   * @param object Editor object.
   * @returns Rotation degrees.
   */
  readRotationDegrees(object: THREE.Object3D): THREE.Vector3 {
    if (this.identity) return eulerDegrees(object.rotation);
    const profile = this.readTransform(object);
    return eulerDegrees(new THREE.Euler().setFromQuaternion(profile.quaternion, 'XYZ'));
  }

  /**
   * Converts edited profile position values into an editor-space position.
   *
   * @param object Object providing unchanged transform components.
   * @param values Optional profile position components.
   * @returns Editor-space position.
   */
  writePosition(object: THREE.Object3D, values: PropertyAxisValues): THREE.Vector3 {
    if (this.identity) return writeIdentityVector(object.position, values);
    const profile = this.readTransform(object);
    applyAxisValues(profile.position, values);
    return this.toEditorTransform(profile).position;
  }

  /**
   * Converts edited profile Euler degrees into an editor-space Euler.
   *
   * @param object Object providing unchanged transform components.
   * @param values Optional profile rotation components in degrees.
   * @returns Editor-space Euler.
   */
  writeRotation(object: THREE.Object3D, values: PropertyAxisValues): THREE.Euler {
    if (this.identity) return writeIdentityRotation(object.rotation, values);
    const profile = this.readTransform(object);
    const euler = new THREE.Euler().setFromQuaternion(profile.quaternion, 'XYZ');
    applyEulerDegrees(euler, values);
    profile.quaternion.setFromEuler(euler);
    const editor = this.toEditorTransform(profile);
    return new THREE.Euler().setFromQuaternion(editor.quaternion, 'XYZ');
  }

  /**
   * Converts edited profile scale values into an editor-space scale.
   *
   * @param object Object providing unchanged transform components.
   * @param values Optional profile scale components.
   * @returns Editor-space scale.
   */
  writeScale(object: THREE.Object3D, values: PropertyAxisValues): THREE.Vector3 {
    if (this.identity) return writeIdentityVector(object.scale, values);
    const profile = this.readTransform(object);
    applyAxisValues(profile.scale, values);
    return this.toEditorTransform(profile).scale;
  }

  /**
   * Converts complete profile components back to editor space.
   *
   * @param profile Profile transform.
   * @returns Editor transform.
   */
  private toEditorTransform(profile: CoordinateTransformComponents): CoordinateTransformComponents {
    return this.adapter.toEditorTransform(profile.position, profile.quaternion, profile.scale);
  }
}

/**
 * Applies non-null axis values to a vector.
 *
 * @param vector Vector to mutate.
 * @param values Optional axis values.
 */
function applyAxisValues(vector: THREE.Vector3, values: PropertyAxisValues): void {
  if (values.x !== null) vector.x = values.x;
  if (values.y !== null) vector.y = values.y;
  if (values.z !== null) vector.z = values.z;
}

/**
 * Applies non-null degree values to an Euler.
 *
 * @param euler Euler to mutate.
 * @param values Optional degree values.
 */
function applyEulerDegrees(euler: THREE.Euler, values: PropertyAxisValues): void {
  if (values.x !== null) euler.x = THREE.MathUtils.degToRad(values.x);
  if (values.y !== null) euler.y = THREE.MathUtils.degToRad(values.y);
  if (values.z !== null) euler.z = THREE.MathUtils.degToRad(values.z);
}

/**
 * Applies values to an independently cloned identity-space vector.
 *
 * @param source Source vector.
 * @param values Optional axis values.
 * @returns Edited clone.
 */
function writeIdentityVector(source: THREE.Vector3, values: PropertyAxisValues): THREE.Vector3 {
  const result = source.clone();
  applyAxisValues(result, values);
  return result;
}

/**
 * Applies degree values to an independently cloned identity-space Euler.
 *
 * @param source Source Euler.
 * @param values Optional degree values.
 * @returns Edited Euler.
 */
function writeIdentityRotation(source: THREE.Euler, values: PropertyAxisValues): THREE.Euler {
  const result = source.clone();
  applyEulerDegrees(result, values);
  return result;
}

/**
 * Converts an Euler to a vector of degree values.
 *
 * @param euler Source Euler.
 * @returns Degree vector.
 */
function eulerDegrees(euler: THREE.Euler): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  );
}
