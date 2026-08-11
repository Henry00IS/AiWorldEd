import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { PlayerCharacterAvatar } from '@/player/character/player_character_avatar.js';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';

afterEach(() => {
  notificationFrameEvents.reset();
  vi.restoreAllMocks();
});

describe('PlayerCharacterAvatar footstep audio', () => {
  it('raises footstep plants while walking in first person without a mesh rig', () => {
    vi.spyOn(audioSettings, 'isEnabled').mockReturnValue(true);
    const worldRoot = new THREE.Object3D();
    const avatar = new PlayerCharacterAvatar(worldRoot);
    avatar.attach();
    const body = createWalkingBody();
    let plants = 0;
    for (let step = 0; step < 180; step++) {
      avatar.update(body, 'first_person', 1 / 60);
      notificationFrameEvents.beginFrame();
      if (notificationFrameEvents.hasPlayerFootstepSnapshot()) {
        plants += 1;
      }
    }
    avatar.dispose();
    expect(plants).toBeGreaterThan(1);
  });
});

/**
 * Builds a grounded body moving forward for gait foot plants.
 *
 * @returns Body state with walk velocity.
 */
function createWalkingBody(): PlayerBodyState {
  const body = new PlayerBodyState();
  const world = new PlayerCollisionWorld();
  body.resetAt(new THREE.Vector3(0, 0, 0), world, false, 0);
  const anyBody = body as unknown as {
    isGrounded: boolean;
    planarSpeed: number;
    horizontalVelocity: THREE.Vector3;
    moveIntent: THREE.Vector3;
    wantsRun: boolean;
  };
  anyBody.isGrounded = true;
  anyBody.horizontalVelocity.set(0, 0, 3.5);
  anyBody.planarSpeed = 3.5;
  anyBody.moveIntent.set(0, 0, 1);
  anyBody.wantsRun = false;
  return body;
}
