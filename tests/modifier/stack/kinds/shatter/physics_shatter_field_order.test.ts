import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { PHYSICS_SHATTER_MATERIALS } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';
import { PHYSICS_SHATTER_PATTERNS } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_patterns.js';
import { physicsShatterMaterialPreset } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_material_presets.js';

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

/** Material physics rows only Custom shows, before Solver Iterations. */
const CUSTOM_PHYSICS_ROWS = [
  'Simulation/Density',
  'Simulation/Friction',
  'Simulation/Bounciness',
  'Simulation/Air Drag',
  'Simulation/Spin Drag',
  'Simulation/Blast Scale',
  'Simulation/Tumble',
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
  it('start with Shatter and Material, then only the rows glass uses, most used first', () => {
    expect(physicsShatterRows({})).toEqual([
      '/Shatter',
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
    expect(rows.slice(0, 5)).toEqual(['/Shatter', '/Material', '/Brick Length', '/Brick Height', '/Inside Texture']);
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
    expect(cells.slice(0, 6)).toEqual([
      '/Shatter',
      '/Material',
      '/Pattern',
      '/Crack Size',
      '/Cracks',
      '/Inside Texture',
    ]);
    expect(cells).toContain('Details/Impact Detail');
    expect(cells).toContain('Details/Grain Stretch');
    expect(cells).not.toContain('Details/Thickness Axis');
    expect(physicsShatterRows({ material: 'custom', cracks: '2d' })).toContain('Details/Thickness Axis');
    const radial = physicsShatterRows({ material: 'custom', mode: 'radial' });
    expect(radial).toContain('Details/Spokes');
    expect(radial).not.toContain('/Cracks');
    const wood = physicsShatterRows({ material: 'custom', mode: 'splinters' });
    expect(wood.filter((row) => row.startsWith('Details/'))).toEqual([
      'Details/Seed',
      'Details/Grain Axis',
      'Details/Max Pieces',
    ]);
    const bricks = physicsShatterRows({ material: 'custom', mode: 'bricks' });
    expect(bricks.slice(0, 6)).toEqual([
      '/Shatter',
      '/Material',
      '/Pattern',
      '/Brick Length',
      '/Brick Height',
      '/Inside Texture',
    ]);
  });

  it('let Custom pick every preset pattern and show the preset rows for it', () => {
    const fields = modifierStackKindFind('physicsShatter')?.fields ?? [];
    const pattern = fields.find((field) => field.key === 'mode');
    expect(pattern?.choices?.map((choice) => choice.value)).toEqual([...PHYSICS_SHATTER_PATTERNS]);
    for (const choice of pattern?.choices ?? []) {
      expect(choice.title, choice.value).toBeTruthy();
      expect(choice.title?.length ?? 0, choice.value).toBeLessThanOrEqual(120);
    }
    for (const material of PHYSICS_SHATTER_MATERIALS) {
      const mode = physicsShatterMaterialPreset(material).pattern;
      if (!mode) continue;
      const preset = physicsShatterRows({ material });
      const custom = physicsShatterRows({ material: 'custom', mode });
      expect(
        custom.filter((row) => row !== '/Pattern' && !CUSTOM_PHYSICS_ROWS.includes(row)),
        material,
      ).toEqual(preset);
    }
  });

  it('show the material physics rows only for Custom, right before Solver Iterations', () => {
    const rows = physicsShatterRows({ material: 'custom' });
    const solver = rows.indexOf('Simulation/Solver Iterations');
    expect(rows.slice(solver - CUSTOM_PHYSICS_ROWS.length, solver)).toEqual(CUSTOM_PHYSICS_ROWS);
    for (const material of PHYSICS_SHATTER_MATERIALS.filter((id) => id !== 'custom')) {
      expect(
        physicsShatterRows({ material }).filter((row) => CUSTOM_PHYSICS_ROWS.includes(row)),
        material,
      ).toEqual([]);
    }
    const fields = modifierStackKindFind('physicsShatter')?.fields ?? [];
    for (const label of CUSTOM_PHYSICS_ROWS) {
      expect(fields.find((field) => `${field.group}/${field.label}` === label)?.hint, label).toBeTruthy();
    }
  });

  it('with Shatter off show only Material, the blast, the seed and the simulation, for every material', () => {
    for (const material of PHYSICS_SHATTER_MATERIALS) {
      const rows = physicsShatterRows({ material, shatter: false, mode: 'bricks', cracks: '2d' });
      const physics = material === 'custom' ? CUSTOM_PHYSICS_ROWS : [];
      expect(rows, material).toEqual([
        '/Shatter',
        '/Material',
        ...SHARED_BLAST,
        'Details/Seed',
        ...physics,
        'Simulation/Solver Iterations',
        'Simulation/Simulate',
        'Simulation/Reset',
      ]);
    }
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
