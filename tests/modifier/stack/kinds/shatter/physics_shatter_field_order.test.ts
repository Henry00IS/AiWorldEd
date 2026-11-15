import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { PHYSICS_SHATTER_MATERIALS } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';

/** Rows every material shares after its own pattern rows, as `group/label`. */
const SHARED_BLAST = [
  'Blast/Strength',
  'Blast/Radius',
  'Blast/Impact X',
  'Blast/Impact Y',
  'Blast/Impact Z',
  'Blast/Direction X',
  'Blast/Direction Y',
  'Blast/Direction Z',
  'Blast/Duration',
];

/** Rows after the details. */
const SHARED_TAIL = [
  'Crack Faces/Projection',
  'Crack Faces/U Scale',
  'Crack Faces/V Scale',
  'Crack Faces/U Offset',
  'Crack Faces/V Offset',
  'Crack Faces/Rotation',
  'Simulation/Solver Iterations',
  'Simulation/Simulate',
  'Simulation/Reset',
];

/**
 * Lists the inspector rows of new parameters, in order, as `group/label`.
 *
 * @param parameters Parameters to set on a new modifier.
 * @returns Visible rows.
 */
function physicsShatterRows(parameters: Record<string, unknown>): string[] {
  const kind = modifierStackKindFind('physicsShatter');
  if (!kind) throw new Error('Physics Shatter kind is missing');
  const normalized = { ...kind.normalizeParameters({ ...kind.createParameters(), ...parameters }), bake: 'AAAA' };
  return kind.fields
    .filter((field) => !field.visible || field.visible(normalized))
    .map((field) => `${field.group ?? ''}/${field.label}`);
}

describe('physics shatter inspector rows', () => {
  it('start with Material, then only the rows glass uses, most used first', () => {
    expect(physicsShatterRows({})).toEqual([
      '/Material',
      '/Crack Size',
      '/Inside Texture',
      ...SHARED_BLAST,
      'Details/Seed',
      'Details/Spokes',
      'Details/Thickness Axis',
      'Details/Max Pieces',
      ...SHARED_TAIL,
    ]);
  });

  it('show the brick rows for Brick and no crack rows', () => {
    const rows = physicsShatterRows({ material: 'brick' });
    expect(rows.slice(0, 4)).toEqual(['/Material', '/Brick Length', '/Brick Height', '/Inside Texture']);
    expect(rows.slice(rows.indexOf('Details/Seed'), rows.indexOf('Crack Faces/Projection'))).toEqual([
      'Details/Seed',
      'Details/Mortar Gap',
      'Details/Joint Jitter',
      'Details/Max Pieces',
    ]);
    expect(rows).not.toContain('/Crack Size');
    expect(rows).not.toContain('/Pattern');
  });

  it('show each material only its own pattern rows', () => {
    const details = (material: string): string[] =>
      physicsShatterRows({ material }).filter(
        (row) => row.startsWith('Details/') && row !== 'Details/Seed' && row !== 'Details/Max Pieces',
      );
    expect(details('temperedGlass')).toEqual(['Details/Thickness Axis']);
    expect(details('stone')).toEqual(['Details/Impact Detail', 'Details/Grain Axis']);
    expect(details('concrete')).toEqual([]);
    expect(details('wood')).toEqual(['Details/Grain Axis']);
    expect(details('ceramic')).toEqual(['Details/Thickness Axis']);
    expect(details('plaster')).toEqual(['Details/Impact Detail', 'Details/Thickness Axis']);
  });

  it('give Custom the raw rows of its pattern', () => {
    const cells = physicsShatterRows({ material: 'custom' });
    expect(cells.slice(0, 5)).toEqual(['/Material', '/Pattern', '/Crack Size', '/Cracks', '/Inside Texture']);
    expect(cells).toContain('Details/Impact Detail');
    expect(cells).toContain('Details/Grain Stretch');
    expect(cells).not.toContain('Details/Thickness Axis');
    expect(physicsShatterRows({ material: 'custom', cracks: '2d' })).toContain('Details/Thickness Axis');
    const radial = physicsShatterRows({ material: 'custom', mode: 'radial' });
    expect(radial).toContain('Details/Spokes');
    expect(radial).not.toContain('/Cracks');
    const bricks = physicsShatterRows({ material: 'custom', mode: 'bricks' });
    expect(bricks.slice(0, 5)).toEqual(['/Material', '/Pattern', '/Brick Length', '/Brick Height', '/Inside Texture']);
  });

  it('keep every group together, so each caption sits above its own rows', () => {
    const kind = modifierStackKindFind('physicsShatter');
    const groups = (kind?.fields ?? []).map((field) => field.group ?? '');
    const seen: string[] = [];
    for (const group of groups) if (seen.at(-1) !== group) seen.push(group);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('give every row and every material a short tooltip', () => {
    const fields = modifierStackKindFind('physicsShatter')?.fields ?? [];
    for (const field of fields) {
      expect(field.hint, field.key).toBeTruthy();
      expect(field.hint?.length ?? 0, field.key).toBeLessThanOrEqual(120);
    }
    const material = fields.find((field) => field.key === 'material');
    expect(material?.choices?.map((choice) => choice.value)).toEqual([...PHYSICS_SHATTER_MATERIALS]);
    for (const choice of material?.choices ?? []) {
      expect(choice.title, choice.value).toBeTruthy();
      expect(choice.title?.length ?? 0, choice.value).toBeLessThanOrEqual(120);
    }
  });
});
