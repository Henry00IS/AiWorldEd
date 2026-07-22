import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ToggleVisibilityCommand } from '../../src/commands/toggle_visibility_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('ToggleVisibilityCommand', () => {
  let mesh: THREE.Mesh;

  beforeEach(() => {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TestMesh';
  });

  it('should execute and hide a visible object', () => {
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should execute and show a hidden object', () => {
    mesh.visible = false;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    expect(mesh.visible).toBe(true);
  });

  it('should undo and restore previous visibility state', () => {
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    command.undo();
    expect(mesh.visible).toBe(true);
  });

  it('should undo restoring hidden state', () => {
    mesh.visible = false;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    command.undo();
    expect(mesh.visible).toBe(false);
  });

  it('should redo and re-apply the visibility toggle', () => {
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    command.undo();
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    stack.push(command);
    expect(mesh.visible).toBe(false);
    stack.undo();
    expect(mesh.visible).toBe(true);
    stack.redo();
    expect(mesh.visible).toBe(false);
  });

  it('should handle toggling visibility on a group', () => {
    const group = new THREE.Group();
    group.name = 'TestGroup';
    group.visible = false;
    const command = new ToggleVisibilityCommand(group);
    command.execute();
    expect(group.visible).toBe(true);
    command.undo();
    expect(group.visible).toBe(false);
  });

  it('should return correct new visibility via getNewVisibility', () => {
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    expect(command.getNewVisibility()).toBe(false);
  });

  it('should return correct new visibility for hidden object', () => {
    mesh.visible = false;
    const command = new ToggleVisibilityCommand(mesh);
    expect(command.getNewVisibility()).toBe(true);
  });

  it('should not execute twice', () => {
    mesh.visible = true;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should preserve identity of the object', () => {
    const originalUuid = mesh.uuid;
    const command = new ToggleVisibilityCommand(mesh);
    command.execute();
    expect(mesh.uuid).toBe(originalUuid);
  });
});
