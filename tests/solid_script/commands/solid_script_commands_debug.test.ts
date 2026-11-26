import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptWidgetDraw } from '@/solid_script/language/solid_script_widget.js';

/**
 * Runs lines and returns the drawings they made.
 *
 * @param lines Lines.
 * @returns Drawings, and the error text of the run.
 */
function drawn(lines: SolidScriptLine[]): { draws: SolidScriptWidgetDraw[]; error: string } {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), { inputs: {} });
  const draws = result.widgets.filter((widget): widget is SolidScriptWidgetDraw => widget.kind === 'Draw');
  return { draws, error: result.error?.message ?? '' };
}

/**
 * Returns a Debug line of one shape.
 *
 * @param shape Shape, such as Ray for Debug Ray.
 * @param values Field values.
 * @returns Line.
 */
const draw = (shape: string, values: Record<string, string> = {}): SolidScriptLine => ({
  command: `debug_${shape.toLowerCase()}`,
  values,
});

/**
 * Rounds every number of the segments, so float noise does not matter.
 *
 * @param segments Segments.
 * @returns Rounded segments.
 */
const rounded = (segments: readonly (readonly number[])[]) =>
  segments.map((segment) => segment.map((value) => Math.round(value * 1000) / 1000 + 0));

describe('Debug blocks', () => {
  it('draws a Line from Position to To, in the colour picked', () => {
    const { draws, error } = drawn([draw('Line', { at: '0, 0, 0', to: '1, 2, 3', color: 'Red' })]);
    expect(error).toBe('');
    expect(draws).toEqual([
      { kind: 'Draw', line: 1, label: '', at: [0, 0, 0], color: '#e0453a', segments: [[0, 0, 0, 1, 2, 3]] },
    ]);
  });

  it('draws a Box as its 12 edges around Position', () => {
    const { draws } = drawn([draw('Box', { at: '1, 0, 0', size: '2, 2, 2' })]);
    const segments = draws[0]!.segments;
    expect(segments).toHaveLength(12);
    expect(segments.flat().filter((_, index) => index % 3 === 0)).toEqual(expect.arrayContaining([0, 2]));
  });

  it('draws a Circle around its Normal, and a Sphere as three circles', () => {
    const circle = drawn([draw('Circle', { radius: '2', normal: '0, 1, 0' })]).draws[0]!.segments;
    expect(circle.length).toBeGreaterThanOrEqual(24);
    for (const [x, y, z] of circle) {
      expect(y).toBeCloseTo(0);
      expect(Math.hypot(x!, z!)).toBeCloseTo(2);
    }
    const sphere = drawn([draw('Sphere', { radius: '1' })]).draws[0]!.segments;
    expect(sphere).toHaveLength(circle.length * 3);
  });

  it('draws a Ray from Position along Normal for Distance, with a head, and an Arrow to To', () => {
    const ray = drawn([draw('Ray', { at: '1, 0, 0', normal: '0, 0, 5', distance: '3' })]).draws[0]!;
    expect(rounded(ray.segments)[0]).toEqual([1, 0, 0, 1, 0, 3]);
    expect(ray.segments.length).toBeGreaterThan(1);
    const arrow = drawn([draw('Arrow', { at: '0, 0, 0', to: '0, 2, 0' })]).draws[0]!;
    expect(rounded(arrow.segments)[0]).toEqual([0, 0, 0, 0, 2, 0]);
    expect(arrow.segments.length).toBeGreaterThan(1);
  });

  it('shows Text at Position', () => {
    const { draws } = drawn([draw('Text', { at: '0, 1, 0', text: 'Hello [=1 + 1]' })]);
    expect(draws[0]).toMatchObject({ label: 'Hello 2', at: [0, 1, 0], segments: [] });
  });

  it('ignores the Transform around it in Global space, and follows it in Local space', () => {
    const inside = (space: string) =>
      drawn([
        { command: 'transform', values: { move: '5, 0, 0' } },
        draw('Line', { at: '0, 0, 0', to: '1, 0, 0', space }),
        { command: 'end' },
      ]).draws[0]!.segments[0];
    expect(inside('Global')).toEqual([0, 0, 0, 1, 0, 0]);
    expect(rounded([inside('Local')!])[0]).toEqual([5, 0, 0, 6, 0, 0]);
    expect(inside('')).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it('has one block per shape, each with only the fields it reads', () => {
    const keys = (id: string) => solidScriptCommandFind(id)?.parameters.map((parameter) => parameter.key);
    expect(solidScriptCommandFind('debug_draw')).toBeUndefined();
    expect(keys('debug_line')).toEqual(['at', 'to', 'color', 'space']);
    expect(keys('debug_ray')).toEqual(['at', 'normal', 'distance', 'color', 'space']);
    expect(keys('debug_circle')).toEqual(['at', 'normal', 'radius', 'color', 'space']);
    expect(keys('debug_text')).toEqual(['at', 'text', 'color', 'space']);
    expect(solidScriptCommandFind('debug_box')?.label).toBe('Debug Box');
  });

  it('draws every shape with its defaults, and stops on a Space it does not know', () => {
    for (const shape of ['Line', 'Arrow', 'Ray', 'Box', 'Circle', 'Sphere', 'Text'])
      expect(drawn([draw(shape)]).draws, shape).toHaveLength(1);
    expect(drawn([draw('Line', { space: 'Sideways' })]).error).toContain('Space');
  });
});
