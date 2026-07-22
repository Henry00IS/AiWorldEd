import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AlignmentController } from '../../src/managers/alignment_controller.js';
import { AlignmentAxis } from '../../src/types/alignment_axis.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('AlignmentController', () => {
  let controller: AlignmentController;
  let commandStack: CommandStack;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let targetMesh: THREE.Mesh;

  beforeEach(() => {
    controller = new AlignmentController();
    commandStack = new CommandStack(64);
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.position.set(1, 2, 3);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.position.set(4, 5, 6);
    targetMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    targetMesh.position.set(10, 10, 10);
  });

  describe('alignToOrigin', () => {
    it('should align all axes to origin', () => {
      controller.alignToOrigin([mesh1], AlignmentAxis.ALL, commandStack);
      expect(mesh1.position.x).toBeCloseTo(0);
      expect(mesh1.position.y).toBeCloseTo(0);
      expect(mesh1.position.z).toBeCloseTo(0);
    });

    it('should align only X axis to origin', () => {
      controller.alignToOrigin([mesh1], AlignmentAxis.X, commandStack);
      expect(mesh1.position.x).toBeCloseTo(0);
      expect(mesh1.position.y).toBeCloseTo(2);
      expect(mesh1.position.z).toBeCloseTo(3);
    });

    it('should align only Y axis to origin', () => {
      controller.alignToOrigin([mesh1], AlignmentAxis.Y, commandStack);
      expect(mesh1.position.x).toBeCloseTo(1);
      expect(mesh1.position.y).toBeCloseTo(0);
      expect(mesh1.position.z).toBeCloseTo(3);
    });

    it('should align only Z axis to origin', () => {
      controller.alignToOrigin([mesh1], AlignmentAxis.Z, commandStack);
      expect(mesh1.position.x).toBeCloseTo(1);
      expect(mesh1.position.y).toBeCloseTo(2);
      expect(mesh1.position.z).toBeCloseTo(0);
    });

    it('should undo origin alignment for all objects', () => {
      controller.alignToOrigin([mesh1, mesh2], AlignmentAxis.ALL, commandStack);
      expect(mesh1.position.x).toBeCloseTo(0);
      expect(mesh2.position.x).toBeCloseTo(0);
      commandStack.undo();
      expect(mesh1.position.x).toBeCloseTo(1);
      expect(mesh2.position.x).toBeCloseTo(4);
    });
  });

  describe('alignCenterToGrid', () => {
    it('should snap center to nearest grid cell with interval 1', () => {
      mesh1.position.set(1.6, 2.7, 3.8);
      controller.alignCenterToGrid([mesh1], AlignmentAxis.ALL, 1.0, commandStack);
      expect(mesh1.position.x).toBeCloseTo(2);
      expect(mesh1.position.y).toBeCloseTo(3);
      expect(mesh1.position.z).toBeCloseTo(4);
    });

    it('should snap center to nearest grid cell with interval 2', () => {
      mesh1.position.set(1, 2, 3);
      controller.alignCenterToGrid([mesh1], AlignmentAxis.ALL, 2.0, commandStack);
      expect(mesh1.position.x).toBeCloseTo(2);
      expect(mesh1.position.y).toBeCloseTo(2);
      expect(mesh1.position.z).toBeCloseTo(4);
    });

    it('should snap only X axis to grid', () => {
      mesh1.position.set(1.6, 2.7, 3.8);
      controller.alignCenterToGrid([mesh1], AlignmentAxis.X, 1.0, commandStack);
      expect(mesh1.position.x).toBeCloseTo(2);
      expect(mesh1.position.y).toBeCloseTo(2.7);
      expect(mesh1.position.z).toBeCloseTo(3.8);
    });

    it('should produce single command per operation', () => {
      controller.alignCenterToGrid([mesh1, mesh2], AlignmentAxis.ALL, 1.0, commandStack);
      expect(commandStack.getUndoCount()).toBe(1);
    });
  });

  describe('alignToObject', () => {
    it('should align source min to target min on all axes', () => {
      mesh1.position.set(5, 6, 7);
      targetMesh.position.set(10, 10, 10);
      controller.alignToObject([mesh1], targetMesh, AlignmentAxis.ALL, commandStack);
      const sourceBox = new THREE.Box3().setFromObject(mesh1);
      const targetBox = new THREE.Box3().setFromObject(targetMesh);
      expect(sourceBox.min.x).toBeCloseTo(targetBox.min.x);
      expect(sourceBox.min.y).toBeCloseTo(targetBox.min.y);
      expect(sourceBox.min.z).toBeCloseTo(targetBox.min.z);
    });

    it('should align source min to target min on X axis only', () => {
      mesh1.position.set(5, 6, 7);
      targetMesh.position.set(10, 10, 10);
      controller.alignToObject([mesh1], targetMesh, AlignmentAxis.X, commandStack);
      const sourceBox = new THREE.Box3().setFromObject(mesh1);
      const targetBox = new THREE.Box3().setFromObject(targetMesh);
      expect(sourceBox.min.x).toBeCloseTo(targetBox.min.x);
      expect(sourceBox.min.y).toBeCloseTo(5.5);
      expect(sourceBox.min.z).toBeCloseTo(6.5);
    });

    it('should align source center to target center on all axes', () => {
      mesh1.position.set(0, 0, 0);
      targetMesh.position.set(5, 5, 5);
      controller.alignToObject([mesh1], targetMesh, AlignmentAxis.ALL, commandStack);
      const sourceCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(mesh1).getCenter(sourceCenter);
      const targetCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(targetMesh).getCenter(targetCenter);
      expect(sourceCenter.x).toBeCloseTo(targetCenter.x);
      expect(sourceCenter.y).toBeCloseTo(targetCenter.y);
      expect(sourceCenter.z).toBeCloseTo(targetCenter.z);
    });
  });

  describe('axis cycling', () => {
    it('should cycle from ALL to X', () => {
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.ALL);
      controller.cycleAxisRestriction();
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.X);
    });

    it('should cycle through all axes in order', () => {
      controller.cycleAxisRestriction();
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.X);
      controller.cycleAxisRestriction();
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.Y);
      controller.cycleAxisRestriction();
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.Z);
      controller.cycleAxisRestriction();
      expect(controller.getAxisRestriction()).toBe(AlignmentAxis.ALL);
    });
  });

  describe('edge cases', () => {
    it('should be a no-op with empty selection for origin', () => {
      controller.alignToOrigin([], AlignmentAxis.ALL, commandStack);
      expect(commandStack.getUndoCount()).toBe(0);
    });

    it('should be a no-op with empty selection for grid', () => {
      controller.alignCenterToGrid([], AlignmentAxis.ALL, 1.0, commandStack);
      expect(commandStack.getUndoCount()).toBe(0);
    });

    it('should be a no-op with empty selection for to-object', () => {
      controller.alignToObject([], targetMesh, AlignmentAxis.ALL, commandStack);
      expect(commandStack.getUndoCount()).toBe(0);
    });
  });
});
