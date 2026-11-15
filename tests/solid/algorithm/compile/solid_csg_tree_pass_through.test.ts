import { describe, it, expect } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgTree, type SolidCsgTreeNode } from '@/solid/algorithm/compile/solid_csg_tree.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
  layoutWithoutPassThrough,
  meshSignature,
  type PassThroughLayoutNode,
} from './solid_csg_pass_through_fixture.js';

const { Additive, Subtractive, Intersecting, PassThrough } = SolidOperation;

/**
 * Builds a wall with a subtractive window cutter and a pillar, all inside one
 * group with the given operation, after a wall outside the group.
 *
 * @param operation Operation of the group.
 * @returns Layout nodes.
 */
function layoutWindowInGroup(operation: SolidOperation): PassThroughLayoutNode[] {
  return [
    layoutBox([0, 0, 0], [6, 3, 0.5]),
    layoutGroup(operation, [layoutBox([0, 0, 0], [1.5, 1.5, 2], Subtractive), layoutBox([4, 0, 0], [1, 3, 1])]),
  ];
}

/**
 * Layouts whose pass-through groups must give the same mesh as their brushes
 * placed directly in the parent.
 *
 * @returns Named layouts.
 */
function passThroughLayouts(): Array<{ name: string; nodes: PassThroughLayoutNode[] }> {
  return [
    { name: 'leading subtractive cuts a sibling wall', nodes: layoutWindowInGroup(PassThrough) },
    {
      name: 'nested pass-through groups',
      nodes: [
        layoutBox([0, 0, 0], [6, 3, 3]),
        layoutGroup(PassThrough, [
          layoutBox([-2, 0, 0], [1, 1, 4], Subtractive),
          layoutGroup(PassThrough, [
            layoutBox([2, 0, 0], [1, 1, 4], Subtractive),
            layoutGroup(PassThrough, [layoutBox([2, 0, 0], [0.5, 0.5, 0.5])]),
          ]),
        ]),
        layoutBox([0, 2, 0], [2, 2, 2]),
      ],
    },
    {
      name: 'pass-through inside an additive group',
      nodes: [
        layoutBox([0, 0, 0], [6, 3, 3]),
        layoutGroup(Additive, [
          layoutBox([3, 0, 0], [3, 2, 2]),
          layoutGroup(PassThrough, [layoutBox([3, 0, 0], [1, 1, 4], Subtractive), layoutBox([5, 0, 0], [1, 1, 1])]),
        ]),
      ],
    },
    {
      name: 'pass-through inside a subtractive group with an intersecting child',
      nodes: [
        layoutBox([0, 0, 0], [6, 4, 4]),
        layoutGroup(Subtractive, [
          layoutBox([0, 0, 0], [3, 3, 6]),
          layoutGroup(PassThrough, [layoutBox([0.5, 0.5, 0], [2, 2, 6], Intersecting)]),
        ]),
      ],
    },
  ];
}

/**
 * Returns the operations of the tree nodes, nesting branches as arrays.
 *
 * @param nodes Tree nodes.
 * @returns Nested operation lists.
 */
function treeShape(nodes: readonly SolidCsgTreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === 'brush' ? node.operation : [node.operation, treeShape(node.children)]));
}

/**
 * Prepares the visible brushes of a model the way the compiler does.
 *
 * @param model Solid model.
 * @returns Prepared brushes in evaluation order.
 */
function preparedBrushes(model: SolidModel): PreparedBrush[] {
  return model.getBrushes().map((instance) => {
    const brush = instance.getModelSpaceBrush();
    return {
      instance,
      brush,
      bounds: brush.computeLocalBounds(),
      overlappingPeerIndices: [],
      operation: instance.operation,
    };
  });
}

/** Pass-through groups add no compound: their brushes combine as if ungrouped. */
describe('Solid CSG pass-through groups', () => {
  for (const layout of passThroughLayouts()) {
    it(`gives the same mesh as the ungrouped brushes: ${layout.name}`, () => {
      const grouped = meshSignature(layoutModelBuild('Grouped', layout.nodes).model);
      const flat = meshSignature(layoutModelBuild('Flat', layoutWithoutPassThrough(layout.nodes)).model);
      expect(grouped.triangles.length).toBeGreaterThan(0);
      expect(grouped.triangles).toEqual(flat.triangles);
      expect(grouped.volume).toBeCloseTo(flat.volume, 6);
      expect(grouped.area).toBeCloseTo(flat.area, 6);
    });
  }

  it('splices pass-through children into the parent tree, recursively', () => {
    const { model } = layoutModelBuild('Tree', passThroughLayouts()[1]!.nodes);
    const tree = SolidCsgTree.fromSceneGraph(model.root, preparedBrushes(model));
    expect(treeShape(tree.roots)).toEqual([Additive, Subtractive, Subtractive, Additive, Additive]);
    expect(tree.isFlat).toBe(true);
  });

  it('splices pass-through children into an enclosing additive compound', () => {
    const { model } = layoutModelBuild('TreeInAdditive', passThroughLayouts()[2]!.nodes);
    const tree = SolidCsgTree.fromSceneGraph(model.root, preparedBrushes(model));
    expect(treeShape(tree.roots)).toEqual([Additive, [Additive, [Additive, Subtractive, Additive]]]);
  });

  it('differs from an additive group whose leading subtractive brush cuts nothing', () => {
    const passThrough = meshSignature(layoutModelBuild('PassThroughWindow', layoutWindowInGroup(PassThrough)).model);
    const additive = meshSignature(layoutModelBuild('AdditiveWindow', layoutWindowInGroup(Additive)).model);
    const wallVolume = 6 * 3 * 0.5;
    const windowVolume = 1.5 * 1.5 * 0.5;
    const pillarBesideWall = 1 * 3 * 1;
    expect(additive.volume).toBeCloseTo(wallVolume + pillarBesideWall, 4);
    expect(passThrough.volume).toBeCloseTo(wallVolume - windowVolume + pillarBesideWall, 4);
  });
});
