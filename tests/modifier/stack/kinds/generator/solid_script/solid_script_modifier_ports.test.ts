import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
} from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/** Parameters of the built-in modifier, and the matching inputs of its port. */
interface ModifierCase {
  parameters: Record<string, unknown>;
  inputs: Record<string, string>;
}

/**
 * Compiles a stretched, moved box brush whose stack holds one modifier.
 *
 * @param kind Modifier kind.
 * @param parameters Its parameters.
 * @returns Output brushes and the step error.
 */
function compiled(kind: string, parameters: Record<string, unknown>) {
  const world = new THREE.Group();
  const model = new SolidModel('Modifier port test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  source.scale.set(2, 1, 0.5);
  source.position.set(1, 0.5, -2);
  const mesh = source.mesh as THREE.Mesh;
  mesh.position.copy(source.position);
  mesh.scale.copy(source.scale);
  const entry = modifierStackEntryCreate(kind, []);
  Object.assign(entry.parameters, parameters);
  modifierStackOwnerDecode(mesh, { modifiers: [entry] });
  world.updateMatrixWorld(true);
  const result = modifierStackCompile(model.getBrushes(), model.root);
  return { brushes: result.instances, error: modifierStackStatusRead(mesh)?.steps?.[0]?.error ?? '' };
}

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
 * Corners and face textures of each brush, sorted, in model space.
 *
 * @param brushes Brushes.
 * @returns Keys.
 */
function brushKeys(brushes: readonly SolidBrushInstance[]): string[] {
  return brushes
    .map((brush) => {
      const corners = brush
        .getModelSpaceBrush()
        .vertices.map((vertex) => rounded(vertex.toArray()))
        .sort();
      const faces = brush.brush.faces.map((_, index) => rounded(brush.getFaceSurface(index))).sort();
      return `${corners.join(' ')} | ${faces.join(' ')}`;
    })
    .sort();
}

/**
 * Runs a built-in modifier and its SolidScript port with the same settings.
 *
 * @param id Modifier kind and example id.
 * @param test Settings.
 * @returns Both outputs.
 */
function both(id: string, test: ModifierCase) {
  const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === id);
  if (!example?.uses) throw new Error(`no modifier example ${id}`);
  const script = solidScriptDocumentUsesWith(solidScriptDocumentCreate(example.lines, example.name), example.uses);
  const port = compiled(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, { script, inputs: test.inputs });
  const builtIn = compiled(id, test.parameters);
  return { port, builtIn };
}

/**
 * Settings each port is checked with. Editor vectors (x, y, z) are script (x,
 * -z, y).
 */
const MODIFIER_CASES: Record<string, ModifierCase[]> = {
  shear: [
    { parameters: {}, inputs: {} },
    {
      parameters: { axis: 'z', along: 'x', mode: 'factor', factor: 0.7, uv: 'world' },
      inputs: { axis: 'z', along: 'x', mode: 'factor', factor: '0.7', uv: 'world' },
    },
    { parameters: { axis: 'y', along: 'z', angle: -35 }, inputs: { axis: 'y', along: 'z', angle: '-35' } },
  ],
  linear: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 4, mode: 'fixed', offsetX: 0, offsetY: 1.5, offsetZ: 2 },
      inputs: { count: '4', mode: 'fixed', offset: '0, -2, 1.5' },
    },
    {
      parameters: {
        count: 3,
        mode: 'both',
        offsetX: 0.5,
        offsetY: 0,
        offsetZ: 0,
        relativeX: 0,
        relativeY: 1,
        relativeZ: 1,
      },
      inputs: { count: '3', mode: 'both', offset: '0.5, 0, 0', relative: '0, -1, 1' },
    },
    {
      parameters: { count: 5, mode: 'fit', endpointX: 0, endpointY: 0, endpointZ: -6, uv: 'world' },
      inputs: { count: '5', mode: 'fit', endpoint: '0, 6, 0', uv: 'world' },
    },
  ],
  radial: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 5, mode: 'arc', sweep: 120, axis: 'z', rise: 0.5, centreSide: '+x', radius: 3 },
      inputs: { count: '5', mode: 'arc', sweep: '120', axis: 'z', rise: '0.5', centreside: '+x', radius: '3' },
    },
    {
      parameters: { count: 3, mode: 'step', step: 40, rotateCopies: false, uv: 'world' },
      inputs: { count: '3', mode: 'step', stepangle: '40', rotatecopies: 'false', uv: 'world' },
    },
    {
      parameters: {
        count: 6,
        origin: 'centre',
        start: 30,
        radiusOffset: 1,
        pivotX: 0.5,
        pivotY: 0,
        pivotZ: 1,
        axis: 'x',
      },
      inputs: { count: '6', origin: 'centre', start: '30', radiusoffset: '1', pivot: '0.5, -1, 0', axis: 'x' },
    },
    { parameters: { count: 4, centreSide: '+y', axis: 'y' }, inputs: { count: '4', centreside: '+y', axis: 'y' } },
    { parameters: { count: 1, origin: 'centre', start: 45 }, inputs: { count: '1', origin: 'centre', start: '45' } },
  ],
  transform: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 5, offsetX: 0.5, offsetY: 0.25, offsetZ: -1, rotationX: 10, rotationY: 30, rotationZ: -20 },
      inputs: { count: '5', offset: '0.5, 1, 0.25', rotation: '10, 20, 30' },
    },
    {
      parameters: {
        count: 4,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        relativeX: 1,
        relativeY: 0,
        relativeZ: 0.5,
        rotationX: 0,
        rotationY: 45,
        rotationZ: 0,
        pivotX: 1,
        pivotY: 0,
        pivotZ: -2,
        uv: 'world',
      },
      inputs: {
        count: '4',
        offset: '0, 0, 0',
        relative: '1, -0.5, 0',
        rotation: '0, 0, 45',
        pivot: '1, 2, 0',
        uv: 'world',
      },
    },
    { parameters: { count: 1 }, inputs: { count: '1' } },
  ],
  mirror: [
    { parameters: {}, inputs: {} },
    {
      parameters: { axis: 'y', plane: 'min', planeOffset: -0.5 },
      inputs: { axis: 'y', plane: 'min', planeoffset: '-0.5' },
    },
    { parameters: { axis: 'z', plane: 'max', uv: 'world' }, inputs: { axis: 'z', plane: 'max', uv: 'world' } },
    { parameters: { axis: 'x', plane: 'max', planeOffset: 1 }, inputs: { axis: 'x', plane: 'max', planeoffset: '1' } },
  ],
};

describe('SolidScript ports of the modifiers', () => {
  for (const example of SOLID_SCRIPT_EXAMPLES.filter((entry) => entry.modifier)) {
    it(`${example.name} changes the brushes it receives like the ${example.modifier} modifier`, () => {
      const cases = MODIFIER_CASES[example.modifier ?? ''] ?? [];
      expect(cases.length).toBeGreaterThan(0);
      for (const test of cases) {
        const { port, builtIn } = both(example.modifier ?? '', test);
        expect(port.error, rounded(test)).toBe('');
        expect(port.brushes.length, rounded(test)).toBe(builtIn.brushes.length);
        expect(brushKeys(port.brushes)).toEqual(brushKeys(builtIn.brushes));
      }
    });
  }

  it('lists the modifier ports under Built-In Modifiers, usable as modifiers only', () => {
    const ports = SOLID_SCRIPT_EXAMPLES.filter((entry) => entry.group === 'Built-In Modifiers');
    expect(ports.map((entry) => entry.name)).toEqual([
      'Shear',
      'Linear Array',
      'Radial Array',
      'Transform Array',
      'Mirror',
    ]);
    for (const port of ports) expect(port.uses).toEqual({ generator: false, modifier: true });
  });
});
