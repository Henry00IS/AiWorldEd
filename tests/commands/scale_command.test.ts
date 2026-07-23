import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ScaleCommand, ObjectScaleSnapshot } from '../../src/commands/scale_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GizmoAxis } from '../../src/types/transform_mode.js';

describe('ScaleCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let snapshots: ObjectScaleSnapshot[];
  let pivot: THREE.Vector3;
  let axis: THREE.Vector3;
  let factor: number;

  beforeEach(() => {
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.position.set(2, 0, 0);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.position.set(0, 3, 0);
    snapshots = [
      {
        object: mesh1,
        originalPosition: mesh1.position.clone(),
        originalScale: mesh1.scale.clone()
      },
      {
        object: mesh2,
        originalPosition: mesh2.position.clone(),
        originalScale: mesh2.scale.clone()
      }
    ];
    pivot = new THREE.Vector3(0, 0, 0);
    axis = new THREE.Vector3(1, 0, 0);
    factor = 2;
  });

  it('should execute and apply scale relative to pivot', () => {
    const command = new ScaleCommand(snapshots, pivot, axis, factor);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(4);
    expect(mesh1.position.y).toBeCloseTo(0);
  });

  it('should scale mesh.scale along the active axis', () => {
    const command = new ScaleCommand(snapshots, pivot, axis, factor);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(2);
    expect(mesh1.scale.y).toBeCloseTo(1);
    expect(mesh1.scale.z).toBeCloseTo(1);
  });

  it('should undo and restore original positions and scales', () => {
    const command = new ScaleCommand(snapshots, pivot, axis, factor);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(2);
    expect(mesh1.position.y).toBeCloseTo(0);
    expect(mesh2.position.x).toBeCloseTo(0);
    expect(mesh2.position.y).toBeCloseTo(3);
    expect(mesh1.scale.x).toBeCloseTo(1);
  });

  it('should redo by executing again after undo', () => {
    const command = new ScaleCommand(snapshots, pivot, axis, factor);
    command.execute();
    command.undo();
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(4);
    expect(mesh1.scale.x).toBeCloseTo(2);
  });

  it('should handle per-axis scaling along Y axis', () => {
    const ySnapshots: ObjectScaleSnapshot[] = [
      {
        object: mesh2,
        originalPosition: mesh2.position.clone(),
        originalScale: mesh2.scale.clone()
      }
    ];
    const yAxis = new THREE.Vector3(0, 1, 0);
    const command = new ScaleCommand(
      ySnapshots,
      pivot,
      yAxis,
      3,
      GizmoAxis.Y
    );
    command.execute();
    expect(mesh2.position.y).toBeCloseTo(9);
    expect(mesh2.scale.y).toBeCloseTo(3);
    command.undo();
    expect(mesh2.position.y).toBeCloseTo(3);
    expect(mesh2.scale.y).toBeCloseTo(1);
  });

  it('should handle scale factor of 1 as no-op', () => {
    const identityFactor = 1;
    const command = new ScaleCommand(snapshots, pivot, axis, identityFactor);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(2);
    expect(mesh1.position.y).toBeCloseTo(0);
    expect(mesh1.scale.x).toBeCloseTo(1);
  });

  it('should work with command stack for undo/redo', () => {
    const stack = new CommandStack(64);
    const command = new ScaleCommand(snapshots, pivot, axis, factor);
    stack.push(command);
    expect(mesh1.position.x).toBeCloseTo(4);
    stack.undo();
    expect(mesh1.position.x).toBeCloseTo(2);
    stack.redo();
    expect(mesh1.position.x).toBeCloseTo(4);
  });
});
