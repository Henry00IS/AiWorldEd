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
  const step = modifierStackStatusRead(mesh)?.steps?.[0];
  return { brushes: result.instances, error: step?.error ?? '', outputs: step?.outputs, source: mesh };
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
 * Splits a three-number text into the X, Y and Z inputs of a modifier port.
 *
 * @param prefix Input name stem, already lower case.
 * @param text X, Y and Z with commas.
 * @returns Input values.
 */
function components(prefix: string, text: string): Record<string, string> {
  const [x, y, z] = text.split(',').map((part) => part.trim());
  return { [`${prefix}x`]: x ?? '0', [`${prefix}y`]: y ?? '0', [`${prefix}z`]: z ?? '0' };
}

/** Settings each port is checked with; scripts share the editor's axes. */
const MODIFIER_CASES: Record<string, ModifierCase[]> = {
  shear: [
    { parameters: {}, inputs: {} },
    {
      parameters: { axis: 'Z', along: 'X', mode: 'Factor', factor: 0.7, uv: 'World Aligned' },
      inputs: { axis: 'Z', along: 'X', mode: 'Factor', factor: '0.7', uv: 'World Aligned' },
    },
    { parameters: { axis: 'Y', along: 'Z', angle: -35 }, inputs: { axis: 'Y', along: 'Z', angle: '-35' } },
  ],
  linear: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 4, mode: 'Fixed Step', offsetX: 0, offsetY: 1.5, offsetZ: 2 },
      inputs: { count: '4', mode: 'Fixed Step', ...components('offset', '0, 1.5, 2') },
    },
    {
      parameters: {
        count: 3,
        mode: 'Size × Plus Step',
        offsetX: 0.5,
        offsetY: 0,
        offsetZ: 0,
        relativeX: 0,
        relativeY: 1,
        relativeZ: 1,
      },
      inputs: {
        count: '3',
        mode: 'Size × Plus Step',
        ...components('offset', '0.5, 0, 0'),
        ...components('relative', '0, 1, 1'),
      },
    },
    {
      parameters: { count: 5, mode: 'Fit Distance', endpointX: 0, endpointY: 0, endpointZ: -6, uv: 'World Aligned' },
      inputs: { count: '5', mode: 'Fit Distance', ...components('endpoint', '0, 0, -6'), uv: 'World Aligned' },
    },
    {
      parameters: { count: 3, uvShiftU: 0.5, uvShiftV: -0.25 },
      inputs: { count: '3', uvshiftu: '0.5', uvshiftv: '-0.25' },
    },
  ],
  radial: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 5, mode: 'Arc', sweep: 120, axis: 'Z', rise: 0.5, centreSide: 'Right', radius: 3 },
      inputs: { count: '5', mode: 'Arc', sweep: '120', axis: 'Z', rise: '0.5', centreside: 'Right', radius: '3' },
    },
    {
      parameters: { count: 3, mode: 'Angle Step', step: 40, rotateCopies: false, uv: 'World Aligned' },
      inputs: { count: '3', mode: 'Angle Step', step: '40', rotatecopies: 'false', uv: 'World Aligned' },
    },
    {
      parameters: {
        count: 6,
        origin: 'Around Pivot',
        start: 30,
        radiusOffset: 1,
        pivotX: 0.5,
        pivotY: 0,
        pivotZ: 1,
        axis: 'X',
      },
      inputs: {
        count: '6',
        origin: 'Around Pivot',
        start: '30',
        radiusoffset: '1',
        ...components('pivot', '0.5, 0, 1'),
        axis: 'X',
      },
    },
    { parameters: { count: 4, centreSide: 'Up', axis: 'Y' }, inputs: { count: '4', centreside: 'Up', axis: 'Y' } },
    {
      parameters: { count: 1, origin: 'Around Pivot', start: 45 },
      inputs: { count: '1', origin: 'Around Pivot', start: '45' },
    },
  ],
  transform: [
    { parameters: {}, inputs: {} },
    {
      parameters: { count: 5, offsetX: 0.5, offsetY: 0.25, offsetZ: -1, rotationX: 10, rotationY: 30, rotationZ: -20 },
      inputs: { count: '5', ...components('offset', '0.5, 0.25, -1'), ...components('rotation', '10, 30, -20') },
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
        uv: 'World Aligned',
      },
      inputs: {
        count: '4',
        ...components('offset', '0, 0, 0'),
        ...components('relative', '1, 0, 0.5'),
        ...components('rotation', '0, 45, 0'),
        ...components('pivot', '1, 0, -2'),
        uv: 'World Aligned',
      },
    },
    { parameters: { count: 1 }, inputs: { count: '1' } },
  ],
  mirror: [
    { parameters: {}, inputs: {} },
    {
      parameters: { axis: 'Y', plane: 'Negative Side', planeOffset: -0.5 },
      inputs: { axis: 'Y', plane: 'Negative Side', planeoffset: '-0.5' },
    },
    {
      parameters: { axis: 'Z', plane: 'Positive Side', uv: 'World Aligned' },
      inputs: { axis: 'Z', plane: 'Positive Side', uv: 'World Aligned' },
    },
    {
      parameters: { axis: 'X', plane: 'Positive Side', planeOffset: 1 },
      inputs: { axis: 'X', plane: 'Positive Side', planeoffset: '1' },
    },
    {
      parameters: { bisect: true },
      inputs: { bisect: 'Yes' },
    },
    {
      parameters: { bisect: true, flip: true, axis: 'Y' },
      inputs: { bisect: 'Yes', flip: 'Yes', axis: 'Y' },
    },
    {
      parameters: { bisect: true, plane: 'Negative Side', planeOffset: 0.25 },
      inputs: { bisect: 'Yes', plane: 'Negative Side', planeoffset: '0.25' },
    },
    {
      parameters: { readable: false },
      inputs: { readable: 'No' },
    },
    {
      parameters: { uvShiftU: 0.25, uvShiftV: 0.5 },
      inputs: { uvshiftu: '0.25', uvshiftv: '0.5' },
    },
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
        expect(brushKeys(port.brushes), rounded(test)).toEqual(brushKeys(builtIn.brushes));
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

describe('SolidScript modifiers that read the brushes they receive', () => {
  it('Push Out Faces swaps the brush for six slabs pushed out from its faces', () => {
    const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === 'pushOutFaces')!;
    const script = solidScriptDocumentUsesWith(solidScriptDocumentCreate(example.lines, example.name), example.uses!);
    const { brushes, error, outputs, source } = compiled(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, {
      script,
      inputs: {},
    });
    expect(error).toBe('');
    // Six slabs come out; the received brush does not.
    expect(outputs).toBe(6);
    const slabs = brushes.filter((brush) => brush.mesh !== source);
    expect(slabs).toHaveLength(6);
    // The received brush spans 0..2, 0..1 and -2.25..-1.75; every slab is 0.1 thick and 0.25 off it.
    const received = new THREE.Box3(new THREE.Vector3(0, 0, -2.25), new THREE.Vector3(2, 1, -1.75));
    for (const slab of slabs) {
      const bounds = new THREE.Box3().setFromPoints(
        slab
          .getModelSpaceBrush()
          .vertices.map((vertex) => vertex.clone().applyMatrix4(slab.mesh?.matrixWorld ?? new THREE.Matrix4())),
      );
      expect(bounds.intersectsBox(received.clone().expandByScalar(0.2))).toBe(false);
      expect(bounds.intersectsBox(received.clone().expandByScalar(0.3))).toBe(true);
      const size = bounds.getSize(new THREE.Vector3());
      expect(Math.min(size.x, size.y, size.z)).toBeCloseTo(0.1);
    }
  });

  it('outputs only what the script builds, like a generator, unless Input Brushes passes the brushes on', () => {
    const uses = { generator: false, modifier: true };
    const outputs = (lines: { command: string }[]) =>
      compiled(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, {
        script: solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Output'), uses),
      }).outputs;
    expect(outputs([{ command: 'cube' }])).toBe(1);
    expect(outputs([{ command: 'input_brushes' }, { command: 'cube' }])).toBe(2);
  });
});
