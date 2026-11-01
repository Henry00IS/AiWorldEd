import * as THREE from 'three';
import type { PresenceCollaborationItem } from '@/collaboration/presence/camera_collaboration_presence.js';
import { GaitCollaborationPresence } from '@/collaboration/presence/gait_collaboration_presence.js';
import { NametagCollaborationPresence } from '@/collaboration/presence/nametag_collaboration_presence.js';
import { PoseCollaborationPresence } from '@/collaboration/presence/pose_collaboration_presence.js';
import { presenceCollaborationTag } from '@/collaboration/presence/tag_collaboration_presence.js';
import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';
import { playerCharacterBuildRig } from '@/player/character/player_character_rig.js';
import {
  playerCharacterEnsureModelLoaded,
  playerCharacterIsModelReady,
} from '@/player/character/player_character_model_loader.js';

/** Height of the name tag anchor above the feet. */
const CHARACTER_COLLABORATION_PRESENCE_TAG_HEIGHT = 1.9;
/** How strongly the member color replaces the body color. */
const CHARACTER_COLLABORATION_PRESENCE_TINT = 0.6;

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
   * @returns Clone root.
   */
  build(): THREE.Object3D;
}

/** The play-mode character model, loaded only when a remote player shows up. */
export const CHARACTER_COLLABORATION_MODEL_PLAYER: CharacterCollaborationModel = {
  ready: playerCharacterIsModelReady,
  load: () => playerCharacterEnsureModelLoaded(),
  build: () => playerCharacterBuildRig().root,
};

/**
 * A remote member in play mode: a clone of the character tinted in their color
 * (own material copies, the shared template is never touched) with a name tag
 * above the head.
 */
export class CharacterCollaborationPresence implements PresenceCollaborationItem {
  readonly object: THREE.Group;
  private readonly body: THREE.Group;
  private readonly tag: NametagCollaborationPresence;
  private readonly pose: PoseCollaborationPresence;
  private readonly gait: GaitCollaborationPresence;
  private gaitUpdated: number;
  private readonly materials: THREE.Material[];
  private readonly color: number;
  private disposed: boolean;

  /**
   * Creates the character; the body appears once the model is loaded.
   *
   * @param name Display name.
   * @param color Member color.
   * @param model Character model source.
   */
  constructor(name: string, color: number, model: CharacterCollaborationModel) {
    this.object = new THREE.Group();
    this.object.name = `Presence character ${name}`;
    this.body = new THREE.Group();
    this.tag = new NametagCollaborationPresence(name, color, { world: 0.12, pixels: 8 });
    this.pose = new PoseCollaborationPresence();
    this.gait = new GaitCollaborationPresence();
    this.gaitUpdated = Number.NaN;
    this.materials = [];
    this.color = color;
    this.disposed = false;
    this.object.add(this.body, this.tag.sprite);
    presenceCollaborationTag(this.object);
    this.bodyLoad(model);
  }

  /**
   * Sets the received feet position and facing.
   *
   * @param entry Decoded entry.
   * @param now Current time in milliseconds.
   */
  target(entry: PresenceEntry, now: number): void {
    this.pose.target(new THREE.Vector3(...entry.position), new THREE.Quaternion(...entry.quaternion), now);
    this.apply();
  }

  /**
   * Advances interpolation and the walk cycle (driven by the smoothed motion,
   * so walking and turning follow the same path as the body).
   *
   * @param now Current time in milliseconds.
   * @returns True while still moving or the legs are still settling.
   */
  update(now: number): boolean {
    const moving = this.pose.update(now);
    this.apply();
    const delta = Number.isNaN(this.gaitUpdated) ? 0 : now - this.gaitUpdated;
    this.gaitUpdated = now;
    const walking = this.gait.update(this.pose.position, delta);
    return moving || walking;
  }

  /**
   * Current walk swing amplitude (0 standing, 1 full stride).
   *
   * @returns Amplitude.
   */
  walking(): number {
    return this.gait.amplitude();
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

  /** Copies the shown pose to the body and the tag anchor. */
  private apply(): void {
    this.body.position.copy(this.pose.position);
    this.body.quaternion.copy(this.pose.quaternion);
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
    const clone = model.build();
    this.materials.push(...characterCollaborationTint(clone, this.color));
    clone.traverse((child) => (child.frustumCulled = false));
    presenceCollaborationTag(clone);
    this.body.add(clone);
    this.gait.bind(clone);
    this.apply();
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
