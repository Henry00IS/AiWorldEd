import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/**
 * Compiles a SolidScript modifier on a 1 m box.
 *
 * @param lines Script lines.
 * @returns Visible output brushes, first is the source when it was passed on.
 */
function compile(lines: SolidScriptLine[]): SolidBrushInstance[] {
  const world = new THREE.Group();
  const model = new SolidModel('UV policy');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const mesh = source.mesh as THREE.Mesh;
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Both'), {
    generator: true,
    modifier: true,
  });
  modifierStackOwnerDecode(mesh, { modifiers: [entry] });
  world.updateMatrixWorld(true);
  return modifierStackCompile(model.getBrushes(), model.root).instances.filter(
    (brush) => brush.constructor.name !== 'ModifierStackHiddenBrush',
  );
}

/**
 * Rounded U and V translations of every face, in face order.
 *
 * @param brush Brush.
 * @returns Pairs.
 */
function shifts(brush: SolidBrushInstance): [number, number][] {
  return brush.brush.faces.map((_, index) => {
    const uv = brush.getFaceSurface(index).uv;
    return [Math.round(uv.u.w * 1e4) / 1e4 + 0, Math.round(uv.v.w * 1e4) / 1e4 + 0];
  });
}

/**
 * Bounds of a brush as six rounded metres.
 *
 * @param brush Brush.
 * @returns Min then max.
 */
function bounds(brush: SolidBrushInstance): number[] {
  const box = brush.getModelSpaceBounds();
  return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map(
    (value) => Math.round(value * 1e4) / 1e4 + 0,
  );
}

/**
 * Three copies two metres apart, each written Into [Copy], given a Transform
 * UVs Offset and output.
 *
 * @param offset Transform UVs Offset; [I] is the copy index.
 * @param textures Transform UVs Textures.
 * @returns Lines.
 */
function copies(offset: string, textures = 'Move With Shape'): SolidScriptLine[] {
  return [
    { command: 'repeat', values: { variable: 'I', from: '0', to: '3' } },
    { command: 'transform', values: { move: '[=[I] * 2], 0, 0' } },
    { command: 'input_brushes', values: { into: 'Copy' } },
    { command: 'end' },
    { command: 'transform_uvs', values: { offset, textures, of: '[Copy]' } },
    { command: 'output', values: { of: '[Copy]' } },
    { command: 'end' },
  ];
}

describe('SolidScript Input Brushes and Transform UVs share texture policy', () => {
  it('keeps solids, bounds and UVs the same for a default Input Brushes pass', () => {
    const shown = compile([{ command: 'input_brushes' }]);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.brush.faces).toHaveLength(6);
    expect(bounds(shown[0]!)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
  });

  it('shifts each copy by the Transform UVs Offset of its pass', () => {
    const plain = compile(copies('0, 0, 0'));
    const shifted = compile(copies('[=[I]], 0.25, 0'));
    expect(shifted).toHaveLength(3);
    expect(shifted.map(bounds)).toEqual(plain.map(bounds));
    expect(shifts(shifted[0]!)).toEqual(shifts(plain[0]!));
    for (const index of [1, 2])
      expect(shifts(shifted[index]!)).toEqual(shifts(plain[index]!).map(([u, v]) => [u + index, v + 0.25]));
  });

  it('keeps a huge Transform UVs Offset on a World Aligned copy', () => {
    const plain = compile(copies('0, 0, 0', 'World Aligned'));
    const shifted = compile(copies('1000000, -1000000, 0', 'World Aligned'));
    expect(shifted).toHaveLength(3);
    expect(shifted.map(bounds)).toEqual(plain.map(bounds));
    expect(shifts(shifted[1]!)).toEqual(shifts(plain[1]!).map(([u, v]) => [u + 1000000, v - 1000000]));
  });

  it('ignores Readable Text and UV Shift values an old script stored on Input Brushes', () => {
    const stale = compile([
      { command: 'repeat', values: { variable: 'I', from: '0', to: '3' } },
      { command: 'transform', values: { move: '[=[I] * 2], 0, 0' } },
      { command: 'input_brushes', values: { readable: 'No', uv_shift_u: '[=[I]]', uv_shift_v: '0.25' } },
      { command: 'end' },
      { command: 'end' },
    ]);
    const plain = compile(copies('0, 0, 0'));
    expect(stale.map(bounds)).toEqual(plain.map(bounds));
    expect(stale.map(shifts)).toEqual(plain.map(shifts));
  });
});
