import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { surfaceUvApplyPolicy } from '@/texture/uv_matrix/surface_uv_policy.js';

const END: SolidScriptLine = { command: 'end' };
const FIXTURE = path.resolve('tests/fixtures/bug-ss-mesh-different-uvs-than-input-brushes.json');
const WORLD = 'World Aligned';
const COPIED = 'Move With Shape';

/** One compiled modifier result used for UV comparison. */
interface CompiledUvs {
  /** Visible output brushes, in compile order. */
  brushes: SolidBrushInstance[];
  /** Helper meshes SolidScript showed, as sorted corner samples. */
  meshes: string[];
  /** First stack error, or empty. */
  error: string;
}

/**
 * Rounds a number so UV and position comparisons ignore float noise.
 *
 * @param value Number.
 * @returns Rounded value.
 */
function rounded(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0;
}

/**
 * A line, with extra field values merged in.
 *
 * @param command Command id.
 * @param values Fields.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * An Input Brushes line, optionally with Textures and always writing Into Copy.
 *
 * @param textures Move With Shape or World Aligned, or empty to leave it off.
 * @returns Line.
 */
function inputBrushes(textures = ''): SolidScriptLine {
  return line('input_brushes', { into: 'Copy', ...(textures === '' ? {} : { textures }) });
}

/**
 * A Transform UVs line that sets Textures on [Copy].
 *
 * @param textures Move With Shape or World Aligned.
 * @returns Line.
 */
function transformUvs(textures: string): SolidScriptLine {
  return line('transform_uvs', { textures, of: '[Copy]' });
}

/**
 * Outputs the [Copy] list, so later Of-tools and Into writes become visible.
 *
 * @returns Line.
 */
function outputCopy(): SolidScriptLine {
  return line('output', { of: '[Copy]' });
}

/**
 * Adds Output [Copy] after a brush-output script.
 *
 * @param lines Script lines.
 * @returns Lines.
 */
function stamped(lines: readonly SolidScriptLine[]): SolidScriptLine[] {
  return [...lines, outputCopy()];
}

/**
 * Wraps lines in a block and its End.
 *
 * @param command Opening line.
 * @param inner Lines inside the block.
 * @returns Lines.
 */
function block(command: SolidScriptLine, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return [command, ...inner, END];
}

/**
 * Input Brushes with Textures set on the line itself, inside the same template.
 *
 * @param textures Input Brushes Textures.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Lines.
 */
function texturesOnInput(textures: string, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return withInput(textures, inner);
}

/**
 * Replaces a placeholder Input Brushes in a template with one that has
 * Textures.
 *
 * @param textures Input Brushes Textures.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Lines.
 */
function withInput(textures: string, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return inner.map((entry) => (entry.command === 'input_brushes' ? inputBrushes(textures) : entry));
}

/**
 * Input Brushes with no Textures, then the same later edits, then Transform
 * UVs.
 *
 * @param textures Transform UVs Textures.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Lines.
 */
function texturesAfter(textures: string, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return [...withInput('', inner), transformUvs(textures)];
}

/**
 * The same lines, baked through Mesh From Brushes.
 *
 * @param inner Lines that build the brushes.
 * @returns Lines.
 */
function meshed(inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return block(line('mesh_brushes'), [...inner]);
}

/**
 * Local points of one brush face, in face-loop order.
 *
 * @param brush Brush.
 * @param index Face index.
 * @returns Points.
 */
function facePoints(brush: SolidBrushInstance, index: number): THREE.Vector3[] {
  const face = brush.brush.faces[index];
  if (!face) return [];
  return brush.brush.getFaceVertexIndices(face).flatMap((vertex) => {
    const point = brush.brush.vertices[vertex];
    return point ? [point] : [];
  });
}

/**
 * Adds a UV shift to every face of a brush, so the source mapping is not
 * default.
 *
 * @param brush Brush.
 * @param shiftU Tiles added to U.
 * @param shiftV Tiles added to V.
 */
function shiftBrushUvs(brush: SolidBrushInstance, shiftU: number, shiftV: number): void {
  for (let index = 0; index < brush.brush.faces.length; index++) {
    const surface = brush.getFaceSurface(index);
    const points = facePoints(brush, index);
    brush.setFaceSurface(index, {
      ...surface,
      uv: surfaceUvApplyPolicy(surface.uv, points, null, false, shiftU, shiftV),
    });
  }
}

/**
 * Sorted world-position and UV samples of every face corner of a brush.
 *
 * @param brush Brush.
 * @returns Samples.
 */
function brushSamples(brush: SolidBrushInstance): string[] {
  const toModel = brush.getModelSpaceMatrix();
  const samples: string[] = [];
  for (let index = 0; index < brush.brush.faces.length; index++) {
    const mapping = brush.getFaceSurface(index).uv;
    for (const point of facePoints(brush, index)) {
      const world = point.clone().applyMatrix4(toModel);
      const uv = mapping.project(point);
      samples.push(`${rounded(world.x)},${rounded(world.y)},${rounded(world.z)}:${rounded(uv.u)},${rounded(uv.v)}`);
    }
  }
  return samples.sort();
}

/**
 * Signature of a compiled brush: bounds, then every corner sample.
 *
 * @param brush Brush.
 * @returns Signature.
 */
function brushSignature(brush: SolidBrushInstance): string {
  const box = brush.getModelSpaceBounds();
  const bounds = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map(rounded);
  return `${bounds.join(',')}|${brushSamples(brush).join(';')}`;
}

/**
 * Sorted world-position and UV samples of a mesh's display corners.
 *
 * @param mesh Mesh with position and uv.
 * @returns Samples.
 */
function meshSamples(mesh: THREE.Mesh): string[] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  if (!position || !uv) return [];
  const samples: string[] = [];
  for (let index = 0; index < position.count; index++) {
    const world = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index));
    world.applyMatrix4(mesh.matrixWorld);
    samples.push(
      `${rounded(world.x)},${rounded(world.y)},${rounded(world.z)}:${rounded(uv.getX(index))},${rounded(uv.getY(index))}`,
    );
  }
  return samples.sort();
}

/**
 * Compiles a SolidScript modifier on a 1 m box with shifted UVs.
 *
 * @param lines Script lines.
 * @returns Compiled output.
 */
function compileModifier(lines: readonly SolidScriptLine[]): CompiledUvs {
  const world = new THREE.Group();
  const model = new SolidModel('Textures equivalence');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  shiftBrushUvs(source, 0.25, -0.1);
  const mesh = source.mesh as THREE.Mesh;
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = scriptDocument(lines);
  modifierStackOwnerDecode(mesh, { modifiers: [entry] });
  world.updateMatrixWorld(true);
  const compiled = modifierStackCompile(model.getBrushes(), model.root);
  const brushes = compiled.instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
  return {
    brushes,
    meshes: modifierStackMeshesShown(mesh).map((item) => meshSamples(item).join(';')),
    error: modifierStackStatusRead(mesh)?.steps?.[0]?.error ?? '',
  };
}

/**
 * Fingerprint of a compiled result, for equality.
 *
 * @param result Compiled output.
 * @returns Fingerprint.
 */
function signatureOf(result: CompiledUvs): string {
  return `err=${result.error}|brushes=${result.brushes.map(brushSignature).join('/')}|meshes=${result.meshes.join('/')}`;
}

/**
 * Numeric UV deltas between two sample lists of the same length and positions.
 *
 * @param left Samples from the Input Brushes Textures script.
 * @param right Samples from the Transform UVs script.
 * @returns Deltas, each as position, left UV, right UV and difference.
 */
function sampleDeltas(left: readonly string[], right: readonly string[]): string[] {
  const onlyLeft = left.filter((sample) => !right.includes(sample));
  const onlyRight = right.filter((sample) => !left.includes(sample));
  return onlyLeft.length === 0 && onlyRight.length === 0 ? [] : positionDeltas(onlyLeft, onlyRight);
}

/**
 * Pairs leftover samples that share a position, then lists anything unmatched.
 *
 * @param left Samples only on the Input Brushes Textures result.
 * @param right Samples only on the Transform UVs result.
 * @returns Delta lines.
 */
function positionDeltas(left: readonly string[], right: readonly string[]): string[] {
  const remaining = [...right];
  const rows: string[] = [];
  for (const sample of left) {
    const at = sample.split(':')[0] ?? '';
    const match = remaining.findIndex((entry) => entry.startsWith(`${at}:`));
    if (match < 0) {
      rows.push(`only input ${sample}`);
      continue;
    }
    const row = sampleDelta(sample, remaining[match]);
    remaining.splice(match, 1);
    if (row) rows.push(row);
  }
  return [...rows, ...remaining.map((sample) => `only later ${sample}`)];
}

/**
 * One sample pair as a delta line, or none when they match or positions differ.
 *
 * @param left Left sample, or missing.
 * @param right Right sample, or missing.
 * @returns Line, or null when they match.
 */
function sampleDelta(left: string | undefined, right: string | undefined): string | null {
  if (left === right) return null;
  if (!left || !right) return `missing ${left ?? 'left'} vs ${right ?? 'right'}`;
  const [leftAt, leftUv] = left.split(':');
  const [rightAt, rightUv] = right.split(':');
  if (leftAt !== rightAt) return `pos ${left} vs ${right}`;
  const [lu, lv] = (leftUv ?? '0,0').split(',').map(Number);
  const [ru, rv] = (rightUv ?? '0,0').split(',').map(Number);
  return `pos ${leftAt} input=${leftUv} later=${rightUv} dU=${rounded(ru - lu)} dV=${rounded(rv - lv)}`;
}

/**
 * Describes how two compiled results differ, with UV numbers.
 *
 * @param left Input Brushes Textures result.
 * @param right Transform UVs result.
 * @returns Lines, or empty when they match.
 */
function difference(left: CompiledUvs, right: CompiledUvs): string[] {
  if (signatureOf(left) === signatureOf(right)) return [];
  const lines: string[] = [];
  if (left.error !== right.error) lines.push(`error input=${left.error} later=${right.error}`);
  if (left.brushes.length !== right.brushes.length)
    lines.push(`brush count input=${left.brushes.length} later=${right.brushes.length}`);
  const count = Math.max(left.brushes.length, right.brushes.length);
  for (let index = 0; index < count; index++) {
    const first = left.brushes[index];
    const second = right.brushes[index];
    if (!first || !second) {
      lines.push(`brush ${index} missing`);
      continue;
    }
    lines.push(...sampleDeltas(brushSamples(first), brushSamples(second)).map((row) => `brush ${index} ${row}`));
  }
  lines.push(...meshDifference(left.meshes, right.meshes));
  return lines;
}

/**
 * Describes mesh-corner UV differences.
 *
 * @param left Input Brushes Textures mesh samples.
 * @param right Transform UVs mesh samples.
 * @returns Lines.
 */
function meshDifference(left: readonly string[], right: readonly string[]): string[] {
  if (left.length !== right.length) return [`mesh count input=${left.length} later=${right.length}`];
  const lines: string[] = [];
  for (let index = 0; index < left.length; index++) {
    const first = (left[index] ?? '').split(';').filter(Boolean);
    const second = (right[index] ?? '').split(';').filter(Boolean);
    lines.push(...sampleDeltas(first, second).map((row) => `mesh ${index} ${row}`));
  }
  return lines;
}

/**
 * Compares Input Brushes Textures with Transform UVs Textures for one template.
 *
 * @param name Case name.
 * @param textures Move With Shape or World Aligned.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Difference lines, empty when they match.
 */
function comparePair(name: string, textures: string, inner: readonly SolidScriptLine[]): string[] {
  const left = compileModifier(stamped(texturesOnInput(textures, inner)));
  const right = compileModifier(stamped(texturesAfter(textures, inner)));
  return difference(left, right).map((row) => `${name} ${textures}: ${row}`);
}

/**
 * Compares both texture policies for one template, and checks they differ when
 * the script moves the brushes.
 *
 * @param name Case name.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @param mustDiffer True when World Aligned must not match Move With Shape.
 * @returns Difference lines from the pair comparisons, plus a policy-sameness
 *   failure when mustDiffer is true and the policies match.
 */
function compareCase(name: string, inner: readonly SolidScriptLine[], mustDiffer: boolean): string[] {
  const rows = [...comparePair(name, WORLD, inner), ...comparePair(name, COPIED, inner)];
  if (!mustDiffer) return rows;
  const world = signatureOf(compileModifier(stamped(texturesOnInput(WORLD, inner))));
  const copied = signatureOf(compileModifier(stamped(texturesOnInput(COPIED, inner))));
  if (world === copied)
    rows.push(`${name}: World Aligned matched Move With Shape, so the case does not test the option`);
  return rows;
}

/**
 * Compares the two ways of setting Textures when the result is baked to a mesh.
 * Transform UVs stays inside Mesh From Brushes, after the moves.
 *
 * @param name Case name.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Difference lines.
 */
function compareMeshes(name: string, inner: readonly SolidScriptLine[], worldToo: boolean): string[] {
  const label = `Mesh From Brushes ${name}`;
  const rows = [...compareMeshed(label, COPIED, inner)];
  return worldToo ? [...rows, ...compareMeshed(label, WORLD, inner)] : rows;
}

/**
 * Compiles both scripts baked through Mesh From Brushes and lists UV
 * differences.
 *
 * @param name Case name.
 * @param textures Move With Shape or World Aligned.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Difference lines.
 */
function compareMeshed(name: string, textures: string, inner: readonly SolidScriptLine[]): string[] {
  const left = compileVolume(meshed(stamped(texturesOnInput(textures, inner))));
  const right = compileVolume(meshed(stamped(texturesAfter(textures, inner))));
  const rows = difference(left, right).map((row) => `${name} ${textures}: ${row}`);
  if (left.meshes.every((mesh) => mesh === '') && right.meshes.every((mesh) => mesh === ''))
    rows.push(`${name} ${textures}: both scripts showed no mesh`);
  return rows;
}

/** Templates whose moves happen around Input Brushes. */
function aroundCases(): [string, SolidScriptLine[], boolean][] {
  const input = inputBrushes();
  return [
    ['no move', [input], false],
    ['Transform Move', block(line('transform', { move: '2, 0, 0' }), [input]), true],
    ['Transform Rotate', block(line('transform', { rotate: '0, 45, 0' }), [input]), true],
    ['Transform Scale', block(line('transform', { scale: '2, 1, 0.5' }), [input]), true],
    [
      'Transform Move Rotate Scale',
      block(line('transform', { move: '1.5, 0.25, -0.5', rotate: '15, 30, -10', scale: '1.25, 0.8, 1.1' }), [input]),
      true,
    ],
    [
      'Repeat and Transform Move',
      block(
        line('repeat', { variable: 'I', from: '0', to: '3' }),
        block(line('transform', { move: '[=[I] * 2], 0, 0' }), [input]),
      ),
      true,
    ],
  ];
}

/** Templates whose moves come after Input Brushes, with Of [Copy]. */
function afterCases(): [string, SolidScriptLine[], boolean][] {
  const input = inputBrushes();
  const of = { of: '[Copy]' };
  return [
    ['Move By', [input, line('move_by', { by: '2, 0, 0', ...of })], true],
    ['Rotate By', [input, line('rotate_by', { by: '0, 30, 0', ...of })], true],
    ['Mirror', [input, line('mirror', { v: '1, 0, 0', ...of })], true],
    [
      'Move By, Rotate By and Scale By',
      [
        input,
        line('move_by', { by: '1, 0.5, 0', ...of }),
        line('rotate_by', { by: '0, 20, 0', ...of }),
        line('scale_by', { by: '1.5, 1, 1', ...of }),
      ],
      true,
    ],
  ];
}

/**
 * Loads the transferred level and returns its solid and modifier volume.
 *
 * @returns World, solid, and volume.
 */
function loadLevel(): { world: THREE.Group; model: SolidModel; volume: THREE.Object3D } {
  const world = new THREE.Group();
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as SceneJSON;
  new SceneDeserializer().deserialize(data, world);
  world.updateMatrixWorld(true);
  const model = world.children.map((child) => SolidModel.fromObject(child)).find((found) => found !== null);
  const volume = world.children.find((child) => ModifierVolume.isVolume(child));
  if (!model || !volume) throw new Error('Expected a solid and a modifier volume');
  return { world, model, volume };
}

/**
 * Compiles a SolidScript modifier volume around a 1 m box with shifted UVs.
 *
 * @param lines Script lines.
 * @returns Compiled output, including shown meshes.
 */
function compileVolume(lines: readonly SolidScriptLine[]): CompiledUvs {
  const world = new THREE.Group();
  const model = new SolidModel('Textures volume equivalence');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  shiftBrushUvs(source, 0.25, -0.1);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = scriptDocument(lines);
  const volume = ModifierVolume.create({ modifiers: [entry] });
  volume.scale.setScalar(12);
  world.add(volume);
  return compileShown(world, model, volume);
}

/**
 * Builds a Both-use SolidScript document from lines.
 *
 * @param lines Script lines.
 * @returns Document.
 */
function scriptDocument(lines: readonly SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate([...lines], 'Both'), {
    generator: true,
    modifier: true,
  });
}

/**
 * Rebuilds a scene and reads visible brushes plus helper-mesh samples.
 *
 * @param world Scene world.
 * @param model Solid.
 * @param host Object that shows SolidScript meshes.
 * @returns Compiled output.
 */
function compileShown(world: THREE.Group, model: SolidModel, host: THREE.Object3D): CompiledUvs {
  world.updateMatrixWorld(true);
  model.markDirty();
  model.rebuild(true);
  const compiled = modifierStackCompile(model.getBrushes(), model.root);
  const brushes = compiled.instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
  return {
    brushes,
    meshes: modifierStackMeshesShown(host).map((item) => meshSamples(item).join(';')),
    error: modifierStackStatusRead(host)?.steps?.[0]?.error ?? '',
  };
}

/**
 * Writes a script onto the transferred level's volume and compiles it.
 *
 * @param lines Script lines.
 * @returns Shown mesh samples, and any stack error.
 */
function compileLevel(lines: readonly SolidScriptLine[]): { samples: string[]; error: string } {
  const { model, volume } = loadLevel();
  const settings = ModifierVolume.read(volume);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected a SolidScript modifier on the volume');
  const script = scriptDocument(lines);
  ModifierVolume.write(volume, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, script } }, ...rest],
  });
  model.markDirty();
  model.rebuild(true);
  modifierStackCompile(model.getBrushes(), model.root);
  const shown = modifierStackMeshesShown(volume);
  return {
    samples: shown.map((mesh) => meshSamples(mesh).join(';')),
    error: modifierStackStatusRead(volume)?.steps?.[0]?.error ?? '',
  };
}

/**
 * Compares Input Brushes Textures with Transform UVs on the transferred level.
 *
 * @param name Case name.
 * @param textures Move With Shape or World Aligned.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Difference lines.
 */
function compareLevel(name: string, textures: string, inner: readonly SolidScriptLine[]): string[] {
  const left = compileLevel(meshed(stamped(texturesOnInput(textures, inner))));
  const right = compileLevel(meshed(stamped(texturesAfter(textures, inner))));
  if (left.error !== right.error) return [`${name} ${textures}: error input=${left.error} later=${right.error}`];
  const rows = meshDifference(left.samples, right.samples).map((row) => `${name} ${textures}: ${row}`);
  if (left.samples.every((mesh) => mesh === '') && right.samples.every((mesh) => mesh === ''))
    rows.push(`${name} ${textures}: both scripts showed no mesh`);
  return rows;
}

/**
 * Unique mesh-corner UVs at a world position, or stops the test when none is
 * there.
 *
 * @param result Compiled volume output.
 * @param x World X in metres.
 * @param y World Y in metres.
 * @param z World Z in metres.
 * @returns U and V pairs, sorted.
 */
function meshUvsAt(result: CompiledUvs, x: number, y: number, z: number): [number, number][] {
  const prefix = `${rounded(x)},${rounded(y)},${rounded(z)}:`;
  const hits = result.meshes.flatMap((mesh) => mesh.split(';')).filter((sample) => sample.startsWith(prefix));
  if (hits.length === 0) throw new Error(`No mesh corner at ${prefix.slice(0, -1)}`);
  const unique = new Set(hits.map((sample) => sample.slice(prefix.length)));
  return [...unique]
    .map((text) => text.split(',').map(Number) as [number, number])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

describe('Input Brushes Textures matches Transform UVs Textures', () => {
  it('gives the same output UVs when Textures is set on Input Brushes or later on Transform UVs', () => {
    const rows: string[] = [];
    for (const [name, inner, mustDiffer] of aroundCases()) {
      rows.push(...compareCase(name, inner, mustDiffer));
      rows.push(...compareMeshes(name, inner, true));
    }
    for (const [name, inner, mustDiffer] of afterCases()) {
      rows.push(...compareCase(name, inner, mustDiffer));
      rows.push(...compareMeshes(name, inner, false));
    }
    expect(rows, rows.slice(0, 40).join('\n')).toEqual([]);
  });

  it('gives the same mesh UVs on the transferred level, including after a move', () => {
    const input = inputBrushes();
    const plain = [input];
    const moved = block(line('transform', { move: '2, 0, 0' }), [input]);
    const rows = [
      ...compareLevel('transferred level', WORLD, plain),
      ...compareLevel('transferred level', COPIED, plain),
      ...compareLevel('transferred level Transform Move', WORLD, moved),
      ...compareLevel('transferred level Transform Move', COPIED, moved),
    ];
    expect(rows, rows.slice(0, 40).join('\n')).toEqual([]);
  });

  it('does not world-lock Mesh From Brushes UVs when Transform UVs World Aligned comes after Move By', () => {
    const inner = afterCases().find((entry) => entry[0] === 'Move By');
    if (!inner) throw new Error('Expected the Move By case');
    const left = compileVolume(meshed(stamped(texturesOnInput(WORLD, inner[1]))));
    const right = compileVolume(meshed(stamped(texturesAfter(WORLD, inner[1]))));
    expect(left.error).toBe('');
    expect(right.error).toBe('');
    expect(meshUvsAt(left, 2.5, 0.5, 0.5)).toContainEqual([3.25, -0.1]);
    expect(meshUvsAt(right, 2.5, 0.5, 0.5)).toContainEqual([1.25, -0.1]);
    expect(meshUvsAt(right, 2.5, 0.5, 0.5)).not.toContainEqual([3.25, -0.1]);
  });
});
