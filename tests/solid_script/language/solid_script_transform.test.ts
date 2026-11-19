import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

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
 * Returns rounded solid corners, as min x, y, z then max.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function bounds(shapes: readonly SolidScriptShape[]): number[] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z);
  return [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys), Math.max(...zs)].map(
    (value) => Math.round(value * 1000) / 1000 + 0,
  );
}

/**
 * Counts solid leaves, not groups.
 *
 * @param shapes Shapes.
 * @returns Count.
 */
function solidCount(shapes: readonly SolidScriptShape[]): number {
  return shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid').length;
}

describe('SolidScript Transform and flat transform tools', () => {
  it('moves shapes inside a Transform the same way a later Move By of the shape does', () => {
    const wrapped = run(
      { command: 'transform', values: { move: '0, 2, 0' } },
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
      { command: 'end' },
    );
    const flat = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_by', values: { by: '0, 2, 0', of: '[Box]' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(wrapped.error).toBeNull();
    expect(flat.error).toBeNull();
    expect(bounds(wrapped.shapes)).toEqual(bounds(flat.shapes));
    expect(bounds(wrapped.shapes)).toEqual([-0.5, 1.5, -0.5, 0.5, 2.5, 0.5]);
  });

  it('does not group the brushes its lines build', () => {
    const result = run(
      { command: 'transform', values: { move: '1, 0, 0' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      { command: 'sphere', values: { anchor: 'Center, Center, Center' } },
      { command: 'end' },
    );
    expect(result.error).toBeNull();
    expect(result.shapes).toHaveLength(2);
    expect(solidCount(result.shapes)).toBe(2);
    expect(result.shapes.some((shape) => shape.kind === 'group')).toBe(false);
  });

  it('stands a cube on a face when On uses that face, the same as Place On Face', () => {
    const child = { command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Center, Bottom, Center' } };
    const placed = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Facing Up', into: 'Top' } },
      { command: 'place_on_face', values: { of: '[Top]' } },
      child,
      { command: 'end' },
    );
    const transformed = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Facing Up', into: 'Top' } },
      { command: 'transform', values: { on: '[Top]' } },
      child,
      { command: 'end' },
    );
    expect(placed.error).toBeNull();
    expect(transformed.error).toBeNull();
    expect(bounds(transformed.shapes)).toEqual(bounds(placed.shapes));
  });

  it('moves a door so its center sits at Move To, and can copy with Into', () => {
    const moved = run(
      { command: 'cube', values: { size: '1, 2, 0.2', anchor: 'Center, Center, Center', into: 'Door' } },
      { command: 'move_to', values: { to: '3, 1, 0', of: '[Door]' } },
      { command: 'output', values: { of: '[Door]' } },
    );
    expect(moved.error).toBeNull();
    expect(bounds(moved.shapes)).toEqual([2.5, 0, -0.1, 3.5, 2, 0.1]);
    const copied = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_by', values: { by: '0, 2, 0', of: '[Box]', into: 'Copy' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(copied.error).toBeNull();
    expect(bounds(copied.shapes)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    const listed = copied.variables.find((entry) => entry.name === 'Copy');
    expect(listed?.type).toMatch(/Brush/);
  });

  it('moves a list of points and writes them back, and stops when Of is left off with no selection', () => {
    const result = run(
      { command: 'variable', values: { name: 'Spots', value: '[0, 0, 0], [1, 0, 0]' } },
      { command: 'move_by', values: { by: '0, 2, 0', of: '[Spots]' } },
      { command: 'echo', values: { value: '[Spots]' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages.join(' ')).toMatch(/0,\s*2,\s*0/);
    expect(result.messages.join(' ')).toMatch(/1,\s*2,\s*0/);
    const stopped = run({ command: 'move_by', values: { by: '0, 1, 0' } });
    expect(stopped.error?.message).toMatch(/Select Brushes/);
  });

  it('applies Move By in the Transform space, the same as a Transform Move inside that space', () => {
    const nested = run(
      { command: 'transform', values: { rotate: '0, 90, 0' } },
      { command: 'transform', values: { move: '2, 0, 0' } },
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
      { command: 'end' },
      { command: 'end' },
    );
    const tool = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'transform', values: { rotate: '0, 90, 0' } },
      { command: 'move_by', values: { by: '2, 0, 0', of: '[Box]' } },
      { command: 'end' },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(nested.error).toBeNull();
    expect(tool.error).toBeNull();
    expect(bounds(tool.shapes)).toEqual(bounds(nested.shapes));
  });

  it('moves a 0.1 m cube by a literal 1, 1, 1 metres, not by the cube size', () => {
    const result = run(
      { command: 'cube', values: { size: '0.1, 0.1, 0.1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_by', values: { by: '1, 1, 1', of: '[Box]' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(result.error).toBeNull();
    expect(bounds(result.shapes)).toEqual([0.95, 0.95, 0.95, 1.05, 1.05, 1.05]);
  });

  it('places the combined center at Move To without also adding a By', () => {
    const result = run(
      { command: 'cube', values: { size: '0.1, 0.1, 0.1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_to', values: { to: '0, 0, 0', of: '[Box]' } },
      { command: 'move_to', values: { to: '2, 0, 0', of: '[Box]' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(result.error).toBeNull();
    expect(bounds(result.shapes)).toEqual([1.95, -0.05, -0.05, 2.05, 0.05, 0.05]);
  });

  it('turns around the combined center with Rotate To, and sizes to To with Scale To', () => {
    const turned = run(
      { command: 'cube', values: { size: '2, 1, 1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_by', values: { by: '3, 0, 0', of: '[Box]' } },
      { command: 'rotate_to', values: { to: '0, 0, 90', of: '[Box]' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(turned.error).toBeNull();
    // 2 x 1 box at x=3, quarter turn about its center around Z: still centered at 3, 0, 0, now 1 wide and 2 tall.
    expect(bounds(turned.shapes)).toEqual([2.5, -1, -0.5, 3.5, 1, 0.5]);
    const sized = run(
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center', into: 'Box' } },
      { command: 'move_by', values: { by: '4, 0, 0', of: '[Box]' } },
      { command: 'scale_to', values: { to: '2, 4, 1', of: '[Box]' } },
      { command: 'output', values: { of: '[Box]' } },
    );
    expect(sized.error).toBeNull();
    expect(bounds(sized.shapes)).toEqual([3, -2, -0.5, 5, 2, 0.5]);
  });
});
