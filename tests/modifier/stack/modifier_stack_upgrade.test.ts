import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import { stackFixture } from './modifier_stack_fixture.js';
import { MODIFIER_STACK_SAVED_ON_MAIN } from './modifier_stack_saved_on_main.js';

/** A saved stack as scene data holds it. */
interface SavedStack {
  modifiers: { kind: string; parameters: Record<string, unknown> }[];
}

/**
 * Reads key=value pairs, numbers as numbers.
 *
 * @param text Pairs separated by spaces.
 * @returns Parameters.
 */
function pairs(text: string): Record<string, unknown> {
  return Object.fromEntries(
    text.split(' ').map((pair) => {
      const [key = '', value = ''] = pair.split('=');
      return [key, Number.isFinite(Number(value)) ? Number(value) : value];
    }),
  );
}

/**
 * Rounds the numbers of a value for comparison, as the main build did.
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
 * Hashes the rounded corners of every brush the way the main build did.
 *
 * @param brushes Brushes.
 * @returns Brush count and FNV-1a hash.
 */
function brushHash(brushes: readonly SolidBrushInstance[]): [number, string] {
  const text = brushes
    .map((brush) =>
      brush
        .getModelSpaceBrush()
        .vertices.map((vertex) => rounded(vertex.toArray()))
        .sort()
        .join(' '),
    )
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return [brushes.length, hash.toString(16).padStart(8, '0')];
}

/**
 * Finds the stored stack of a serialized scene entry or a loaded object.
 *
 * @param node Scene data, a loaded object, or a part of either.
 * @returns Stored stack, or undefined.
 */
function storedStack(node: unknown): SavedStack | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  const entry = node as { userData?: Record<string, unknown> } & Record<string, unknown>;
  const data = entry[MODIFIER_STACK_USERDATA_KEY] ?? entry.userData?.[MODIFIER_STACK_USERDATA_KEY];
  if (data) return data as SavedStack;
  for (const child of Array.isArray(node) ? node : Object.values(entry['children'] ?? entry['objects'] ?? entry)) {
    const found = storedStack(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Saves a one-step stack, puts the old stored values in as main wrote them,
 * loads it again and builds it.
 *
 * @param kind Modifier kind.
 * @param old Stored values in the old format.
 * @returns Loaded parameters and the built brushes' count and hash.
 */
function loadOld(
  kind: string,
  old: Record<string, unknown>,
): { parameters: Record<string, unknown>; built: [number, string] } {
  const json = structuredClone(new SceneSerializer().serialize(stackFixture([kind]).world)) as unknown;
  const stack = storedStack(json);
  if (!stack?.modifiers[0]) throw new Error('missing saved stack');
  stack.modifiers[0].parameters = { ...stack.modifiers[0].parameters, ...old };
  const world = new THREE.Group();
  new SceneDeserializer().deserialize(json as never, world);
  modifierBevelRefreshScene(world);
  const model = world.children.map((object) => SolidModel.fromObject(object)).find((entry) => entry !== null);
  if (!model) throw new Error('missing reloaded solid');
  model.rebuild();
  const loaded = storedStack(world.children.find((object) => storedStack(object))) ?? { modifiers: [] };
  return {
    parameters: loaded.modifiers[0]?.parameters ?? {},
    built: brushHash(modifierStackCompile(model.getBrushes(), model.root).instances),
  };
}

describe('modifier stacks saved on main load with their old choice values upgraded', () => {
  it.each(MODIFIER_STACK_SAVED_ON_MAIN.map((row) => [`${row[0]} ${row[1]}`, ...row] as const))(
    '%s',
    (_name, kind, old, brushes, hash) => {
      const { parameters, built } = loadOld(kind, pairs(old));
      for (const field of modifierStackKindFind(kind)?.fields ?? [])
        if (field.choices)
          expect(
            field.choices.map((choice) => choice.value),
            field.key,
          ).toContain(parameters[field.key]);
      expect(built).toEqual([brushes, hash]);
    },
  );

  it('loads an Arch saved with Style Tunnel as Tunnel, not the default', () => {
    const { parameters } = loadOld('arch', { style: 'tunnel', span: 'z', shape: 'fit', start: 'left' });
    expect(parameters).toMatchObject({ style: 'Tunnel', span: 'Along Z', shape: 'Stretch To Top', start: 'Left' });
  });
});
