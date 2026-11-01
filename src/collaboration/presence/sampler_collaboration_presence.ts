import * as THREE from 'three';
import type {
  HostCollaborationEditor,
  HostCollaborationPlayer,
} from '@/collaboration/host/host_collaboration_editor.js';
import {
  lookCollaborationPresenceEncode,
  lookCollaborationPresenceFlags,
} from '@/collaboration/presence/look_collaboration_presence.js';
import {
  PRESENCE_CAMERA_ID_MAXIMUM,
  PRESENCE_ENTRIES_MAXIMUM,
  PRESENCE_ID_CHARACTER,
  PRESENCE_POSITION_LIMIT,
  type PresenceEntry,
} from '@/collaboration/shared/presence_frame.js';

const samplerPosition = new THREE.Vector3();
const samplerQuaternion = new THREE.Quaternion();

/**
 * Reads the local presence: every perspective viewport camera (the play-mode
 * camera excepted, the character stands for it) and the play-mode character.
 *
 * @param host Editor services.
 * @returns Entries for one presence frame.
 */
export function samplerCollaborationPresence(host: HostCollaborationEditor): PresenceEntry[] {
  const player = host.presencePlayer();
  const entries: PresenceEntry[] = [];
  host.presenceCameras().forEach((camera, id) => {
    if (id > PRESENCE_CAMERA_ID_MAXIMUM || camera === player?.camera) return;
    const entry = samplerCollaborationCamera(camera, id);
    if (entry !== null) entries.push(entry);
  });
  const limit = player === null ? PRESENCE_ENTRIES_MAXIMUM : PRESENCE_ENTRIES_MAXIMUM - 1;
  const sample = entries.slice(0, limit);
  const character = player === null ? null : samplerCollaborationCharacter(player);
  return character === null ? sample : [...sample, character];
}

/**
 * Reads one viewport camera.
 *
 * @param camera Perspective camera.
 * @param id Camera slot.
 * @returns Entry, or null when the pose is unusable.
 */
function samplerCollaborationCamera(camera: THREE.PerspectiveCamera, id: number): PresenceEntry | null {
  camera.updateWorldMatrix(true, false);
  camera.matrixWorld.decompose(samplerPosition, samplerQuaternion, new THREE.Vector3());
  const fov = THREE.MathUtils.clamp(Math.round(camera.fov), 1, 179);
  return samplerCollaborationEntry(id, samplerPosition, samplerQuaternion.normalize(), fov);
}

/**
 * Reads the play-mode character: feet, body facing plus look in the
 * orientation, motion flags in the last byte.
 *
 * @param player Play-mode pose.
 * @returns Entry, or null when the pose is unusable.
 */
function samplerCollaborationCharacter(player: HostCollaborationPlayer): PresenceEntry | null {
  lookCollaborationPresenceEncode(player.yawRadians, player.lookYawRadians, player.pitchRadians, samplerQuaternion);
  const flags = lookCollaborationPresenceFlags({
    grounded: player.grounded,
    wallPushing: player.wallPushing,
    running: player.running,
  });
  return samplerCollaborationEntry(PRESENCE_ID_CHARACTER, player.feet, samplerQuaternion, flags);
}

/**
 * Builds an entry when the position is finite and within the relay bounds.
 *
 * @param id Entry id.
 * @param position World position.
 * @param quaternion Unit orientation.
 * @param fov Field of view in degrees, or the character's motion flags.
 * @returns Entry, or null.
 */
function samplerCollaborationEntry(
  id: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  fov: number,
): PresenceEntry | null {
  const values = [position.x, position.y, position.z];
  if (!values.every((value) => Number.isFinite(value) && Math.abs(value) < PRESENCE_POSITION_LIMIT)) return null;
  if (![quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(Number.isFinite)) return null;
  return {
    id,
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    fov,
  };
}
