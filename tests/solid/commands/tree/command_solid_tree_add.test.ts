import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { CommandSolidTreeAdd } from '@/solid/commands/tree/command_solid_tree_add.js';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box brush node.
 *
 * @param name Name.
 * @param operation Operation.
 * @param x Center X.
 * @returns Node.
 */
function box(name: string, operation: SolidOperation, x: number): SolidTreeNode {
  return {
    kind: 'brush',
    name,
    operation,
    brush: SolidBrushFactory.createCenteredBox(1, 1, 1),
    center: new THREE.Vector3(x, 0, 0),
  };
}

/**
 * Lists names under an object depth-first.
 *
 * @param root Object.
 * @returns Names.
 */
function names(root: THREE.Object3D): string[] {
  return root.children.flatMap((child) => [child.name, ...names(child)]);
}

describe('CommandSolidTreeAdd', () => {
  const tree: SolidTreeNode[] = [
    box('Floor', SolidOperation.Additive, 0),
    {
      kind: 'group',
      name: 'Wall',
      operation: SolidOperation.Additive,
      children: [box('Slab', SolidOperation.Additive, 2), box('Door', SolidOperation.Subtractive, 2)],
    },
  ];

  it('inserts groups and brushes in order and undoes and redoes as one step', () => {
    const model = new SolidModel('Tree');
    const command = new CommandSolidTreeAdd(model, tree);
    command.execute();
    const group = model.root.children.find((child) => child.name === 'Wall');
    expect(group && isSolidCsgGroup(group)).toBe(true);
    expect(group && getSolidGroupOperation(group)).toBe(SolidOperation.Additive);
    expect(model.getBrushes().map((brush) => brush.operation)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Additive,
      SolidOperation.Subtractive,
    ]);
    const before = names(model.root);
    command.undo();
    expect(model.getBrushes()).toHaveLength(0);
    expect(model.root.children.some((child) => child.name === 'Wall')).toBe(false);
    command.execute();
    expect(names(model.root)).toEqual(before);
    expect(command.getRootObjects()).toHaveLength(2);
  });

  it('gives every face of a brush its texture, and leaves brushes without one on the default', () => {
    const model = new SolidModel('Textures');
    new CommandSolidTreeAdd(model, [
      { ...(box('Brick', SolidOperation.Additive, 0) as SolidTreeBrush), texture: 'brick' },
      box('Plain', SolidOperation.Additive, 2),
    ]).execute();
    const [brick, plain] = model.getBrushes();
    const faces = (brush: typeof brick) => brush?.brush.faces.map((_, index) => brush.getSurfaceTextureId(index));
    expect(new Set(faces(brick))).toEqual(new Set(['brick']));
    expect(faces(plain)).not.toContain('brick');
  });

  it('gives single faces their own texture over the brush texture', () => {
    const model = new SolidModel('Face textures');
    const node = box('Brick', SolidOperation.Additive, 0) as SolidTreeBrush;
    new CommandSolidTreeAdd(model, [
      {
        ...node,
        texture: 'brick',
        faceTextures: node.brush.faces.map((_, index) => (index === 0 ? 'grass' : undefined)),
      },
    ]).execute();
    const [brush] = model.getBrushes();
    const faces = brush?.brush.faces.map((face) => brush.getSurfaceTextureId(face.surfaceIndex)) ?? [];
    expect(faces[0]).toBe('grass');
    expect(new Set(faces.slice(1))).toEqual(new Set(['brick']));
  });
});
