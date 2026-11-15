import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  modifierStackBuiltTreeBuild,
  type ModifierStackBuiltNode,
} from '@/modifier/stack/scope/modifier_stack_built_tree.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
} from '../../../solid/algorithm/compile/solid_csg_pass_through_fixture.js';

/**
 * Returns the operations of built tree nodes, nesting branches as arrays.
 *
 * @param nodes Built tree nodes.
 * @returns Nested operation lists.
 */
function builtShape(nodes: readonly ModifierStackBuiltNode[]): unknown[] {
  return nodes.map((node) => (node.kind === 'leaf' ? node.operation : [node.operation, builtShape(node.children)]));
}

/** The modifier scope tree splices pass-through groups like the compiler. */
describe('modifierStackBuiltTreeBuild pass-through groups', () => {
  it('puts the children of nested pass-through groups in the parent list in order', () => {
    const { model } = layoutModelBuild('Scope', [
      layoutBox([0, 0, 0], [6, 3, 3]),
      layoutGroup(SolidOperation.PassThrough, [
        layoutBox([0, 0, 0], [1, 1, 4], SolidOperation.Subtractive),
        layoutGroup(SolidOperation.Additive, [
          layoutBox([2, 0, 0], [1, 1, 1]),
          layoutGroup(SolidOperation.PassThrough, [layoutBox([2, 0, 0], [0.5, 0.5, 2], SolidOperation.Subtractive)]),
        ]),
      ]),
    ]);
    model.root.updateMatrixWorld(true);
    const tree = modifierStackBuiltTreeBuild(model.root.children, {
      authored: new Map(model.getBrushes().map((brush) => [brush.id, brush])),
      generators: new Map(),
      solidToWorld: model.root.matrixWorld,
      volume: new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)),
    });
    expect(builtShape(tree)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Subtractive,
      [SolidOperation.Additive, [SolidOperation.Additive, SolidOperation.Subtractive]],
    ]);
  });
});
