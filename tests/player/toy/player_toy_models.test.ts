import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHYSICS_TOY_SHAPES } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import type { PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import { PlayerToyHeld } from '@/player/toy/player_toy_held.js';
import { PLAYER_TOY_KINDS, playerToyGeometry, playerToyMesh } from '@/player/toy/player_toy_models.js';
import { PlayerToyViewModel, playerToyViewSwing } from '@/player/toy/player_toy_viewmodel.js';

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

  it('swings the first-person hand out and back on a throw and refills it afterwards', () => {
    expect(playerToyViewSwing(-1)).toBe(0);
    expect(playerToyViewSwing(0.1)).toBeCloseTo(1, 5);
    expect(playerToyViewSwing(0.45)).toBe(0);
    const tagged = new Set<THREE.Object3D>();
    const view = new PlayerToyViewModel(0x3366ff, (object) => object.traverse((child) => tagged.add(child)));
    view.setItem('soccer', 0x3366ff);
    view.setItem('plane', 0x3366ff);
    view.root.traverse((child) => expect(tagged.has(child)).toBe(true));
    view.setItem('soccer', 0x3366ff);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    view.update(camera, 10, 0.016, 0);
    expect(view.isItemShown()).toBe(true);
    expect(view.root.position.toArray()).toEqual([1, 2, 3]);
    view.act(10, true);
    view.update(camera, 10.05, 0.016, 0);
    expect(view.isItemShown()).toBe(false);
    view.update(camera, 10.5, 0.016, 0);
    expect(view.isItemShown()).toBe(true);
    expect(view.getKind()).toBe('soccer');
    view.dispose();
  });
});
