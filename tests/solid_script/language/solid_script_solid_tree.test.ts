import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptSolidTreeBuild,
  type SolidScriptSolidTreeOptions,
} from '@/solid_script/language/solid_script_solid_tree.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

const OPTIONS: SolidScriptSolidTreeOptions = {
  upAxis: 'z',
  offset: new THREE.Vector3(),
  worldToParent: new THREE.Matrix4(),
  operation: SolidOperation.Additive,
  namePrefix: '',
};

/**
 * Builds the tree of a program.
 *
 * @param source Solid script source.
 * @param options Option overrides.
 * @returns Nodes.
 */
function tree(source: string, options: Partial<SolidScriptSolidTreeOptions> = {}): SolidTreeNode[] {
  return solidScriptSolidTreeBuild(solidScriptProgramEvaluate(source).shapes, { ...OPTIONS, ...options });
}

/**
 * Summarizes nodes as name:operation strings, groups bracketed.
 *
 * @param nodes Nodes.
 * @returns Summary.
 */
function summary(nodes: SolidTreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'brush'
      ? `${node.name}:${node.operation}`
      : { [`${node.name}:${node.operation}`]: summary(node.children) },
  );
}

describe('solidScriptSolidTreeBuild', () => {
  it('maps difference to a group with a subtractive tail and flattens unions', () => {
    const nodes = tree('cube(1); difference() { cube(4); union() { cube(1); sphere(1); } }');
    expect(summary(nodes)).toEqual(['cube:0', { 'difference:0': ['cube:0', 'cube:1', 'sphere:1'] }]);
  });

  it('flattens chained differences and keeps intersecting unions grouped', () => {
    expect(summary(tree('difference() { difference() { cube(4); cube(1); } sphere(1); }'))).toEqual([
      { 'difference:0': ['cube:0', 'cube:1', 'sphere:1'] },
    ]);
    expect(summary(tree('intersection() { cube(4); union() { cube(1); sphere(1); } }'))).toEqual([
      { 'intersection:0': ['cube:0', { 'union:2': ['cube:0', 'sphere:0'] }] },
    ]);
  });

  it('converts Z-up to Y-up, adds the offset and centers brushes', () => {
    const [node] = tree('translate([0, 2, 0]) cube([1, 1, 3]);', {
      offset: new THREE.Vector3(10, 0, 0),
      operation: SolidOperation.Subtractive,
      namePrefix: 'Hall',
    });
    expect(node?.kind).toBe('brush');
    if (node?.kind !== 'brush') return;
    expect(node.center.toArray()).toEqual([10.5, 1.5, -2.5]);
    expect(node.operation).toBe(SolidOperation.Subtractive);
    expect(node.name).toBe('Hall cube');
  });

  it('rejects flat solids', () => {
    expect(() => tree('polyhedron([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]);')).toThrow(/flat or degenerate/);
  });
});
