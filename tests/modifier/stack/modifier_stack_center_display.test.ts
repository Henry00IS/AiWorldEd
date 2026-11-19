import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { stackFixture, type StackFixtureStep } from './modifier_stack_fixture.js';

/** Stacks saved before Center became the display spelling, using stored values. */
const SAVED_BEFORE_CENTER_DISPLAY: readonly { name: string; steps: readonly StackFixtureStep[] }[] = [
  { name: 'mirror', steps: [{ kind: 'mirror', parameters: { plane: 'Volume Centre', axis: 'X', bisect: true } }] },
  { name: 'shear whole', steps: [{ kind: 'shear', parameters: { pivot: 'Centre Of Whole Input' } }] },
  { name: 'shear each', steps: [{ kind: 'shear', parameters: { pivot: 'Centre Of Each Piece' } }] },
  { name: 'shear volume', steps: [{ kind: 'shear', parameters: { pivot: 'Volume Centre' } }] },
  { name: 'radial', steps: [{ kind: 'radial', parameters: { centreSide: 'Up', count: 4 } }] },
  { name: 'arch', steps: [{ kind: 'arch', parameters: { start: 'Centre', sweep: 90 } }] },
];

/** Tokens that must still appear in a saved level. */
const STORED_CENTRE_TOKENS = [
  'Volume Centre',
  'Centre Of Whole Input',
  'Centre Of Each Piece',
  'centreSide',
  '"Centre"',
] as const;

/**
 * Rounds the numbers of a value for comparison.
 *
 * @param value Value.
 * @returns Rounded JSON.
 */
function rounded(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === 'number' ? Math.round(item * 1e4) / 1e4 + 0 : item,
  );
}

/**
 * Corners of each brush, sorted, in model space.
 *
 * @param brushes Brushes.
 * @returns Keys.
 */
function brushKeys(brushes: readonly SolidBrushInstance[]): string[] {
  return brushes
    .map((brush) =>
      brush
        .getModelSpaceBrush()
        .vertices.map((vertex) => rounded(vertex.toArray()))
        .sort()
        .join(' '),
    )
    .sort();
}

/**
 * Compiles a solid's modifier stack to comparable brush keys.
 *
 * @param model Solid.
 * @returns Keys.
 */
function compileKeys(model: SolidModel): string[] {
  return brushKeys(modifierStackCompile(model.getBrushes(), model.root).instances);
}

/**
 * Reloads a serialized scene and returns its solid model.
 *
 * @param json Scene data.
 * @returns Loaded solid.
 */
function loadModel(json: unknown): SolidModel {
  const world = new THREE.Group();
  new SceneDeserializer().deserialize(json as never, world);
  modifierBevelRefreshScene(world);
  const model = world.children.map((object) => SolidModel.fromObject(object)).find((entry) => entry !== null);
  if (!model) throw new Error('missing reloaded solid');
  model.rebuild();
  return model;
}

/**
 * Value and label pairs of a modifier field.
 *
 * @param kind Modifier kind.
 * @param key Field key.
 * @returns Pairs, or undefined when the field is missing.
 */
function fieldChoices(kind: string, key: string): [string, string][] | undefined {
  const field = modifierStackKindFind(kind)?.fields.find((entry) => entry.key === key);
  return field?.choices?.map((choice) => [choice.value, choice.label]);
}

describe('modifier stacks saved before Center display names', () => {
  it('shows Center in inspector labels and choice names, and keeps Centre stored', () => {
    expect(modifierStackKindFind('mirror')?.fields.find((field) => field.key === 'plane')?.default).toBe(
      'Volume Centre',
    );
    expect(fieldChoices('mirror', 'plane')).toEqual([
      ['Volume Centre', 'Volume Center'],
      ['Negative Side', 'Negative Side'],
      ['Positive Side', 'Positive Side'],
    ]);
    expect(fieldChoices('shear', 'pivot')).toEqual([
      ['Centre Of Whole Input', 'Center Of Whole Input'],
      ['Centre Of Each Piece', 'Center Of Each Piece'],
      ['Volume Centre', 'Volume Center'],
    ]);
    expect(fieldChoices('arch', 'start')?.[0]).toEqual(['Centre', 'Center']);
    const radial = modifierStackKindFind('radial');
    expect(radial?.fields.find((field) => field.key === 'centreSide')?.label).toBe('Ring Center');
    expect(radial?.fields.find((field) => field.key === 'centreSide')?.key).toBe('centreSide');
    expect(radial?.fields.find((field) => field.label === 'Center From')?.key).toBe('bounds');
  });

  it('loads a level saved with those options and builds the same result', () => {
    const savedParts: string[] = [];
    for (const test of SAVED_BEFORE_CENTER_DISPLAY) {
      const fixture = stackFixture(test.steps);
      const before = compileKeys(fixture.model);
      expect(before.length, test.name).toBeGreaterThan(0);
      const json = new SceneSerializer().serialize(fixture.world);
      savedParts.push(JSON.stringify(json));
      expect(compileKeys(loadModel(json)), test.name).toEqual(before);
    }
    const saved = savedParts.join('\n');
    for (const token of STORED_CENTRE_TOKENS) expect(saved, token).toContain(token);
    expect(saved).not.toContain('Volume Center');
    expect(saved).not.toContain('Center Of Whole Input');
    expect(saved).not.toContain('Center Of Each Piece');
  });
});
