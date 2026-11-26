import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/** Runs picked objects followed by the given lines. */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'cube' }, { command: 'cube' }, { command: 'select_objects' }, ...lines]),
  );
}

describe('Where on lines with Of', () => {
  it('gives every Of a Where that defaults to everything', () => {
    const missing = solidScriptCommands.filter(
      (command) =>
        command.id !== 'output' &&
        command.parameters.some((field) => field.key === 'of') &&
        !command.parameters.some((field) => field.key === 'where'),
    );
    expect(missing.map((command) => command.id)).toEqual([]);
  });

  it('moves only the objects that pass Where', () => {
    const result = run({ command: 'move_by', values: { by: '2, 0, 0', where: '[=[$Index] == 1]' } });
    expect(result.error).toBeNull();
    expect(
      solidScriptGeometryLeaves(result.shapes).map((leaf) => Math.min(...leaf.points.map((point) => point.x))),
    ).toEqual([-0.5, 1.5]);
  });

  it('does nothing when no object passes Where', () => {
    const result = run({ command: 'move_by', values: { by: '2, 0, 0', where: 'No' } });
    expect(result.error).toBeNull();
    expect(
      solidScriptGeometryLeaves(result.shapes).map((leaf) => Math.min(...leaf.points.map((point) => point.x))),
    ).toEqual([-0.5, -0.5]);
  });

  it('copies only the objects that pass Array Where', () => {
    const result = run({ command: 'array_in_line', values: { count: '3', where: '[=[$Index] == 0]' } });
    expect(result.error).toBeNull();
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(4);
  });

  it('filters faces before Texture Faces paints them', () => {
    const result = run({
      command: 'texture_faces',
      values: { of: '[$Selected.Objects]', where: '[=[$Face.Normal.Y] > 0.9]' },
    });
    expect(result.error).toBeNull();
    const leaves = solidScriptGeometryLeaves(result.shapes);
    expect(leaves.every((leaf) => leaf.kind === 'solid' && leaf.faceTextures?.length === 1)).toBe(true);
  });
});
