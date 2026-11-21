import * as THREE from 'three';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import type { SolidScriptBoxCorners, SolidScriptBoxPose } from '@/solid_script/language/solid_script_box.js';

/** Box values a script reads as $Box, taken from a generator or modifier volume. */
export interface ModifierStackSolidScriptBoxValues {
  /** Width, height and depth in metres. */
  size: readonly [number, number, number];
  /** Pose of the volume in the level. */
  pose: SolidScriptBoxPose;
  /** Lowest and highest corners in script space. */
  corners: SolidScriptBoxCorners;
}

/**
 * Reads the volume's pose in the level, in metres and degrees, matching the
 * inspector when the volume has no parent.
 *
 * @param volume Generator node or modifier volume.
 * @returns Position, rotation and scale in the level.
 */
export function modifierStackSolidScriptBoxPose(volume: THREE.Object3D): SolidScriptBoxPose {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  volume.updateWorldMatrix(true, false);
  volume.matrixWorld.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return {
    position: modifierStackSolidScriptBoxRounded(position.toArray()),
    rotation: modifierStackSolidScriptBoxRounded([
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ]),
    scale: modifierStackSolidScriptBoxRounded(scale.toArray()),
  };
}

/** Steps a pose value is rounded to, past the noise a turn leaves in it. */
const MODIFIER_STACK_SOLID_SCRIPT_BOX_STEPS = 1e9;

/**
 * Rounds pose components past floating-point noise, the same way a turned
 * volume still measures the same box.
 *
 * @param values Components.
 * @returns Rounded components.
 */
function modifierStackSolidScriptBoxRounded(values: readonly number[]): [number, number, number] {
  return values.map(
    (value) => Math.round(value * MODIFIER_STACK_SOLID_SCRIPT_BOX_STEPS) / MODIFIER_STACK_SOLID_SCRIPT_BOX_STEPS,
  ) as [number, number, number];
}

/**
 * Returns the box corners in script space, whose origin is the given centre.
 *
 * @param box Box in frame coordinates.
 * @param origin Script origin in frame coordinates.
 * @returns Lowest and highest corners.
 */
export function modifierStackSolidScriptBoxCorners(box: THREE.Box3, origin: THREE.Vector3): SolidScriptBoxCorners {
  return {
    min: [box.min.x - origin.x, box.min.y - origin.y, box.min.z - origin.z],
    max: [box.max.x - origin.x, box.max.y - origin.y, box.max.z - origin.z],
  };
}

/**
 * Reads $Box from a generator or modifier volume: its size and pose in the
 * level, and its corners in the script's space, whose origin is the centre of
 * the layout box.
 *
 * @param volume Generator node or modifier volume.
 * @param scriptBox Layout box whose centre is the script origin.
 * @returns Values the script reads as $Box.
 */
export function modifierStackSolidScriptBoxValues(
  volume: THREE.Object3D,
  scriptBox: THREE.Box3,
): ModifierStackSolidScriptBoxValues {
  const volumeBox = modifierStackVolumeBox(volume);
  const source = volumeBox.isEmpty() ? scriptBox : volumeBox;
  const size = source.getSize(new THREE.Vector3());
  const origin = scriptBox.getCenter(new THREE.Vector3());
  return {
    size: [size.x, size.y, size.z],
    pose: modifierStackSolidScriptBoxPose(volume),
    corners: modifierStackSolidScriptBoxCorners(source, origin),
  };
}
