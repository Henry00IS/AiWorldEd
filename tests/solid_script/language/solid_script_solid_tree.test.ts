import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptSolidTreeBuild,
  type SolidScriptSolidTreeOptions,
} from '@/solid_script/language/solid_script_solid_tree.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const OPTIONS: SolidScriptSolidTreeOptions = {
  offset: new THREE.Vector3(),
  worldToParent: new THREE.Matrix4(),
  operation: SolidOperation.Additive,
  namePrefix: '',
};

/**
 * Builds the tree of script lines.
 *
 * @param lines Lines.
 * @param options Option overrides.
 * @returns Nodes.
 */
function tree(lines: SolidScriptLine[], options: Partial<SolidScriptSolidTreeOptions> = {}): SolidTreeNode[] {
  return solidScriptSolidTreeBuild(solidScriptProgramEvaluate(solidScriptDocumentCreate(lines)).shapes, {
    ...OPTIONS,
    ...options,
  });
}

/** Shorthands for lines. */
const CUBE: SolidScriptLine = { command: 'cube', values: { anchor: 'Center, Center, Center' } };
const SPHERE: SolidScriptLine = { command: 'sphere', values: { anchor: 'Center, Center, Center' } };
const END: SolidScriptLine = { command: 'end' };

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
    const nodes = tree([CUBE, { command: 'difference' }, CUBE, { command: 'union' }, CUBE, SPHERE, END, END]);
    expect(summary(nodes)).toEqual(['cube:0', { 'difference:0': ['cube:0', 'cube:1', 'sphere:1'] }]);
  });

  it('flattens chained differences and keeps intersecting unions grouped', () => {
    expect(summary(tree([{ command: 'difference' }, { command: 'difference' }, CUBE, CUBE, END, SPHERE, END]))).toEqual(
      [{ 'difference:0': ['cube:0', 'cube:1', 'sphere:1'] }],
    );
    expect(summary(tree([{ command: 'intersection' }, CUBE, { command: 'union' }, CUBE, SPHERE, END, END]))).toEqual([
      { 'intersection:0': ['cube:0', { 'union:2': ['cube:0', 'sphere:0'] }] },
    ]);
  });

  it('keeps the editor axes, adds the offset and centers brushes', () => {
    const [node] = tree(
      [
        { command: 'translate', values: { v: '0.5, 1.5, 2.5' } },
        { command: 'cube', values: { size: '1, 1, 3', anchor: 'Center, Center, Center' } },
        END,
      ],
      { offset: new THREE.Vector3(10, 0, 0), operation: SolidOperation.Subtractive, namePrefix: 'Hall' },
    );
    expect(node?.kind).toBe('brush');
    if (node?.kind !== 'brush') return;
    expect(node.center.toArray()).toEqual([10.5, 1.5, 2.5]);
    expect(node.operation).toBe(SolidOperation.Subtractive);
    expect(node.name).toBe('Hall cube');
  });

  it('rejects flat solids', () => {
    expect(() =>
      tree([{ command: 'polyhedron', values: { points: '[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]' } }, END]),
    ).toThrow(/flat|plane/);
  });

  it('carries the texture of a Texture block onto its brushes; an inner Texture wins', () => {
    const nodes = tree([
      { command: 'texture', values: { texture: 'stone' } },
      CUBE,
      { command: 'texture', values: { texture: 'wood' } },
      SPHERE,
      END,
      END,
      { command: 'translate', values: { v: '3, 0, 0' } },
      CUBE,
      END,
    ]);
    expect(nodes.map((node) => (node.kind === 'brush' ? node.texture : 'group'))).toEqual(['stone', 'wood', undefined]);
  });

  it('gives the faces Texture Faces picked their own texture, moved along with the brush', () => {
    const nodes = tree([
      { command: 'translate', values: { v: '3, 0, 1' } },
      { command: 'rotate', values: { a: '0, 0, 90' } },
      CUBE,
      { command: 'select_faces', values: { which: 'Facing Up' } },
      { command: 'texture_faces', values: { texture: 'grass' } },
      END,
      END,
    ]);
    const brush = nodes[0];
    if (brush?.kind !== 'brush') throw new Error('Expected a brush');
    const textured = brush.brush.faces.flatMap((_, index) =>
      brush.faceTextures?.[index] === 'grass' ? [brush.brush.planes[index]!.normal.y] : [],
    );
    expect(textured).toHaveLength(1);
    expect(textured[0]).toBeCloseTo(1, 5);
    expect(brush.texture).toBeUndefined();
  });
});
