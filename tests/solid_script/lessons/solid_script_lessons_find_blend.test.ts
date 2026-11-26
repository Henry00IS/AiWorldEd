import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs Find Closest over a 2 m cube with Blend Corners and prints Sampled.
 *
 * @param from From field.
 * @param sample Sample field.
 * @returns Printed Sampled, or the error.
 */
function blended(from: string, sample: string): string {
  const lines: SolidScriptLine[] = [
    { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
    { command: 'select_objects' },
    { command: 'select_faces', values: { which: 'All' } },
    { command: 'find_closest', values: { from, blend: 'Corners', sample, sampled: 'S' } },
    { command: 'echo', values: { value: '[S]' } },
  ];
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Find Closest Blend Corners', () => {
  it('blends Sample read at each corner of the face found by where the point lies', () => {
    expect(blended('0.3, 3, -0.4', '[=[$FaceCorner.Position.X]]')).toBe('0.3');
    expect(blended('0.3, 3, -0.4', '[=[$FaceCorner.Position]]')).toBe('[0.3, 1, -0.4]');
  });

  it('blends once per item for a list of points', () => {
    expect(blended('[0.3, 3, 0], [-0.5, 3, 0]', '[=[$FaceCorner.Position.X]]')).toBe('[0.3, -0.5]');
  });

  it('needs a number or a vector to blend', () => {
    expect(blended('0, 3, 0', '[="corner"]')).toContain('Blend Corners needs Sample to give a number or a vector');
  });
});
