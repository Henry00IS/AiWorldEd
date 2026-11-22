import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SolidScriptBlockArguments } from '@/solid_script/language/solid_script_block_arguments.js';
import { solidScriptStarOutline } from '@/solid_script/language/solid_script_primitives.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Draws a Star outline from field values.
 *
 * @param values Field values by key.
 * @returns Outline points.
 */
function star(values: Record<string, SolidScriptValue>): [number, number][] {
  return solidScriptStarOutline(new SolidScriptBlockArguments(new Map(Object.entries(values))));
}

describe('Star', () => {
  it('alternates Points tips at Outer with inner corners at Inner, halfway between', () => {
    const outline = star({ points: 5, inner: 0.4, outer: 1 });
    expect(outline).toHaveLength(10);
    outline.forEach(([x, y], index) => expect(Math.hypot(x, y)).toBeCloseTo(index % 2 === 0 ? 1 : 0.4, 9));
    const [tipX = 0, tipY = 0] = outline[0] ?? [];
    const [innerX = 0, innerY = 0] = outline[1] ?? [];
    expect(Math.atan2(tipY, tipX)).toBeCloseTo(0, 9);
    expect(Math.atan2(innerY, innerX)).toBeCloseTo(Math.PI / 5, 9);
  });

  it('turns the inner corners by Twist degrees and leaves the tips', () => {
    const [, inner = [0, 0]] = star({ points: 4, inner: 1, outer: 2, twist: 15 });
    expect(Math.atan2(inner[1], inner[0])).toBeCloseTo(((45 + 15) * Math.PI) / 180, 9);
  });

  it('refuses too few points or a radius of 0', () => {
    expect(() => star({ points: 2 })).toThrow(/3 to 64/);
    expect(() => star({ inner: 0 })).toThrow(/greater than 0/);
    expect(() => star({ points: 4, twist: 45 })).toThrow(/between -45 and 45 degrees/);
  });

  it('extrudes into solids inside a Linear Extrude', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'linear_extrude', values: { height: '0.2' } },
        { command: 'star', values: { points: '5', inner: '0.4', outer: '1' } },
        { command: 'end' },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.shapes.length).toBeGreaterThan(0);
  });
});
