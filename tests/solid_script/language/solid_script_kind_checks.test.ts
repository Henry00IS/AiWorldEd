import { describe, expect, it } from 'vitest';
import type { SolidScriptCommandAccepts } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentFlowAt } from '@/solid_script/document/solid_script_document_flow.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { SOLID_SCRIPT_KIND_CHECKS } from '@/solid_script/language/solid_script_functions_kind_checks.js';
import {
  SOLID_SCRIPT_KINDS,
  solidScriptKindAccepted,
  solidScriptKindOf,
} from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SolidScriptElement } from '@/solid_script/language/solid_script_value.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Lists the kinds a variable may hold where a line stands, sorted.
 *
 * @param lines Script.
 * @param position 0-based line, or where a new line goes.
 * @param name Variable name key.
 * @returns Kinds.
 */
function kindsAt(lines: SolidScriptLine[], position: number, name: string): string[] {
  const variable = solidScriptDocumentFlowAt(solidScriptDocumentCreate(lines), position).get(name);
  return [...(variable?.kinds ?? [])].sort();
}

describe('SolidScript kind checks', () => {
  it('declares one Is* check for every kind, and keeps the older names', () => {
    expect(Object.keys(SOLID_SCRIPT_KIND_CHECKS).sort()).toEqual([...SOLID_SCRIPT_KINDS].sort());
    const names = Object.values(SOLID_SCRIPT_KIND_CHECKS).map((check) => check.key);
    expect(names).toEqual([
      'is_num',
      'is_string',
      'is_bool',
      'is_vector',
      'is_object',
      'is_solid',
      'is_mesh',
      'is_path',
      'is_face',
      'is_edge',
      'is_vertex',
      'is_list',
      'is_data',
    ]);
    for (const check of Object.values(SOLID_SCRIPT_KIND_CHECKS)) {
      expect(SOLID_SCRIPT_FUNCTIONS_BUILTIN[check.key], check.key).toBeTypeOf('function');
      expect(SOLID_SCRIPT_FUNCTION_DOCS[check.key]?.checks, check.key).toEqual([...check.checks]);
      expect(SOLID_SCRIPT_FUNCTION_DOCS[check.key]?.usage, check.key).toBe(check.usage);
    }
    expect(SOLID_SCRIPT_FUNCTIONS_BUILTIN['is_undef']).toBeTypeOf('function');
    expect(SOLID_SCRIPT_FUNCTION_DOCS['is_undef']?.usage).toBe('IsUndef(value)');
  });

  it('answers IsVector, IsSolid, IsMesh, IsFace, IsEdge, IsVertex and IsData at run time', () => {
    const numbers = run(
      { command: 'variable', values: { name: 'Long', value: '1, 2, 3, 4' } },
      {
        command: 'echo',
        values: {
          value: '[=IsVector(Vector(1, 0, 0))] [=IsVector(1)] [=IsVector([Long])] [=IsNum(2)] [=IsList([Long])]',
        },
      },
    );
    expect(numbers.error).toBeNull();
    expect(numbers.messages).toEqual(['Yes No No Yes Yes']);
    const geometry = run(
      CUBE,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All', into: 'Faces' } },
      { command: 'select_edges', values: { which: 'All', into: 'Edges' } },
      { command: 'select_vertices', values: { which: 'All', into: 'Corners' } },
      {
        command: 'echo',
        values: {
          value:
            '[=IsSolid([$Selected.Objects.First])] [=IsMesh([$Selected.Objects.First])] [=IsFace([Faces.First])] [=IsEdge([Edges.First])] [=IsVertex([Corners.First])] [=IsData([Faces.First.Data])]',
        },
      },
    );
    expect(geometry.error).toBeNull();
    expect(geometry.messages).toEqual(['Yes No Yes Yes Yes Yes']);
    const mesh = run(
      { command: 'grid_mesh' },
      { command: 'select_objects' },
      {
        command: 'echo',
        values: { value: '[=IsMesh([$Selected.Objects.First])] [=IsSolid([$Selected.Objects.First])]' },
      },
    );
    expect(mesh.error).toBeNull();
    expect(mesh.messages).toEqual(['Yes No']);
  });

  it('narrows a name inside If IsVector, If IsFace and If IsSolid', () => {
    const vector = [
      { command: 'variable', values: { name: 'X', value: '1' } },
      { command: 'if', values: { condition: '[Coin] == 1' } },
      { command: 'variable', values: { name: 'X', value: '1, 2, 3' } },
      END,
      { command: 'if', values: { condition: 'IsVector([X])' } },
      { command: 'echo', values: { value: 'vector' } },
      { command: 'else' },
      { command: 'echo', values: { value: 'other' } },
      END,
    ];
    expect(kindsAt(vector, 4, 'x')).toEqual(['Number', 'Vector']);
    expect(kindsAt(vector, 6, 'x')).toEqual(['Vector']);
    expect(kindsAt(vector, 8, 'x')).toEqual(['Number']);
    const face = [
      CUBE,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All', into: 'X' } },
      { command: 'if', values: { condition: 'IsFace([X.First])' } },
      { command: 'echo', values: { value: 'face' } },
      END,
    ];
    expect(kindsAt(face, 5, 'x')).toEqual(['Face List']);
    const held = [
      { command: 'variable', values: { name: 'Item', value: '1' } },
      { command: 'if', values: { condition: '[Coin] == 1' } },
      { command: 'cube', values: { into: 'Item' } },
      END,
      { command: 'if', values: { condition: 'IsSolid([Item])' } },
      { command: 'echo', values: { value: 'brush' } },
      { command: 'else' },
      { command: 'echo', values: { value: 'other' } },
      END,
    ];
    expect(kindsAt(held, 5, 'item')).toEqual(['Solid']);
    expect(kindsAt(held, 8, 'item')).toEqual(['Number']);
  });

  it('lets a mesh pass where a field takes a solid, and kindOf names it Mesh', () => {
    const accepts: SolidScriptCommandAccepts = ['Object'];
    const mesh = new SolidScriptElement('brush', 1);
    mesh.mesh = true;
    const brush = new SolidScriptElement('brush', 2);
    expect(solidScriptKindOf(mesh)).toBe('Mesh');
    expect(solidScriptKindOf(brush)).toBe('Solid');
    expect(solidScriptKindAccepted(accepts, 'Mesh')).toBe(true);
    expect(solidScriptKindAccepted(accepts, 'Object')).toBe(true);
    expect(solidScriptKindAccepted(accepts, 'Face')).toBe(false);
  });
});
