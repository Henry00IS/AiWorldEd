import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/** Brush modes a modifier can receive and write. */
const MODES = [SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting] as const;

/**
 * Builds a group of one Additive, one Subtractive and one Intersecting box,
 * with a SolidScript modifier on the group.
 *
 * @param lines Script lines.
 * @returns Model, the three source brushes, and a compile helper.
 */
function mixedFixture(lines: SolidScriptLine[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Set Mode');
  world.add(model.root);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const sources = mixedSources(model, group);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Both'), {
    generator: true,
    modifier: true,
  });
  modifierStackOwnerDecode(group, { modifiers: [entry] });
  const compile = () => {
    world.updateMatrixWorld(true);
    return visible(modifierStackCompile(model.getBrushes(), model.root).instances);
  };
  return { model, sources, compile };
}

/**
 * Adds the three mixed-mode boxes to a group and spaces them apart.
 *
 * @param model Solid model.
 * @param group Group that owns the modifier.
 * @returns The three source brushes, in Additive, Subtractive, Intersecting
 *   order.
 */
function mixedSources(model: SolidModel, group: THREE.Group): SolidBrushInstance[] {
  const sources = MODES.map((operation, index) => {
    const source = model.addBoxBrush(1, operation);
    source.position.set(index * 2, 0, 0);
    if (source.mesh) {
      source.mesh.position.copy(source.position);
      group.add(source.mesh);
    }
    for (const face of source.brush.faces) source.setFaceTextureId(face.surfaceIndex, 'Brick');
    return source;
  });
  model.syncBrushOrderFromScene();
  return sources;
}

/**
 * Visible compile instances, without hidden stand-ins.
 *
 * @param instances Compile instances.
 * @returns Visible brushes.
 */
function visible(instances: readonly SolidBrushInstance[]): SolidBrushInstance[] {
  return instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
}

/**
 * Output brush that stands in for a source, identified by the same id.
 *
 * @param shown Visible compile instances.
 * @param source Authored brush.
 * @returns Matching output brush, or none.
 */
function outputOf(shown: readonly SolidBrushInstance[], source: SolidBrushInstance): SolidBrushInstance | undefined {
  return shown.find((brush) => brush.id === source.id);
}

/**
 * A script that may be used both as a generator and as a modifier.
 *
 * @param lines Script lines.
 * @returns Lines, unchanged, for the fixture to wrap.
 */
function lines(...items: SolidScriptLine[]): SolidScriptLine[] {
  return items;
}

describe('SolidScript modifier Set Mode on input solids', () => {
  it('passes mixed-mode input solids through with the same ids, modes and textures', () => {
    const fixture = mixedFixture(lines({ command: 'input_objects' }));
    const shown = fixture.compile();
    expect(shown).toHaveLength(3);
    for (const [index, source] of fixture.sources.entries()) {
      const output = outputOf(shown, source);
      expect(output, `source ${index}`).toBeDefined();
      expect(output?.operation).toBe(source.operation);
      expect(output?.brush.faces).toHaveLength(6);
      expect(output?.brush.faces.every((face) => output.getSurfaceTextureId(face.surfaceIndex) === 'Brick')).toBe(true);
    }
  });

  it('sets each mixed-mode input to a different Mode and keeps the same scene solids', () => {
    const wanted = [SolidOperation.Subtractive, SolidOperation.Intersecting, SolidOperation.Additive];
    const fixture = mixedFixture(
      lines(
        { command: 'input_objects', values: { into: 'Got' } },
        { command: 'variable', values: { name: 'Got(0).Mode', value: 'Subtractive' } },
        { command: 'variable', values: { name: 'Got(1).Mode', value: 'Intersecting' } },
        { command: 'variable', values: { name: 'Got(2).Mode', value: 'Additive' } },
        { command: 'output', values: { of: '[Got]' } },
      ),
    );
    const shown = fixture.compile();
    expect(shown).toHaveLength(3);
    for (const [index, source] of fixture.sources.entries()) {
      const output = outputOf(shown, source);
      expect(output, `source ${index}`).toBeDefined();
      expect(output?.operation).toBe(wanted[index]);
      expect(source.operation).toBe(MODES[index]);
      expect(output?.brush.faces).toHaveLength(6);
      expect(output?.brush.faces.every((face) => output.getSurfaceTextureId(face.surfaceIndex) === 'Brick')).toBe(true);
    }
  });

  it.each([
    ['Additive', SolidOperation.Additive],
    ['Subtractive', SolidOperation.Subtractive],
    ['Intersecting', SolidOperation.Intersecting],
  ] as const)('sets every mixed-mode input to %s in the scene', (mode, operation) => {
    const fixture = mixedFixture(
      lines(
        { command: 'input_objects', values: { into: 'Got' } },
        { command: 'variable', values: { name: 'Got.Modes', value: mode } },
        { command: 'output', values: { of: '[Got]' } },
      ),
    );
    const shown = fixture.compile();
    expect(shown).toHaveLength(3);
    expect(fixture.sources.map((source) => outputOf(shown, source)?.operation)).toEqual([
      operation,
      operation,
      operation,
    ]);
    expect(fixture.sources.map((source) => source.operation)).toEqual([...MODES]);
  });

  it('lets For Each treat each incoming Mode differently', () => {
    const fixture = mixedFixture(
      lines(
        { command: 'input_objects' },
        { command: 'for_each', values: { variable: 'Object', list: '[$Input.Objects]' } },
        { command: 'if', values: { condition: '[Object.Mode] == "Additive"' } },
        { command: 'variable', values: { name: 'Object.Mode', value: 'Subtractive' } },
        { command: 'end' },
        { command: 'end' },
      ),
    );
    const shown = fixture.compile();
    expect(fixture.sources.map((source) => outputOf(shown, source)?.operation)).toEqual([
      SolidOperation.Subtractive,
      SolidOperation.Subtractive,
      SolidOperation.Intersecting,
    ]);
  });

  it('applies Set Mode to every Input Objects pass in the scene', () => {
    const fixture = mixedFixture(
      lines(
        { command: 'input_objects', values: { into: 'Got' } },
        { command: 'variable', values: { name: 'Got.Modes', value: 'Intersecting' } },
        { command: 'output', values: { of: '[Got]' } },
        { command: 'transform', values: { move: '0, 2, 0' } },
        { command: 'input_objects' },
        { command: 'end' },
      ),
    );
    const shown = fixture.compile();
    expect(shown).toHaveLength(6);
    expect(shown.every((brush) => brush.operation === SolidOperation.Intersecting)).toBe(true);
    expect(fixture.sources.every((source) => outputOf(shown, source)?.operation === SolidOperation.Intersecting)).toBe(
      true,
    );
    expect(fixture.sources.map((source) => source.operation)).toEqual([...MODES]);
  });
});
