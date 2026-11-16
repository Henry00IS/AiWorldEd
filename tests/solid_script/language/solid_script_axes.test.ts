import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierStackSolidScriptLayout } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_layout.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptGeometryTags } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptExampleBlock, solidScriptExampleLine } from '@/solid_script/examples/solid_script_example_lines.js';

/**
 * Collects the world corners of brush nodes.
 *
 * @param nodes Nodes.
 * @param out Corners.
 * @returns Corners.
 */
function corners(nodes: readonly SolidTreeNode[], out: THREE.Vector3[] = []): THREE.Vector3[] {
  for (const node of nodes)
    if (node.kind === 'group') corners(node.children, out);
    else for (const vertex of node.brush.vertices) out.push(vertex.clone().add(node.center));
  return out;
}

/**
 * Builds script lines in a generator box 4 wide, 1 tall and 2 deep, and returns
 * the bounds of the result in editor space.
 *
 * @param lines Lines.
 * @returns Bounds, rounded.
 */
function bounds(lines: SolidScriptLine[]): { min: number[]; max: number[] } {
  const box = new THREE.Box3(new THREE.Vector3(-2, -0.5, -1), new THREE.Vector3(2, 0.5, 1));
  const layout = modifierStackSolidScriptLayout(
    solidScriptDocumentCreate(lines),
    'origin',
    box,
    SolidOperation.Additive,
    undefined,
  );
  expect(layout.error).toBe('');
  const result = new THREE.Box3().setFromPoints(corners(layout.nodes));
  const round = (vector: THREE.Vector3): number[] => vector.toArray().map((value) => Math.round(value * 1e4) / 1e4 + 0);
  return { min: round(result.min), max: round(result.max) };
}

describe('SolidScript axes', () => {
  it('uses the editor axes: X right, Y up, Z toward the front', () => {
    expect(bounds([solidScriptExampleLine('cube', { size: '1, 2, 3', center: 'true' })])).toEqual({
      min: [-0.5, -1, -1.5],
      max: [0.5, 1, 1.5],
    });
    const raised = solidScriptExampleBlock('translate', { v: '0, 5, 0' }, [
      solidScriptExampleLine('cube', { center: 'false' }),
    ]);
    expect(bounds(raised)).toEqual({ min: [0, 5, 0], max: [1, 6, 1] });
  });

  it('stands cylinders and extrusions up along Y', () => {
    const cylinder = bounds([
      solidScriptExampleLine('cylinder', { h: '3', r1: '0.5', r2: '0.5', sides: '4', center: 'false' }),
    ]);
    expect([cylinder.min[1], cylinder.max[1]]).toEqual([0, 3]);
    const extruded = solidScriptExampleBlock('linear_extrude', { height: '3', center: 'false' }, [
      solidScriptExampleLine('square', { size: '1, 2', center: 'false' }),
    ]);
    expect(bounds(extruded)).toEqual({ min: [0, 0, -2], max: [1, 3, 0] });
  });

  it('gives the box as width (X), height (Y) and depth (Z)', () => {
    expect(bounds([solidScriptExampleLine('cube', { size: '[Box.Size]', center: 'true' })])).toEqual({
      min: [-2, -0.5, -1],
      max: [2, 0.5, 1],
    });
    expect(
      bounds([solidScriptExampleLine('cube', { size: '[Box.Width], [Box.Height], [Box.Depth]', center: 'true' })]),
    ).toEqual({ min: [-2, -0.5, -1], max: [2, 0.5, 1] });
  });

  it('calls faces pointing up +Y the top', () => {
    expect(solidScriptGeometryTags(new THREE.Vector3(0, 1, 0), undefined)).toEqual(['Top']);
    expect(solidScriptGeometryTags(new THREE.Vector3(0, 0, 1), undefined)).toEqual(['Side']);
  });
});
