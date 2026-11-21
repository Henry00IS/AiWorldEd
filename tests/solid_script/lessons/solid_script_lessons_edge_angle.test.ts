import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Runs lines and returns what Echo printed, failing on a stop.
 *
 * @param lines Script lines.
 * @returns Printed messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * A flat 3 by 3 grid mesh with its middle face pushed up 1: a bump with inner
 * corners round its foot.
 */
const BUMP = [
  line('grid_mesh', { size: '3, 0, 3', columns: '3', rows: '3' }),
  line('select_objects'),
  line('variable', { name: 'Grid', value: '[$Selected.Objects.First]' }),
  line('select_faces', { which: 'All', of: '[Grid]', where: '[=Length([$Face.Center]) < 0.1]' }),
  line('extrude_face', { distance: '1' }),
];

describe('signed edge angles', () => {
  it('declares SignedAngle and IsConvex with their list forms', () => {
    expect(solidScriptMemberType('Edge', 'SignedAngle')).toBe('Number');
    expect(solidScriptMemberType('Edge List', 'SignedAngles')).toBe('Number List');
    expect(solidScriptMemberType('Edge', 'IsConvex')).toBe('Yes/No');
    expect(solidScriptMemberType('Edge List', 'IsConvex')).toBe('Yes/No List');
  });

  it('gives every edge of a cube a convex 90', () => {
    expect(
      printed(
        line('cube', { size: '2, 2, 2', into: 'Box' }),
        line('echo', { value: '[Box.Edges.First.SignedAngle]|[Box.Edges.First.IsConvex]' }),
        line('select_edges', { which: 'All', of: '[Box]', where: '[=[$Edge.IsConvex]]' }),
        line('echo', { value: '[$Selected.Edges.Count]' }),
      ),
    ).toEqual(['90|Yes', '12']);
  });

  it('tells outer corners from inner corners on a mesh, and flat edges are 0', () => {
    const [convex, concave, flat] = printed(
      ...BUMP,
      line('select_edges', { which: 'All', of: '[Grid]', where: '[=[$Edge.SignedAngle] > 1]' }),
      line('echo', { value: '[$Selected.Edges.Count]' }),
      line('select_edges', { which: 'All', of: '[Grid]', where: '[=[$Edge.SignedAngle] < -1]' }),
      line('echo', { value: '[$Selected.Edges.Count]' }),
      line('select_edges', {
        which: 'All',
        of: '[Grid]',
        where: '[=Abs([$Edge.SignedAngle]) < 1 && ![$Edge.IsBoundary]]',
      }),
      line('echo', { value: '[$Selected.Edges.Count]' }),
    );
    expect(convex).toBe('8');
    expect(concave).toBe('4');
    expect(Number(flat)).toBeGreaterThan(0);
  });
});
