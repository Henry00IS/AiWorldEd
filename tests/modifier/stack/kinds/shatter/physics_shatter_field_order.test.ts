import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';

/** Inspector rows of a pattern, in order, as `group/label`. */
function physicsShatterRows(mode: 'glass' | 'bricks'): string[] {
  const kind = modifierStackKindFind('physicsShatter');
  if (!kind) throw new Error('Physics Shatter kind is missing');
  const parameters = { ...kind.normalizeParameters({ mode }), bake: 'AAAA' };
  return kind.fields
    .filter((field) => !field.visible || field.visible(parameters))
    .map((field) => `${field.group ?? ''}/${field.label}`);
}

describe('physics shatter inspector rows', () => {
  it('go from most to least used in glass mode', () => {
    expect(physicsShatterRows('glass')).toEqual([
      '/Pattern',
      '/Crack Size',
      '/Cracks',
      '/Inside Texture',
      'Blast/Strength',
      'Blast/Radius',
      'Blast/Impact X',
      'Blast/Impact Y',
      'Blast/Impact Z',
      'Blast/Direction X',
      'Blast/Direction Y',
      'Blast/Direction Z',
      'Blast/Duration',
      'Details/Seed',
      'Details/Impact Detail',
      'Details/Max Pieces',
      'Crack Faces/Projection',
      'Crack Faces/U Scale',
      'Crack Faces/V Scale',
      'Crack Faces/U Offset',
      'Crack Faces/V Offset',
      'Crack Faces/Rotation',
      'Simulation/Solver Iterations',
      'Simulation/Simulate',
      'Simulation/Reset',
    ]);
  });

  it('swap in the brick rows in bricks mode', () => {
    const rows = physicsShatterRows('bricks');
    expect(rows.slice(0, 4)).toEqual(['/Pattern', '/Brick Length', '/Brick Height', '/Inside Texture']);
    expect(rows.slice(rows.indexOf('Details/Seed'), rows.indexOf('Crack Faces/Projection'))).toEqual([
      'Details/Seed',
      'Details/Mortar Gap',
      'Details/Joint Jitter',
      'Details/Max Pieces',
    ]);
    expect(rows).not.toContain('/Crack Size');
    expect(rows).not.toContain('Details/Impact Detail');
  });

  it('keep every group together, so each caption sits above its own rows', () => {
    const kind = modifierStackKindFind('physicsShatter');
    const groups = (kind?.fields ?? []).map((field) => field.group ?? '');
    const seen: string[] = [];
    for (const group of groups) if (seen.at(-1) !== group) seen.push(group);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('give every row a short tooltip', () => {
    for (const field of modifierStackKindFind('physicsShatter')?.fields ?? []) {
      expect(field.hint, field.key).toBeTruthy();
      expect(field.hint?.length ?? 0, field.key).toBeLessThanOrEqual(120);
    }
  });
});
