import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandMeshClip } from '@/tools/clip_plane/commands/command_mesh_clip.js';
import { CommandMeshSplit } from '@/tools/clip_plane/commands/command_mesh_split.js';

/** Mesh replacements retain hierarchy position during execute, undo, and redo. */
describe('clip mesh placement', () => {
  it('places multiple prebuilt split commands beside their own source', () => {
    const world = new THREE.Group();
    const sources = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    world.add(...sources);
    const pieces = sources.map(() => [new THREE.Mesh(), new THREE.Mesh()] as const);
    const commands = sources.map((source, index) => {
      const pair = pieces[index];
      if (!pair) throw new Error('missing split results');
      return new CommandMeshSplit(source, pair[0], pair[1], world);
    });
    for (let pass = 0; pass < 2; pass++) {
      commands.forEach((command) => command.execute());
      expect(world.children).toEqual(pieces.flat());
      [...commands].reverse().forEach((command) => command.undo());
      expect(world.children).toEqual(sources);
    }
  });

  it.each([false, true])('replaces the source slot instead of appending (%s)', (split) => {
    const world = new THREE.Group();
    const parent = new THREE.Group();
    world.add(parent);
    const source = new THREE.Mesh();
    const tail = new THREE.Mesh();
    const front = new THREE.Mesh();
    const back = new THREE.Mesh();
    parent.add(source, tail);
    const command = split
      ? new CommandMeshSplit(source, front, back, world)
      : new CommandMeshClip(source, front, world);
    for (let pass = 0; pass < 2; pass++) {
      command.execute();
      expect(parent.children).toEqual(split ? [front, back, tail] : [front, tail]);
      command.undo();
      expect(parent.children).toEqual([source, tail]);
    }
  });
});
