import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackCacheOf } from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackSolidScriptRunStart } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_received.js';
import { modifierStackSolidScriptBoxPose } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_box.js';
import * as layout from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_layout.js';
import { panelPropertiesEulerDegrees } from '@/ui/properties/panel_properties_numbers.js';

/**
 * A script that may be used both ways.
 *
 * @param lines Lines.
 * @returns Script.
 */
function both(...lines: SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Both'), { generator: true, modifier: true });
}

/**
 * Echoes Box and Usage from a run start.
 *
 * @param start Run start.
 * @returns Echoed text, or the error.
 */
function echoStart(start: ReturnType<typeof modifierStackSolidScriptRunStart>): { text: string; warnings: string[] } {
  const run = solidScriptProgramRun(
    solidScriptDocumentCreate([
      {
        command: 'echo',
        values: {
          value:
            '[$Script.Usage] [$Box.Width] [$Box.Height] [$Box.Depth] [$Box.Min] [$Box.Max] [$Box.Position] [$Box.Rotation] [$Box.Scale]',
        },
      },
      { command: 'cube' },
    ]),
    { ...start, context: 'preview' },
  );
  return { text: run.error ? run.error.message : (run.messages[0] ?? ''), warnings: run.warnings.map((w) => w.text) };
}

/**
 * Builds a SolidScript generator in a solid, with an optional parent group.
 *
 * @param script Script, or the default.
 * @returns Fixture parts.
 */
function generatorFixture(script?: unknown) {
  const world = new THREE.Group();
  const model = new SolidModel('Box pose generator');
  world.add(model.root);
  const parent = new THREE.Group();
  model.root.add(parent);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  if (script !== undefined) {
    const settings = ModifierVolume.read(node);
    const [first, ...rest] = settings.modifiers;
    ModifierVolume.write(node, {
      ...settings,
      modifiers: [{ ...first!, parameters: { ...first!.parameters, script } }, ...rest],
    });
  }
  parent.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]!.id;
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { world, model, parent, node, stepId, compile };
}

/**
 * Builds a modifier volume around a small box brush, running a SolidScript
 * modifier.
 *
 * @param script Script.
 * @returns Fixture parts.
 */
function volumeFixture(script: unknown) {
  const world = new THREE.Group();
  const model = new SolidModel('Box pose volume');
  world.add(model.root);
  model.addBoxBrush(0.25, SolidOperation.Additive);
  const parent = new THREE.Group();
  world.add(parent);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = script;
  const volume = ModifierVolume.create({ modifiers: [entry] });
  parent.add(volume);
  const stepId = ModifierVolume.read(volume).modifiers[0]!.id;
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { world, model, parent, volume, stepId, compile };
}

/**
 * Writes a vector as the echo format.
 *
 * @param values Components.
 * @returns Text such as [1, 2, 3].
 */
function vectorText(values: readonly number[]): string {
  const parts = values.map((value) => {
    const rounded = Math.round(value * 1e6) / 1e6;
    return Object.is(rounded, -0) ? 0 : rounded;
  });
  return `[${parts.join(', ')}]`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SolidScript $Box from a generator or modifier volume', () => {
  it('matches the inspector pose of a moved, rotated and scaled generator', () => {
    const fixture = generatorFixture();
    fixture.node.position.set(1.5, 2, -3);
    fixture.node.rotation.set(THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(30));
    fixture.node.scale.set(2, 0.5, 3);
    fixture.world.updateMatrixWorld(true);
    const start = modifierStackSolidScriptRunStart(fixture.node, fixture.stepId, 'generator');
    expect(start.use?.usage).toBe('Generator');
    expect(start.box).toEqual([2, 0.5, 3]);
    expect(start.pose.position).toEqual([1.5, 2, -3]);
    expect(start.pose.rotation.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([10, 20, 30]);
    expect(start.pose.scale).toEqual([2, 0.5, 3]);
    expect(start.corners).toEqual({ min: [-1, -0.25, -1.5], max: [1, 0.25, 1.5] });
    expect(start.pose.position).toEqual(fixture.node.position.toArray());
    expect(start.pose.rotation.map((value) => Math.round(value * 1e6) / 1e6)).toEqual(
      panelPropertiesEulerDegrees(fixture.node.rotation)
        .toArray()
        .map((value) => Math.round(value * 1e6) / 1e6),
    );
    expect(start.pose.scale).toEqual(fixture.node.scale.toArray());
    const echoed = echoStart(start);
    expect(echoed.warnings).toEqual([]);
    expect(echoed.text).toContain('Generator');
    expect(echoed.text).toContain(vectorText(start.pose.position));
  });

  it('includes a parent transform in the world pose, including a negative scale', () => {
    const fixture = generatorFixture();
    fixture.parent.position.set(10, 0, 0);
    fixture.parent.rotation.set(0, THREE.MathUtils.degToRad(90), 0);
    fixture.parent.scale.set(1, -2, 1);
    fixture.node.position.set(2, 0, 0);
    fixture.world.updateMatrixWorld(true);
    const start = modifierStackSolidScriptRunStart(fixture.node, fixture.stepId, 'generator');
    const expected = modifierStackSolidScriptBoxPose(fixture.node);
    expect(start.pose.position.map((value) => Math.round(value * 1e5) / 1e5)).toEqual(
      expected.position.map((value) => Math.round(value * 1e5) / 1e5),
    );
    expect(start.pose.rotation.map((value) => Math.round(value * 1e5) / 1e5)).toEqual(
      expected.rotation.map((value) => Math.round(value * 1e5) / 1e5),
    );
    expect(start.pose.scale.map((value) => Math.round(value * 1e5) / 1e5)).toEqual(
      expected.scale.map((value) => Math.round(value * 1e5) / 1e5),
    );
    const world = new THREE.Vector3();
    fixture.node.getWorldPosition(world);
    expect(start.pose.position[0]).toBeCloseTo(world.x, 5);
    expect(start.pose.position[1]).toBeCloseTo(world.y, 5);
    expect(start.pose.position[2]).toBeCloseTo(world.z, 5);
  });

  it('gives Script.Usage Modifier and $Box from a moved, rotated and scaled volume, not the received brush', () => {
    const script = both(
      { command: 'input_brushes' },
      { command: 'echo', values: { value: '[$Script.Usage] [$Box.Size] [$Box.Position]' } },
    );
    const fixture = volumeFixture(script);
    fixture.volume.scale.set(4, 2, 6);
    fixture.compile();
    fixture.volume.position.set(3, 4, 5);
    fixture.volume.rotation.set(0, THREE.MathUtils.degToRad(45), 0);
    fixture.world.updateMatrixWorld(true);
    const start = modifierStackSolidScriptRunStart(fixture.volume, fixture.stepId, 'modifier');
    expect(start.use?.usage).toBe('Modifier');
    expect(start.box.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([4, 2, 6]);
    expect(start.pose.position.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([3, 4, 5]);
    expect(start.pose.rotation[1]).toBeCloseTo(45, 5);
    expect(start.pose.scale.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([4, 2, 6]);
    const echoed = echoStart(start);
    expect(echoed.text.startsWith('Modifier ')).toBe(true);
    expect(echoed.warnings).toEqual([]);
    expect(start.use?.solids.length).toBeGreaterThan(0);
  });

  it('builds again when a generator that reads $Box.Position is moved, and follows when it does not', () => {
    const reading = both({ command: 'cube', values: { size: '[=[$Box.Position.X] + 1], 1, 1' } });
    const silent = both({ command: 'cube', values: { size: '1, 1, 1' } });
    const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND)!;
    expect(kind.volumePoseFollow({ [MODIFIER_STACK_SOLID_SCRIPT_KEY]: reading })).toBeNull();
    expect(kind.volumePoseFollow({ [MODIFIER_STACK_SOLID_SCRIPT_KEY]: silent })).toBe('rigid');
    expect(
      kind.volumePoseFollow({
        [MODIFIER_STACK_SOLID_SCRIPT_KEY]: both({ command: 'echo', values: { value: '[$Box.Rotation]' } }),
      }),
    ).toBe('translate');
    const fixture = generatorFixture(reading);
    fixture.compile();
    const spy = vi.spyOn(layout, 'modifierStackSolidScriptLayout');
    fixture.node.position.set(2, 0, 0);
    fixture.compile();
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    const quiet = generatorFixture(silent);
    quiet.compile();
    spy.mockClear();
    modifierStackCacheOf(quiet.model.root);
    quiet.node.position.set(2, 0, 0);
    quiet.compile();
    expect(spy).not.toHaveBeenCalled();
  });
});
