import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptParameterEachKind } from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A 2 m cube baked into a mesh, held in [Box]. */
const CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: {} },
  { command: 'cube', values: { size: '2' } },
  { command: 'end', values: {} },
  { command: 'select_objects', values: { into: 'Box' } },
];

/**
 * Runs lines after the cube and prints what each Echo reads.
 *
 * @param lines Lines after the cube.
 * @returns Printed values, or the error.
 */
function ran(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...CUBE, ...lines]));
  return result.error ? [result.error.message] : result.messages;
}

/**
 * Prints one value after the cube.
 *
 * @param value Value to print.
 * @param lines Lines to run first.
 * @returns Printed value, or the error.
 */
function read(value: string, ...lines: SolidScriptLine[]): string {
  return ran(...lines, { command: 'echo', values: { value } }).join('\n');
}

/**
 * Prints a value for each item of a list after the cube.
 *
 * @param list List to walk.
 * @param value Value of each item C.
 * @returns Printed values.
 */
function each(list: string, value: string): string[] {
  return ran(
    { command: 'for_each', values: { variable: 'C', list } },
    { command: 'echo', values: { value } },
    { command: 'end' },
  );
}

/** First corner of the first face. */
const FIRST = 'Box.Faces(0).FaceCorners(0)';

describe('Face corners', () => {
  it('gives each face one corner per vertex, each vertex one per face using it, each edge one per face', () => {
    expect(new Set(each('[Box.Faces]', '[C.FaceCorners.Count]'))).toEqual(new Set(['4']));
    expect(new Set(each('[Box.Vertices]', '[C.FaceCorners.Count]'))).toEqual(new Set(['3']));
    expect(new Set(each('[Box.Edges]', '[C.FaceCorners.Count]'))).toEqual(new Set(['2']));
  });

  it('knows its face, vertex, place in the face, position, angle and normal', () => {
    expect(read(`[=[${FIRST}.Face] == [Box.Faces(0)]]`)).toBe('Yes');
    expect(read(`[=[${FIRST}.Position] == [${FIRST}.Vertex.Position]]`)).toBe('Yes');
    expect(read(`[=[${FIRST}.Vertex.FaceCorners.Count]]`)).toBe('3');
    expect(read('[Box.Faces(0).FaceCorners.Indices]')).toBe('[0, 1, 2, 3]');
    expect(read(`[${FIRST}.Angle]`)).toBe('90');
    expect(read(`[=[${FIRST}.Normal] == [Box.Faces(0).Normal]]`)).toBe('Yes');
  });

  it('gives the edges leaving and reaching it around its face', () => {
    const touches = (edge: string): string =>
      `Distance([${FIRST}.Position], [${edge}.Start]) * Distance([${FIRST}.Position], [${edge}.End])`;
    expect(read(`[=${touches(`${FIRST}.NextEdge`)}]`)).toBe('0');
    expect(read(`[=${touches(`${FIRST}.PreviousEdge`)}]`)).toBe('0');
    expect(read(`[=[${FIRST}.NextEdge] == [${FIRST}.PreviousEdge]]`)).toBe('No');
    expect(
      read(
        `[=Distance([Box.Faces(0).FaceCorners(1).Position], [${FIRST}.NextEdge.Start]) * Distance([Box.Faces(0).FaceCorners(1).Position], [${FIRST}.NextEdge.End])]`,
      ),
    ).toBe('0');
  });

  it('reads the UV of its face at its vertex', () => {
    expect(read(`[${FIRST}.UV]`)).toBe(JSON.stringify(JSON.parse(read('[Box.Faces(0).UVs]'))[0]).replaceAll(',', ', '));
  });

  it('sets the UV of one face corner and leaves the other faces at that vertex alone', () => {
    const others = `[${FIRST}.Vertex.FaceCorners.UVs]`;
    const before = JSON.parse(read(others)) as number[][];
    const set: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'Ks', value: '[Box.Faces(0).FaceCorners]' } },
      { command: 'variable', values: { name: 'K', value: '[Ks(0)]' } },
      { command: 'variable', values: { name: 'K.UV', value: '0.5, 0.25, 0' } },
    ];
    expect(read('[K.UV]', ...set)).toBe('[0.5, 0.25, 0]');
    expect((JSON.parse(read('[Box.Faces(0).UVs]', ...set)) as number[][])[0]).toEqual([0.5, 0.25, 0]);
    const after = JSON.parse(read(others, ...set)) as number[][];
    expect(after.filter((uv, index) => JSON.stringify(uv) !== JSON.stringify(before[index]))).toEqual([[0.5, 0.25, 0]]);
  });

  it('sets a UV per corner of a list with $Item and $Index', () => {
    const set: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'Ks', value: '[Box.Faces(0).FaceCorners]' } },
      { command: 'variable', values: { name: 'Ks.UV', value: '[=Vector([$Index], [$Item.Index], 0)]' } },
    ];
    expect(read('[Box.Faces(0).UVs]', ...set)).toBe('[[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]]');
  });

  it('names the face corner of each round $FaceCorner', () => {
    expect(
      ran(
        { command: 'for_each', values: { variable: 'C', list: '[Box.Faces(0).FaceCorners]' } },
        { command: 'echo', values: { value: '[$FaceCorner.Index]' } },
        { command: 'end' },
      ),
    ).toEqual(['0', '1', '2', '3']);
  });

  it('stops on face corners of a solid and on a UV that is not numbers', () => {
    const solid = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: {} },
        { command: 'select_objects', values: { into: 'S' } },
        { command: 'variable', values: { name: 'Ks', value: '[S.Faces(0).FaceCorners]' } },
        { command: 'variable', values: { name: 'K', value: '[Ks(0)]' } },
        { command: 'variable', values: { name: 'K.UV', value: '0, 0, 0' } },
      ]),
    );
    expect(solid.error?.message).toContain('mesh');
    const bad: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'Ks', value: '[Box.Faces(0).FaceCorners]' } },
      { command: 'variable', values: { name: 'K', value: '[Ks(0)]' } },
      { command: 'variable', values: { name: 'K.UV', value: '"left"' } },
    ];
    expect(ran(...bad).join('')).toContain('UV');
  });

  it('offers $Item and $Index in the Value of Set while it sets FaceCorner.UV', () => {
    const value = solidScriptCommandFind('variable')?.parameters.find((entry) => entry.key === 'value');
    expect(value && solidScriptParameterEachKind(value, { name: 'Ks.UV' })).toBe('Item');
    expect(value && solidScriptParameterEachKind(value, { name: 'Ks.UVs' })).toBeUndefined();
  });
});
