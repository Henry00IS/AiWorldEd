import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };

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
 * Makes a line.
 *
 * @param command Command id.
 * @param values Fields.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Returns the rounded bounds of every solid corner, as min x, y, z then max.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function bounds(shapes: readonly SolidScriptShape[]): number[] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []));
  const box = new THREE.Box3().setFromPoints(points);
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 1000) / 1000 + 0);
}

/**
 * Every solid corner, rounded and sorted, to compare two results exactly.
 *
 * @param shapes Shapes.
 * @returns Corners as text.
 */
function corners(shapes: readonly SolidScriptShape[]): string[] {
  return shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []))
    .map((point) =>
      point
        .toArray()
        .map((value) => (Math.round(value * 1000) / 1000 + 0).toFixed(3))
        .join(','),
    )
    .sort();
}

/**
 * Counts solid leaves.
 *
 * @param shapes Shapes.
 * @returns Count.
 */
function solids(shapes: readonly SolidScriptShape[]): number {
  return shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid').length;
}

/** A Linear Extrude of height 1 standing on the ground. */
const EXTRUDE = line('linear_extrude', { height: '1', anchor: 'Bottom' });

describe('SolidScript outlines read by Name', () => {
  it('moves a named Circle inside Rotate Extrude, the same as a Transform block around it', () => {
    const named = run(
      line('rotate_extrude'),
      line('circle', { r: '1', label: 'Boing' }),
      line('move_by', { by: '1,0,0', of: 'Boing' }),
      END,
    );
    expect(named.error?.message).toBeUndefined();
    const framed = run(
      line('rotate_extrude'),
      line('transform', { move: '1, 0, 0' }),
      line('circle', { r: '1' }),
      END,
      END,
    );
    expect(framed.error?.message).toBeUndefined();
    expect(solids(named.shapes)).toBeGreaterThan(0);
    expect(corners(named.shapes)).toEqual(corners(framed.shapes));
  });

  it('finds a name in any case, after other lines, and many lines below the outline', () => {
    const result = run(
      line('variable', { name: 'Gap', value: '2' }),
      line('linear_extrude', { height: '1' }),
      line('square', { size: '1, 1', label: 'Tile' }),
      line('echo', { value: 'between' }),
      line('variable', { name: 'Other', value: '3' }),
      line('move_by', { by: '[Gap], 0, 0', of: 'TILE' }),
      END,
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([1.5, -0.5, -0.5, 2.5, 0.5, 0.5]);
  });

  it('moves, turns, scales, resizes and mirrors a named outline inside Linear Extrude', () => {
    const tool = (extra: SolidScriptLine) =>
      run(EXTRUDE, line('square', { size: '2, 1', anchor: 'Left, Front', label: 'Slab' }), extra, END);
    const cases: [SolidScriptLine, number[]][] = [
      [line('move_by', { by: '1, 2, 0', of: 'Slab' }), [1, 0, -3, 3, 1, -2]],
      [line('rotate_by', { by: '0, 0, 90', of: 'Slab' }), [-1, 0, -2, 0, 1, 0]],
      [line('scale_by', { by: '2, 3, 1', of: 'Slab' }), [0, 0, -3, 4, 1, 0]],
      [line('move_to', { to: '0, 0, 0', of: 'Slab' }), [-1, 0, -0.5, 1, 1, 0.5]],
      [line('resize', { size: '4, 4, 1', of: 'Slab' }), [0, 0, -4, 4, 1, 0]],
      [line('mirror', { of: 'Slab' }), [-2, 0, -1, 0, 1, 0]],
    ];
    for (const [extra, expected] of cases) {
      const result = tool(extra);
      expect(result.error?.message, String(extra.command)).toBeUndefined();
      expect(bounds(result.shapes), String(extra.command)).toEqual(expected);
    }
  });

  it('keeps moving the same outline over several lines, each from where the last left it', () => {
    const result = run(
      EXTRUDE,
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Step' }),
      line('move_by', { by: '1, 0, 0', of: 'Step' }),
      line('move_by', { by: '1, 0, 0', of: 'Step' }),
      line('rotate_by', { by: '0, 0, 90', of: 'Step' }),
      line('move_to', { to: '5, 5, 0', of: 'Step' }),
      END,
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([4.5, 0, -5.5, 5.5, 1, -4.5]);
  });

  it('finds names inside nested blocks: Transform, If, Repeat and Hull', () => {
    const result = run(
      EXTRUDE,
      line('transform', { move: '10, 0, 0' }),
      line('if', { condition: 'true' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Deep' }),
      END,
      line('move_by', { by: '1, 0, 0', of: 'Deep' }),
      END,
      END,
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([11, 0, -1, 12, 1, 0]);
    const hulled = run(
      EXTRUDE,
      line('hull'),
      line('circle', { r: '0.5', label: 'A' }),
      line('circle', { r: '0.5', label: 'B' }),
      line('move_by', { by: '3, 0, 0', of: 'B' }),
      END,
      END,
    );
    expect(hulled.error?.message).toBeUndefined();
    expect(bounds(hulled.shapes)).toEqual([-0.5, 0, -0.5, 3.5, 1, 0.5]);
  });

  it('moves an outline from a block line that comes after the nested block has ended', () => {
    const result = run(
      EXTRUDE,
      line('repeat', { count: '1', variable: 'I' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Inner' }),
      END,
      line('move_by', { by: '0, 4, 0', of: 'Inner' }),
      END,
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([0, 0, -5, 1, 1, -4]);
  });

  it('moves every outline that shares a reused name, and copies from Repeat by their own names', () => {
    const shared = run(
      EXTRUDE,
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Dot' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Dot' }),
      line('move_by', { by: '0, 0, 0', of: 'Dot' }),
      line('move_by', { by: '5, 0, 0', of: 'Dot' }),
      END,
    );
    expect(shared.error?.message).toBeUndefined();
    expect(bounds(shared.shapes)).toEqual([5, 0, -1, 6, 1, 0]);
    const copies = run(
      EXTRUDE,
      line('repeat', { count: '3', variable: 'I' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Dot [I]' }),
      line('move_by', { by: '[=[I] * 2], 0, 0', of: 'Dot [I]' }),
      END,
      line('move_by', { by: '0, 10, 0', of: 'Dot 2' }),
      END,
    );
    expect(copies.error?.message).toBeUndefined();
    expect(bounds(copies.shapes)).toEqual([0, 0, -11, 5, 1, 0]);
    const all = run(
      EXTRUDE,
      line('repeat', { count: '3', variable: 'I' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Dot' }),
      END,
      line('move_by', { by: '0, 0, 0', of: 'Dot' }),
      line('scale_by', { by: '2, 1, 1', of: 'Dot' }),
      END,
    );
    expect(all.error?.message).toBeUndefined();
    expect(bounds(all.shapes)).toEqual([0, 0, -1, 2, 1, 0]);
  });

  it('reads a list of names in Of', () => {
    const result = run(
      EXTRUDE,
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Left' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Right' }),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Stay' }),
      line('variable', { name: 'Pair', value: 'Left, Right' }),
      line('move_by', { by: '0, 3, 0', of: '[Pair]' }),
      line('move_by', { by: '2, 0, 0', of: '[=List("Right")]' }),
      END,
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([0, 0, -4, 3, 1, 0]);
  });

  it('explains plainly what is missing or not possible', () => {
    const missing = run(
      EXTRUDE,
      line('square', { label: 'Here' }),
      line('move_by', { by: '1, 0, 0', of: 'There' }),
      END,
    );
    expect(missing.error?.message).toContain('No object or outline above is named "There"; give one a Name first');
    const faces = run(
      EXTRUDE,
      line('square', { label: 'Flat' }),
      line('select_faces', { which: 'All', of: 'Flat' }),
      END,
    );
    expect(faces.error?.message).toContain('"Flat" is a flat outline, and this line works on objects');
    const into = run(
      EXTRUDE,
      line('square', { label: 'Flat' }),
      line('move_by', { by: '1, 0, 0', of: 'Flat', into: 'Copy' }),
      END,
    );
    expect(into.error?.message).toContain('Move By changes an outline where it is; leave Into empty');
    const mixed = run(
      EXTRUDE,
      line('square', { label: 'Flat' }),
      line('variable', { name: 'Spot', value: '1, 2, 3' }),
      line('move_by', { by: '1, 0, 0', of: '[=List("Flat", [Spot])]' }),
      END,
    );
    expect(mixed.error?.message).toContain('not mixed with objects or points');
    const outside = run(line('circle', { label: 'Lost' }));
    expect(outside.error?.message).toContain(
      'Circle is a flat outline; place it inside a Linear Extrude or Rotate Extrude',
    );
  });

  it('still finds solids first, and moves the extruded solids by the name after End', () => {
    const result = run(
      line('rotate_extrude'),
      line('square', { size: '1, 1', anchor: 'Left, Front', label: 'Ring' }),
      END,
      line('move_by', { by: '0, 5, 0', of: 'Ring' }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)[1]).toBe(5);
  });
  it('reads a reused Name inside an extrude as the open outline, not the finished solids that kept it', () => {
    const block = (extrude: string) => [
      line(extrude),
      line('circle', { label: 'Boing' }),
      line('move_by', { by: '8, 0, 0', of: 'Boing' }),
      END,
    ];
    for (const extrude of ['rotate_extrude', 'linear_extrude']) {
      const once = run(...block(extrude));
      const twice = run(...block(extrude), line('blank'), ...block(extrude));
      expect(twice.error?.message).toBeUndefined();
      expect(bounds(twice.shapes)).toEqual(bounds(once.shapes));
    }
  });

  it('writes each outline Into its variable, so Move By Of the variable moves exactly that outline', () => {
    const block = (radius: string): SolidScriptLine[] => [
      line('rotate_extrude', { sides: '8' }),
      line('circle', { r: radius, label: 'Boing', into: 'C' }),
      line('move_by', { by: '8, 0, 0', of: '[C]' }),
      END,
    ];
    const result = run(...block('1'), ...block('0.5'), line('echo', { value: '[C]' }));
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['Boing']);
    expect(solids(result.shapes)).toBe(16);
    const [minX, , , maxX] = bounds(result.shapes);
    expect(minX).toBeLessThan(-8);
    expect(maxX).toBeGreaterThan(8);
    const ring = bounds(run(...block('1')).shapes);
    expect(bounds(result.shapes)).toEqual(ring);
    const document = solidScriptDocumentCreate([...block('1'), line('echo', { value: '[C]' })]);
    expect(solidScriptKindCheck(document)).toEqual([]);
    expect(solidScriptDocumentListing(document).join('\n')).toMatch(/Circle .* Into .*C/);
  });
});
