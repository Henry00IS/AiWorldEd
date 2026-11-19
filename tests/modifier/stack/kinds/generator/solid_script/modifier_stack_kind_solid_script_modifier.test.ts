import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackOwnerDecode, modifierStackOwnerEncode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
} from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackSolidScriptRunStart } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_received.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Builds a solid with one box brush whose own stack holds a SolidScript
 * modifier.
 *
 * @param script Script to run, or undefined for the starting one.
 * @returns Fixture parts and a compile helper.
 */
function modifierFixture(script?: unknown) {
  const world = new THREE.Group();
  const model = new SolidModel('Script modifier test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const mesh = source.mesh as THREE.Mesh;
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  if (script !== undefined) entry.parameters['script'] = script;
  modifierStackOwnerDecode(mesh, { modifiers: [entry] });
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { model, source, mesh, compile };
}

/**
 * A script that may be used both ways.
 *
 * @param lines Lines.
 * @returns Script.
 */
function both(...lines: SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Both'), { generator: true, modifier: true });
}

describe('SolidScript as a modifier', () => {
  it('is offered on brushes and groups, unlike the generator', () => {
    const fixture = modifierFixture();
    expect(modifierStackOwnerEncode(fixture.mesh)?.modifiers.map((entry) => entry.kind)).toEqual([
      MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
    ]);
    expect(modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND)?.category).toBe('shape');
    expect(modifierStackKindFind('solidScript')?.category).toBe('generate');
  });

  it('passes the brush on and adds the Pedestal slab under it, sized from Input.Size', () => {
    const fixture = modifierFixture();
    const result = fixture.compile();
    expect(modifierStackStatusRead(fixture.mesh)?.steps?.[0]?.error ?? '').toBe('');
    expect(result.instances).toHaveLength(2);
    const box = result.instances[0]!.getModelSpaceBounds();
    const slab = result.instances[1]!.getModelSpaceBounds();
    const width = box.max.x - box.min.x;
    expect(slab.max.x - slab.min.x).toBeCloseTo(width + 0.4, 4);
    expect(slab.max.y).toBeCloseTo(box.min.y, 4);
    expect(slab.min.y).toBeCloseTo(box.min.y - 0.2, 4);
  });

  it('gives Script.Usage and Input.Brushes, and Input Brushes copies what it receives', () => {
    const fixture = modifierFixture(
      both(
        { command: 'input_brushes' },
        {
          command: 'if',
          values: { condition: '[$Script.Usage] == "Modifier" and [$Input.Brushes.Count] == 1' },
        },
        { command: 'transform', values: { move: '0, [$Input.Size.y], 0' } },
        { command: 'input_brushes' },
        { command: 'end' },
        { command: 'end' },
      ),
    );
    const result = fixture.compile();
    expect(result.instances).toHaveLength(2);
    const box = result.instances[0]!.getModelSpaceBounds();
    const copy = result.instances[1]!.getModelSpaceBounds();
    expect(copy.min.y).toBeCloseTo(box.max.y, 4);
    expect(copy.max.x - copy.min.x).toBeCloseTo(box.max.x - box.min.x, 4);
  });

  it("outputs only the script's Cylinder: the received brush is gone without Input Brushes", () => {
    const fixture = modifierFixture(both({ command: 'cylinder', values: { h: '0.3', r1: '0.1', r2: '0.1' } }));
    const shown = fixture.compile().instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
    expect(shown).toHaveLength(1);
    const size = shown[0]!.getModelSpaceBounds().getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(0.3, 4);
    expect(size.x).toBeLessThan(0.25);
  });

  it('bevels the received brush, and the inspector and the editor run it like the stack does', () => {
    const script = both(
      { command: 'input_brushes', values: { textures: 'Move With Shape' } },
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'All', where: '', of: '', how: 'New' } },
      { command: 'bevel_edges', values: { distance: '0.1' } },
    );
    const fixture = modifierFixture(script);
    const shown = fixture.compile().instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
    expect(shown).toHaveLength(1);
    expect(shown[0]!.brush.faces.length).toBeGreaterThan(6);
    const stepId = modifierStackOwnerEncode(fixture.mesh)!.modifiers[0]!.id;
    const start = modifierStackSolidScriptRunStart(fixture.mesh, stepId, 'modifier');
    expect(solidScriptProgramRun(solidScriptDocumentCreate(script.blocks), { ...start, inputs: {} }).error).toBeNull();
    const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND)!;
    const rows = new ModifierStackFieldRows(
      kind.fields,
      () => undefined,
      () => [],
      {},
      (status) => ({ volume: fixture.mesh, stepId, commandStack: null, status }),
    );
    rows.update(kind.normalizeParameters({ script }));
    expect(rows.getElement().textContent).toContain('4 lines · 1 solid');
  });

  it('cuts the received brush like any brush and keeps its face textures', () => {
    const fixture = modifierFixture(
      both({ command: 'input_brushes' }, { command: 'cube', values: { size: '0.2, 2, 0.2', mode: 'Subtractive' } }),
    );
    for (const face of fixture.source.brush.faces) fixture.source.setFaceTextureId(face.surfaceIndex, 'Brick');
    const result = fixture.compile();
    const added = result.instances.filter(
      (brush) => brush !== fixture.source && brush.constructor.name !== 'ModifierStackHiddenBrush',
    );
    expect(added).toHaveLength(1);
    expect(added[0]?.operation).toBe(SolidOperation.Subtractive);
    expect(
      fixture.source.brush.faces.every((face) => fixture.source.getSurfaceTextureId(face.surfaceIndex) === 'Brick'),
    ).toBe(true);
  });

  it('refuses a script made only for generators with a friendly message and passes the brush on', () => {
    const fixture = modifierFixture(solidScriptDocumentCreate([{ command: 'cube' }], 'Only Generator'));
    const result = fixture.compile();
    expect(result.instances).toHaveLength(1);
    expect(JSON.stringify(modifierStackStatusRead(fixture.mesh))).toContain('Turn on Modifier under Can Be Used As');
  });
});
