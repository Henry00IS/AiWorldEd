import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { modifierStackSolidScriptLayout } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_layout.js';
import { modifierStackBrushGeometryValid } from '@/modifier/stack/evaluate/modifier_stack_validity.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const BOX = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Box' });
const DENT = line('set_positions', {
  of: 'Box',
  where: '[=[$X] > 0 and [$Y] > 0 and [$Z] > 0]',
  to: '[=Vector(0, 0, 0)]',
});
const WARNING = /^1 solid is not convex and will not be built/;

/**
 * Runs lines and returns the run and what the scene would build from them.
 *
 * @param lines Script lines.
 * @returns Run result and the brush nodes of the generator layout.
 */
function output(...lines: SolidScriptLine[]) {
  const document = solidScriptDocumentCreate(lines);
  const run = solidScriptProgramRun(document);
  const layout = modifierStackSolidScriptLayout(
    document,
    'origin',
    new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    SolidOperation.Additive,
    undefined,
  );
  return { run, layout, warnings: run.warnings.map((warning) => warning.text) };
}

describe('SolidScript non-convex solids', () => {
  it('lets a line dent a solid without stopping, and later lines keep editing it', () => {
    const { run } = output(
      BOX,
      DENT,
      line('select_objects'),
      line('echo', { value: '[$Selected.Objects.First.Vertices.Count]' }),
    );
    expect(run.error).toBeNull();
    expect(run.messages).toEqual(['8']);
  });

  it('warns once at the end when a solid is still not convex, and the scene does not build it', () => {
    const { run, layout, warnings } = output(BOX, DENT, line('cube', { size: '1, 1, 1' }));
    expect(run.error).toBeNull();
    expect(warnings.filter((text) => WARNING.test(text))).toHaveLength(1);
    expect(layout.error).toBe('');
    expect(layout.nodes).toHaveLength(1);
    const dented = run.shapes.flatMap(solidScriptShapeLeavesPositive).find((leaf) => leaf.kind === 'solid');
    if (!dented || dented.kind !== 'solid') throw new Error('no solid');
    const brush = SolidBrushFactory.createFromFaceLoops(
      dented.faces.map((loop) => loop.map((index) => dented.points[index]!)),
    );
    expect(brush === null || !modifierStackBrushGeometryValid(brush)).toBe(true);
  });

  it('gives no warning when a later line makes the solid convex again, by name, variable or Select Objects', () => {
    const back = '[=Vector(1, 1, 1)]';
    const near = '[=[$Vertex.Position.Length] < 0.01]';
    const byName = output(BOX, DENT, line('set_positions', { of: 'Box', where: near, to: back }));
    expect(byName.run.error).toBeNull();
    expect(byName.warnings.some((text) => WARNING.test(text))).toBe(false);
    expect(byName.layout.nodes).toHaveLength(1);
    const bySelect = output(
      BOX,
      DENT,
      line('select_objects'),
      line('select_vertices', { which: 'All', where: near }),
      line('set_positions', { to: back }),
    );
    expect(bySelect.run.error).toBeNull();
    expect(bySelect.warnings.some((text) => WARNING.test(text))).toBe(false);
    expect(bySelect.layout.nodes).toHaveLength(1);
    const byVariable = output(
      BOX,
      line('select_objects'),
      line('variable', { name: 'Held', value: '[$Selected.Objects.First]' }),
      DENT,
      line('set_positions', { of: '[Held]', where: near, to: back }),
    );
    expect(byVariable.run.error).toBeNull();
    expect(byVariable.warnings.some((text) => WARNING.test(text))).toBe(false);
    expect(byVariable.layout.nodes).toHaveLength(1);
  });
});
