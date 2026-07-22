import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AlignCommand, ObjectAlignSnapshot } from '../../src/commands/align_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('AlignCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let snapshots: ObjectAlignSnapshot[];
  let targets: Map<THREE.Mesh, THREE.Vector3>;

  beforeEach(() => {
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

    snapshots = [
      { mesh: mesh1, originalPosition: mesh1.position.clone() },
      { mesh: mesh2, originalPosition: mesh2.position.clone() }
    ];

    targets = new Map([
      [mesh1, new THREE.Vector3(10, 20, 30)],
      [mesh2, new THREE.Vector3(40, 50, 60)]
    ]);
  });

  it('should execute and move objects to target positions', () => {
    const command = new AlignCommand(snapshots, targets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(30);
  });

  it('should undo and restore original positions', () => {
    const command = new AlignCommand(snapshots, targets);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should redo by executing again after undo', () => {
    const command = new AlignCommand(snapshots, targets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
  });

  it('should handle multiple objects independently', () => {
    const command = new AlignCommand(snapshots, targets);
    command.execute();
    expect(mesh2.position.x).toBeCloseTo(40);
    expect(mesh2.position.y).toBeCloseTo(50);
    expect(mesh2.position.z).toBeCloseTo(60);
    command.undo();
    expect(mesh2.position.x).toBeCloseTo(4);
    expect(mesh2.position.y).toBeCloseTo(5);
    expect(mesh2.position.z).toBeCloseTo(6);
  });

  it('should work with command stack for undo/redo', () => {
    const stack = new CommandStack(64);
    const command = new AlignCommand(snapshots, targets);
    stack.push(command);
    expect(mesh1.position.x).toBeCloseTo(10);
    stack.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    stack.redo();
    expect(mesh1.position.x).toBeCloseTo(10);
  });

  it('should be a no-op when target equals current position', () => {
    const sameTargets = new Map([
      [mesh1, mesh1.position.clone()],
      [mesh2, mesh2.position.clone()]
    ]);
    const command = new AlignCommand(snapshots, sameTargets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should align only X axis when target differs only on X', () => {
    const xOnlyTargets = new Map([
      [mesh1, new THREE.Vector3(10, 2, 3)],
      [mesh2, new THREE.Vector3(40, 5, 6)]
    ]);
    const command = new AlignCommand(snapshots, xOnlyTargets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should align only Y axis when target differs only on Y', () => {
    const yOnlyTargets = new Map([
      [mesh1, new THREE.Vector3(1, 20, 3)],
      [mesh2, new THREE.Vector3(4, 50, 6)]
    ]);
    const command = new AlignCommand(snapshots, yOnlyTargets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should align only Z axis when target differs only on Z', () => {
    const zOnlyTargets = new Map([
      [mesh1, new THREE.Vector3(1, 2, 30)],
      [mesh2, new THREE.Vector3(4, 5, 60)]
    ]);
    const command = new AlignCommand(snapshots, zOnlyTargets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(30);
  });

  it('should align all axes simultaneously', () => {
    const command = new AlignCommand(snapshots, targets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(30);
    expect(mesh2.position.x).toBeCloseTo(40);
    expect(mesh2.position.y).toBeCloseTo(50);
    expect(mesh2.position.z).toBeCloseTo(60);
  });

  it('should not modify axes not in the target map', () => {
    const partialTargets = new Map([
      [mesh1, new THREE.Vector3(10, 20, 30)]
    ]);
    const singleSnapshot = [
      { mesh: mesh1, originalPosition: mesh1.position.clone() }
    ];
    const command = new AlignCommand(singleSnapshot, partialTargets);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(30);
    expect(mesh2.position.x).toBeCloseTo(4);
    expect(mesh2.position.y).toBeCloseTo(5);
    expect(mesh2.position.z).toBeCloseTo(6);
  });

  it('should handle empty snapshot array gracefully', () => {
    const emptySnapshots: ObjectAlignSnapshot[] = [];
    const emptyTargets = new Map<THREE.Mesh, THREE.Vector3>();
    const command = new AlignCommand(emptySnapshots, emptyTargets);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh2.position.x).toBeCloseTo(4);
  });
});
