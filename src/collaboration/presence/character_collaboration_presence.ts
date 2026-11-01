import * as THREE from 'three';
import { BodyCollaborationPresence } from '@/collaboration/presence/body_collaboration_presence.js';
import type { PresenceCollaborationItem } from '@/collaboration/presence/camera_collaboration_presence.js';
import { INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS } from '@/collaboration/presence/interpolation_collaboration_presence.js';
import {
  lookCollaborationPresenceDecode,
  lookCollaborationPresenceMotion,
  type MotionCollaborationPresence,
} from '@/collaboration/presence/look_collaboration_presence.js';
import { NametagCollaborationPresence } from '@/collaboration/presence/nametag_collaboration_presence.js';
import {
  POSE_COLLABORATION_PRESENCE_TELEPORT_METERS,
  PoseCollaborationPresence,
} from '@/collaboration/presence/pose_collaboration_presence.js';
import {
  SoundCollaborationPresence,
  type SoundCollaborationPresenceSink,
} from '@/collaboration/presence/sound_collaboration_presence.js';
import { presenceCollaborationTag } from '@/collaboration/presence/tag_collaboration_presence.js';
import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { PlayerCharacterAnimator } from '@/player/character/player_character_animator.js';
import { playerCharacterLookApply, playerCharacterLookDistribute } from '@/player/character/player_character_look.js';
import { playerCharacterBuildRig, type PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import {
  playerCharacterEnsureModelLoaded,
  playerCharacterIsModelReady,
} from '@/player/character/player_character_model_loader.js';

/** Height of the name tag anchor above the feet. */
const CHARACTER_COLLABORATION_PRESENCE_TAG_HEIGHT = 1.9;
/** How strongly the member color replaces the body color. */
const CHARACTER_COLLABORATION_PRESENCE_TINT = 0.6;
/** Longest animation step, in seconds (after a stall the pose catches up). */
const CHARACTER_COLLABORATION_PRESENCE_STEP_SECONDS = 0.1;
/** How long the limbs keep animating after the body came to rest. */
const CHARACTER_COLLABORATION_PRESENCE_SETTLE_MS = 600;
/** Motion flags kept for the delayed timeline. */
const CHARACTER_COLLABORATION_PRESENCE_FLAGS_KEPT = 16;

/** Source of the shared character model. */
export interface CharacterCollaborationModel {
  /**
   * Returns true when build can run.
   *
   * @returns Ready state.
   */
  ready(): boolean;
  /**
   * Loads the model once.
   *
   * @returns Load promise.
   */
  load(): Promise<unknown>;
  /**
   * Clones the model (sharing geometry and materials with the template).
   *
   * @returns Clone rig.
   */
  build(): PlayerCharacterRig;
}

/** The play-mode character model, loaded only when a remote player shows up. */
export const CHARACTER_COLLABORATION_MODEL_PLAYER: CharacterCollaborationModel = {
  ready: playerCharacterIsModelReady,
  load: () => playerCharacterEnsureModelLoaded(),
  build: () => playerCharacterBuildRig(),
};

/**
 * Plays a remote character's sound through the editor audio.
 *
 * @param kind Footstep, jump or landing.
 * @param x World X.
 * @param y World Y.
 * @param z World Z.
 * @param strength Planar speed for steps, fall speed for landings.
 */
const characterCollaborationSound: SoundCollaborationPresenceSink = (kind, x, y, z, strength) =>
  NotificationGlobal.onRemotePlayerSound(kind, x, y, z, strength);

/**
 * A remote member in play mode: a clone of the character tinted in their color
 * (own material copies, the shared template is never touched) with a name tag
 * above the head. It runs the same animation as the own character (walk, run,
 * idle, wall push, jump, fall, land) from the smoothed motion and the motion
 * flags, faces where the member's body faces, turns head, neck and back toward
 * where they look, and makes their footsteps, jumps and landings heard. All of
 * it costs nothing until a member enters play mode.
 */
export class CharacterCollaborationPresence implements PresenceCollaborationItem {
  readonly object: THREE.Group;
  private readonly body: THREE.Group;
  private readonly tag: NametagCollaborationPresence;
  private readonly pose: PoseCollaborationPresence;
  private readonly motion: BodyCollaborationPresence;
  private readonly animator: PlayerCharacterAnimator;
  private readonly sound: SoundCollaborationPresence;
  private readonly flags: { time: number; flags: number }[];
  private readonly lastTarget: THREE.Vector3;
  private rig: PlayerCharacterRig | null;
  private hasTarget: boolean;
  private teleported: boolean;
  private updated: number;
  private settleUntil: number;
  private clock: number;
  private lookYaw: number;
  private lookPitch: number;
  private bodyYaw: number;
  private readonly materials: THREE.Material[];
  private readonly color: number;
  private disposed: boolean;

  /**
   * Creates the character; the body appears once the model is loaded.
   *
   * @param name Display name.
   * @param color Member color.
   * @param model Character model source.
   * @param sound Receives footsteps, jumps and landings.
   */
  constructor(
    name: string,
    color: number,
    model: CharacterCollaborationModel,
    sound: SoundCollaborationPresenceSink = characterCollaborationSound,
  ) {
    this.object = new THREE.Group();
    this.object.name = `Presence character ${name}`;
    this.body = new THREE.Group();
    this.tag = new NametagCollaborationPresence(name, color, { world: 0.12, pixels: 8, base: this.body.position });
    this.pose = new PoseCollaborationPresence();
    this.motion = new BodyCollaborationPresence();
    this.sound = new SoundCollaborationPresence(sound);
    this.animator = new PlayerCharacterAnimator((x, y, z, speed) => this.sound.step(x, y, z, speed, this.clock));
    this.flags = [];
    this.lastTarget = new THREE.Vector3();
    this.rig = null;
    this.hasTarget = false;
    this.teleported = true;
    this.updated = Number.NaN;
    this.settleUntil = 0;
    this.clock = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.bodyYaw = 0;
    this.materials = [];
    this.color = color;
    this.disposed = false;
    this.object.add(this.body, this.tag.sprite);
    presenceCollaborationTag(this.object);
    this.bodyLoad(model);
  }

  /**
   * Sets the received feet position, facing, look and motion flags.
   *
   * @param entry Decoded entry.
   * @param now Current time in milliseconds.
   */
  target(entry: PresenceEntry, now: number): void {
    const position = new THREE.Vector3(...entry.position);
    if (!this.hasTarget || this.lastTarget.distanceTo(position) > POSE_COLLABORATION_PRESENCE_TELEPORT_METERS)
      this.teleported = true;
    this.hasTarget = true;
    this.lastTarget.copy(position);
    this.flags.push({ time: now, flags: entry.fov });
    if (this.flags.length > CHARACTER_COLLABORATION_PRESENCE_FLAGS_KEPT) this.flags.shift();
    this.pose.target(position, new THREE.Quaternion(...entry.quaternion), now);
    this.place();
  }

  /**
   * Advances interpolation, the animation and the sounds (driven by the
   * smoothed motion, so walking and turning follow the same path as the body).
   *
   * @param now Current time in milliseconds.
   * @returns True while still moving or the limbs are still settling.
   */
  update(now: number): boolean {
    const moving = this.pose.update(now);
    const delta = Number.isNaN(this.updated) ? 0 : Math.max(0, now - this.updated) / 1000;
    this.updated = now;
    this.clock = now;
    this.place();
    const motion = this.motionAt(now - INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS);
    if (this.teleported) {
      this.teleported = false;
      this.motion.reset();
      this.animator.reset();
      this.sound.teleport(now + INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS);
    }
    this.motion.update(this.pose.position, this.bodyYaw, motion, delta);
    const position = this.pose.position;
    this.sound.update(now, motion.grounded, position.x, position.y, position.z, this.motion.getRawVerticalVelocity());
    if (this.rig) {
      const step = Math.min(delta, CHARACTER_COLLABORATION_PRESENCE_STEP_SECONDS);
      this.animator.update(this.rig.root, this.motion, step);
      this.animator.pose(this.rig, this.motion, (rig) =>
        playerCharacterLookApply(rig, playerCharacterLookDistribute(this.lookYaw, this.lookPitch)),
      );
    }
    const active = moving || this.motion.getPlanarSpeed() > 0 || !motion.grounded || motion.wallPushing;
    if (active) this.settleUntil = now + CHARACTER_COLLABORATION_PRESENCE_SETTLE_MS;
    return active || now < this.settleUntil;
  }

  /**
   * Current animation state (idle, walk, run, wall push, jump, fall, land).
   *
   * @returns State id.
   */
  animation(): string {
    return this.animator.getState();
  }

  /**
   * Current look relative to the body, as shown.
   *
   * @returns Yaw and pitch in radians.
   */
  look(): { yaw: number; pitch: number } {
    return { yaw: this.lookYaw, pitch: this.lookPitch };
  }

  /** Frees the tinted materials and the tag; shared geometry stays. */
  dispose(): void {
    this.disposed = true;
    this.materials.splice(0).forEach((material) => material.dispose());
    this.body.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    });
    this.tag.dispose();
  }

  /**
   * Motion flags shown at a time: the newest received at or before it.
   *
   * @param time Render time in milliseconds.
   * @returns Motion state.
   */
  private motionAt(time: number): MotionCollaborationPresence {
    while (this.flags.length > 1 && (this.flags[1]?.time ?? Number.POSITIVE_INFINITY) <= time) this.flags.shift();
    return lookCollaborationPresenceMotion(this.flags[0]?.flags ?? 0);
  }

  /**
   * Places the body at the shown feet, turned to the shown body facing (the
   * look goes to the head, not the whole body), and the tag above it.
   */
  private place(): void {
    const look = lookCollaborationPresenceDecode(this.pose.quaternion);
    this.lookYaw = look.yaw;
    this.lookPitch = look.pitch;
    this.bodyYaw = look.bodyYaw;
    this.body.position.copy(this.pose.position);
    this.body.rotation.set(0, look.bodyYaw, 0);
    this.tag.anchor.copy(this.pose.position).setY(this.pose.position.y + CHARACTER_COLLABORATION_PRESENCE_TAG_HEIGHT);
    this.object.updateMatrixWorld(true);
  }

  /**
   * Adds the tinted clone now or after the model loads.
   *
   * @param model Character model source.
   */
  private bodyLoad(model: CharacterCollaborationModel): void {
    if (model.ready()) {
      this.bodyBuild(model);
      return;
    }
    model.load().then(
      () => this.bodyBuild(model),
      () => undefined,
    );
  }

  /**
   * Clones, tints and tags the character.
   *
   * @param model Character model source.
   */
  private bodyBuild(model: CharacterCollaborationModel): void {
    if (this.disposed || !model.ready()) return;
    const rig = model.build();
    this.materials.push(...characterCollaborationTint(rig.root, this.color));
    rig.root.traverse((child) => (child.frustumCulled = false));
    presenceCollaborationTag(rig.root);
    this.body.add(rig.root);
    this.rig = rig;
    this.animator.reset();
    this.place();
  }
}

/**
 * Replaces every material under a root with a copy tinted toward a color.
 *
 * @param root Clone root.
 * @param color Member color.
 * @returns The new materials, owned by the caller.
 */
export function characterCollaborationTint(root: THREE.Object3D, color: number): THREE.Material[] {
  const tint = new THREE.Color(color);
  const created: THREE.Material[] = [];
  const copy = (material: THREE.Material): THREE.Material => {
    const tinted = material.clone();
    const colored = tinted as THREE.Material & { color?: THREE.Color };
    if (colored.color instanceof THREE.Color) colored.color.lerp(tint, CHARACTER_COLLABORATION_PRESENCE_TINT);
    created.push(tinted);
    return tinted;
  };
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material) ? child.material.map(copy) : copy(child.material);
  });
  return created;
}
