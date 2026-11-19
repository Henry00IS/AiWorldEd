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
    expect(bounds([solidScriptExampleLine('cube', { size: '1, 2, 3', anchor: 'Center, Center, Center' })])).toEqual({
      min: [-0.5, -1, -1.5],
      max: [0.5, 1, 1.5],
    });
    const raised = solidScriptExampleBlock('transform', { move: '0, 5, 0' }, [
      solidScriptExampleLine('cube', { anchor: 'Left, Bottom, Back' }),
    ]);
    expect(bounds(raised)).toEqual({ min: [0, 5, 0], max: [1, 6, 1] });
  });

  it('stands cylinders and extrusions up along Y', () => {
    const cylinder = bounds([
      solidScriptExampleLine('cylinder', {
        h: '3',
        r1: '0.5',
        r2: '0.5',
        sides: '4',
        anchor: 'Center, Bottom, Center',
      }),
    ]);
    expect([cylinder.min[1], cylinder.max[1]]).toEqual([0, 3]);
    const extruded = solidScriptExampleBlock('linear_extrude', { height: '3', anchor: 'Bottom' }, [
      solidScriptExampleLine('square', { size: '1, 2', anchor: 'Left, Front' }),
    ]);
    expect(bounds(extruded)).toEqual({ min: [0, 0, -2], max: [1, 3, 0] });
  });

  it('puts the spot the Anchor names on the origin, for every shape', () => {
    const cube = (anchor: string) => bounds([solidScriptExampleLine('cube', { size: '2, 2, 2', anchor })]);
    expect(cube('Center, Center, Center')).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
    expect(cube('Center, Bottom, Back')).toEqual({ min: [-1, 0, 0], max: [1, 2, 2] });
    expect(cube('Right, Top, Front')).toEqual({ min: [-2, -2, -2], max: [0, 0, 0] });
    expect(cube('left, bottom, back')).toEqual({ min: [0, 0, 0], max: [2, 2, 2] });
    expect(bounds([solidScriptExampleLine('sphere', { r: '1', anchor: 'Center, Bottom, Center' })]).min[1]).toBe(0);
    const cylinder = bounds([
      solidScriptExampleLine('cylinder', { h: '2', r1: '1', r2: '0.5', sides: '4', anchor: 'Left, Top, Back' }),
    ]);
    // Round shapes anchor on the box of their radius, so the axis sits one radius in.
    const middle = (range: { min: number[]; max: number[] }, axis: number) => (range.min[axis]! + range.max[axis]!) / 2;
    expect([middle(cylinder, 0), cylinder.max[1], middle(cylinder, 2)]).toEqual([1, 0, 1]);
    const cone = bounds([
      solidScriptExampleLine('cylinder', { h: '2', r1: '0.5', r2: '1', sides: '4', anchor: 'Center, Top, Center' }),
    ]);
    expect([cone.min[1], cone.max[1]]).toEqual([-2, 0]);
    const circle = bounds(
      solidScriptExampleBlock('linear_extrude', { height: '1', anchor: 'Top' }, [
        solidScriptExampleLine('circle', { r: '1', sides: '4', anchor: 'Left, Back' }),
      ]),
    );
    expect([middle(circle, 0), circle.max[1], middle(circle, 2)]).toEqual([1, 0, 1]);
    expect(
      bounds([solidScriptExampleLine('stairs', { size: '2, 2, 2', anchor: 'Center, Bottom, Center' })]).min[1],
    ).toBe(0);
  });

  it('gives the box as width (X), height (Y) and depth (Z)', () => {
    expect(bounds([solidScriptExampleLine('cube', { size: '[$Box.Size]', anchor: 'Center, Center, Center' })])).toEqual(
      {
        min: [-2, -0.5, -1],
        max: [2, 0.5, 1],
      },
    );
    expect(
      bounds([
        solidScriptExampleLine('cube', {
          size: '[$Box.Width], [$Box.Height], [$Box.Depth]',
          anchor: 'Center, Center, Center',
        }),
      ]),
    ).toEqual({
      min: [-2, -0.5, -1],
      max: [2, 0.5, 1],
    });
  });

  it('calls faces pointing up +Y the top', () => {
    expect(solidScriptGeometryTags(new THREE.Vector3(0, 1, 0), undefined)).toEqual(['Top']);
    expect(solidScriptGeometryTags(new THREE.Vector3(0, 0, 1), undefined)).toEqual(['Side']);
  });
});
