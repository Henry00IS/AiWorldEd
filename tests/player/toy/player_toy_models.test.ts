import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHYSICS_TOY_SHAPES } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import type { PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import { PlayerToyHeld } from '@/player/toy/player_toy_held.js';
import { PLAYER_TOY_KINDS, playerToyGeometry, playerToyMesh } from '@/player/toy/player_toy_models.js';
import { PlayerToyViewModel } from '@/player/toy/player_toy_viewmodel.js';

/**
 * Builds a rig with only a right hand bone under a turned root.
 *
 * @returns Rig and hand.
 */
function handRig(): { rig: PlayerCharacterRig; hand: THREE.Bone } {
  const root = new THREE.Group();
  root.position.set(4, 0, 2);
  root.rotation.y = 1.1;
  const hand = new THREE.Bone();
  hand.position.set(-0.25, 0.85, 0.05);
  root.add(hand);
  const bones = new Map([[PLAYER_CHARACTER_BONE.handRight, hand]]);
  return { rig: { root, bones, restLocalQuaternions: new Map() }, hand };
}

describe('toy models', () => {
  it('matches each collision size and gives soccer balls and planes a white and a color part', () => {
    PLAYER_TOY_KINDS.forEach((kind) => {
      const geometry = playerToyGeometry(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox ?? new THREE.Box3();
      if (kind === 'plane') expect(box.min.y).toBeCloseTo(-PHYSICS_TOY_SHAPES.plane.radius, 5);
      else expect(box.max.y).toBeCloseTo(PHYSICS_TOY_SHAPES[kind].radius, 2);
    });
    expect(playerToyGeometry('soccer').groups.map((group) => group.materialIndex)).toEqual([0, 1]);
    expect(playerToyGeometry('soccer').groups[1]?.count).toBeGreaterThan(0);
    expect(playerToyGeometry('plane').groups).toHaveLength(2);
    const mesh = playerToyMesh('soccer', 0xff0000);
    expect((mesh.material as THREE.MeshStandardMaterial[])[1]?.color.getHex()).toBe(0xff0000);
    expect(new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)).toEqual(
      [],
    );
  });

  it('holds a toy at the right hand, facing the way the body faces, following the hand as it swings', () => {
    const { rig, hand } = handRig();
    const tagged: THREE.Object3D[] = [];
    const held = new PlayerToyHeld((object) => tagged.push(object));
    held.set(null, 'plane', 0x00ff00);
    expect(held.getMesh()).toBeNull();
    held.set(rig, 'plane', 0x00ff00);
    const mesh = held.getMesh();
    expect(mesh?.parent).toBe(rig.root);
    expect(tagged).toEqual([mesh]);
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    expect(mesh?.getWorldPosition(new THREE.Vector3()).distanceTo(wrist)).toBeLessThan(0.15);
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(
      mesh?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion(),
    );
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion);
    expect(nose.dot(facing)).toBeGreaterThan(0.9);
    hand.position.z += 0.3;
    held.update(rig);
    expect(
      mesh?.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3())),
    ).toBeLessThan(0.15);
    held.set(rig, 'tennis', 0x00ff00);
    expect(mesh?.parent).toBeNull();
    expect(held.getMesh()?.name).toBe('Tennis ball');
    held.clear();
    expect(rig.root.children).toEqual([hand]);
  });

  it('hides the first-person toy from the release until the refill and ignores clicks before the release', () => {
    const view = new PlayerToyViewModel(0x3366ff);
    view.setItem('plane', 0x3366ff);
    view.setItem('soccer', 0x3366ff);
    expect(view.getKind()).toBe('soccer');
    expect(view.root.parent).toBe(view.scene);
    view.update(10, 0.016, 0);
    expect(view.isItemShown()).toBe(true);
    expect(view.act(10, 'soccer')).toBe(true);
    expect(view.act(10.1, 'soccer')).toBe(false);
    expect(view.takeRelease(10.2)).toBeNull();
    view.update(10.2, 0.016, 0);
    expect(view.isItemShown()).toBe(true);
    expect(view.takeRelease(10.23)).toBe('soccer');
    expect(view.takeRelease(10.24)).toBeNull();
    view.update(10.3, 0.016, 0);
    expect(view.isItemShown()).toBe(false);
    view.update(10.41, 0.016, 0);
    expect(view.isItemShown()).toBe(true);
    expect(view.act(10.3, 'tennis')).toBe(true);
    expect(view.takeRelease(10.55)).toBe('tennis');
    view.dispose();
  });

  it('maps the toy in the hand to the world point the play camera shows at the same screen spot and depth', () => {
    const view = new PlayerToyViewModel(0x3366ff);
    view.setItem('tennis', 0x3366ff);
    view.update(1, 0.016, 0);
    const local = view.getRig().grip.getWorldPosition(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 100);
    camera.position.set(5, 2, -3);
    camera.rotation.set(-0.2, 0.8, 0, 'YXZ');
    const world = view.getHandWorld(camera, new THREE.Vector3());
    expect(world.clone().applyMatrix4(camera.matrixWorldInverse).toArray()).toEqual(
      local.toArray().map((value) => expect.closeTo(value, 5)),
    );
    camera.fov = 90;
    camera.updateProjectionMatrix();
    const wide = view.getHandWorld(camera, new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
    expect(wide.z).toBeCloseTo(local.z, 5);
    expect(Math.abs(wide.x)).toBeGreaterThan(Math.abs(local.x));
    view.dispose();
  });

  it('keeps the held plane level in view space through the throw', () => {
    const view = new PlayerToyViewModel(0x3366ff);
    view.setItem('plane', 0x3366ff);
    view.act(0, 'plane');
    const nose = (time: number): THREE.Vector3 => {
      view.update(time, 0.016, 0);
      view.root.updateMatrixWorld(true);
      const attitude = view.getRig().grip.getWorldQuaternion(new THREE.Quaternion());
      return new THREE.Vector3(0, 0, -1).applyQuaternion(attitude);
    };
    [0.01, 0.12, 0.19].forEach((time) => expect(nose(time).angleTo(nose(0.5))).toBeLessThan(1e-6));
    expect(nose(0.5).z).toBeLessThan(-0.9);
    view.dispose();
  });
});
