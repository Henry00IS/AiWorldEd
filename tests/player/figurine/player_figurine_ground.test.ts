import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerFigurineGroundHit } from '@/player/figurine/player_figurine_ground.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box mesh with its top at a height.
 *
 * @param top Top height.
 * @returns Mesh.
 */
function slab(top: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4));
  mesh.position.set(0, top - 0.5, 0);
  return mesh;
}

/**
 * Builds an inverted-world solid with one subtractive room centered on the
 * origin.
 *
 * @param width Room size along X.
 * @param height Room size along Y.
 * @param depth Room size along Z.
 * @returns Compiled solid model.
 */
function createInvertedRoom(width: number, height: number, depth: number): SolidModel {
  const model = new SolidModel('InvertedFigurineRoom');
  const instance = new SolidBrushInstance(
    'room',
    'Room',
    SolidBrushFactory.createCenteredBox(width, height, depth),
    SolidOperation.Subtractive,
  );
  model.addBrushInstance(instance);
  model.setInvertedWorld(true);
  model.root.updateMatrixWorld(true);
  return model;
}

describe('playerFigurineGroundHit', () => {
  it('hits the visible collidable level without any physics, skipping figurines and hidden meshes', () => {
    const root = new THREE.Group();
    const figurine = slab(3);
    figurine.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
    const hidden = slab(2);
    hidden.visible = false;
    root.add(slab(1), figurine, hidden);
    root.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    const down = new THREE.Ray(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(root, down, target)).toBe(true);
    expect(target.y).toBeCloseTo(1, 6);
    const away = new THREE.Ray(new THREE.Vector3(50, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(root, away, target)).toBe(false);
  });

  it('lands on the interior floor when dropped from above an inverted-world room', () => {
    const roomHeight = 3;
    const floorY = -roomHeight * 0.5;
    const ceilingY = roomHeight * 0.5;
    const model = createInvertedRoom(6, roomHeight, 5);
    const root = new THREE.Group();
    root.add(model.root);
    root.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    const fromAbove = new THREE.Ray(new THREE.Vector3(0, ceilingY + 4, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(root, fromAbove, target)).toBe(true);
    expect(target.y).toBeCloseTo(floorY, 4);
    expect(target.y).toBeLessThan(ceilingY);
  });

  it('still lands on the top of an ordinary additive block', () => {
    const model = new SolidModel('AdditiveBlock');
    const blockSize = 2;
    model.addBoxBrush(blockSize, SolidOperation.Additive);
    const root = new THREE.Group();
    root.add(model.root);
    root.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    const fromAbove = new THREE.Ray(new THREE.Vector3(0, blockSize, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(root, fromAbove, target)).toBe(true);
    expect(target.y).toBeCloseTo(blockSize * 0.5, 4);
  });
});
