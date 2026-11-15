import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidAlgorithmRoutingTableBuilder } from '@/solid/algorithm/routing/solid_algorithm_routing_table_builder.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds a prepared unit box at a world position.
 *
 * @param id Brush id.
 * @param operation CSG operation.
 * @param position World position.
 * @returns Prepared brush entry.
 */
function makePrepared(id: string, operation: SolidOperation, position: THREE.Vector3): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.copy(position);
  const modelBrush = instance.getModelSpaceBrush();
  return {
    instance,
    brush: modelBrush,
    bounds: modelBrush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation,
  };
}

/**
 * Links overlap peers by padded bounds intersection.
 *
 * @param prepared Prepared brushes to wire.
 */
function linkOverlaps(prepared: PreparedBrush[]): void {
  for (let index = 0; index < prepared.length; index++) {
    for (let peer = 0; peer < prepared.length; peer++) {
      if (index === peer) {
        continue;
      }
      if (prepared[index]!.bounds.clone().expandByScalar(0.001).intersectsBox(prepared[peer]!.bounds)) {
        prepared[index]!.overlappingPeerIndices.push(peer);
      }
    }
  }
}

/**
 * Regression for reference/subtractive-broken.json: a subtractive that only
 * overlaps another subtractive (not the additive solid) must not emit visible
 * SelfAligned hull polygons. The empty-stack fallback is AllOutside.
 */
describe('Floating subtractive after another subtractive', () => {
  it('routes a non-touching-solid subtractive to Outside (not AllSelfAligned)', () => {
    const prepared = [
      makePrepared('base', SolidOperation.Additive, new THREE.Vector3(0, 0, 0)),
      makePrepared('cut1', SolidOperation.Subtractive, new THREE.Vector3(0, 0.5, 0)),
      makePrepared('cut2', SolidOperation.Subtractive, new THREE.Vector3(0, 1.25, 0)),
    ];
    linkOverlaps(prepared);
    expect(prepared[2]!.overlappingPeerIndices).toEqual([1]);
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(
      prepared,
      2,
      prepared[2]!.overlappingPeerIndices,
      tree,
      false,
      false,
    );
    const category = table.route((preparedIndex) =>
      preparedIndex === 2 ? SurfaceCategory.SelfAligned : SurfaceCategory.Outside,
    );
    expect(category).toBe(SurfaceCategory.Outside);
  });

  it('emits no result polygons for a floating second subtractive', () => {
    const base = new SolidBrushInstance(
      'base',
      'base',
      SolidBrushFactory.createCenteredBox(1, 1, 1),
      SolidOperation.Additive,
    );
    const cut1 = new SolidBrushInstance(
      'cut1',
      'cut1',
      SolidBrushFactory.createCenteredBox(1, 1, 1),
      SolidOperation.Subtractive,
    );
    cut1.position.set(0, 0.5, 0);
    const cut2 = new SolidBrushInstance(
      'cut2',
      'cut2',
      SolidBrushFactory.createCenteredBox(1, 1, 1),
      SolidOperation.Subtractive,
    );
    cut2.position.set(0, 1.25, 0);
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile([base, cut1, cut2], { forceFull: true });
    const floating = polygons.filter((polygon) => polygon.brushId === 'cut2');
    expect(floating.length).toBe(0);
  });
});
