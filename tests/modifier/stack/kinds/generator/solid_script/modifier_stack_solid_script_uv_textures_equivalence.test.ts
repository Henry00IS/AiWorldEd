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
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
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
 * An Input Brushes line that writes the received brushes Into Copy.
 *
 * @returns Line.
 */
function inputBrushes(): SolidScriptLine {
  return line('input_brushes', { into: 'Copy' });
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
 * Input Brushes, then the same later edits, then Transform UVs at the end.
 *
 * @param textures Transform UVs Textures.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Lines.
 */
function texturesAfter(textures: string, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  return [...inner, transformUvs(textures)];
}

/**
 * Input Brushes, then Transform UVs immediately after it, then the same later
 * edits, so Of-tools see the policy before they move the copy.
 *
 * @param textures Transform UVs Textures.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Lines.
 */
function texturesViaUvs(textures: string, inner: readonly SolidScriptLine[]): SolidScriptLine[] {
  const lines: SolidScriptLine[] = [];
  for (const entry of inner) {
    lines.push(entry);
    if (entry.command === 'input_brushes') lines.push(transformUvs(textures));
  }
  return lines;
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
 * Compiles a Transform UVs Textures script and reports a missing or failed
 * result.
 *
 * @param name Case name.
 * @param textures Move With Shape or World Aligned.
 * @param result Compiled output.
 * @param wantMesh True requires shown mesh samples; false requires brushes.
 * @returns Problem lines, or empty.
 */
function compiledOk(name: string, textures: string, result: CompiledUvs, wantMesh: boolean): string[] {
  const label = `${name} ${textures}`;
  if (result.error !== '') return [`${label}: error ${result.error}`];
  if (wantMesh) {
    if (result.meshes.every((mesh) => mesh === '')) return [`${label}: showed no mesh`];
    return [];
  }
  return result.brushes.length === 0 ? [`${label}: showed no brushes`] : [];
}

/**
 * Compiles both texture policies with Transform UVs after Input Brushes, and
 * checks they differ when the script moves the brushes.
 *
 * @param name Case name.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @param mustDiffer True when World Aligned must not match Move With Shape.
 * @returns Problem lines, or empty.
 */
function compareCase(name: string, inner: readonly SolidScriptLine[], mustDiffer: boolean): string[] {
  const world = compileModifier(stamped(texturesViaUvs(WORLD, inner)));
  const copied = compileModifier(stamped(texturesViaUvs(COPIED, inner)));
  const rows = [...compiledOk(name, WORLD, world, false), ...compiledOk(name, COPIED, copied, false)];
  if (mustDiffer && signatureOf(world) === signatureOf(copied))
    rows.push(`${name}: World Aligned matched Move With Shape, so the case does not test the option`);
  return rows;
}

/**
 * Compiles both texture policies baked through Mesh From Brushes, with
 * Transform UVs after Input Brushes and before later Of-tools.
 *
 * @param name Case name.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @param mustDiffer True when World Aligned must not match Move With Shape.
 * @returns Problem lines, or empty.
 */
function compareMeshes(name: string, inner: readonly SolidScriptLine[], mustDiffer: boolean): string[] {
  const label = `Mesh From Brushes ${name}`;
  const world = compileVolume(meshed(stamped(texturesViaUvs(WORLD, inner))));
  const copied = compileVolume(meshed(stamped(texturesViaUvs(COPIED, inner))));
  const rows = [...compiledOk(label, WORLD, world, true), ...compiledOk(label, COPIED, copied, true)];
  if (mustDiffer && signatureOf(world) === signatureOf(copied))
    rows.push(`${label}: World Aligned matched Move With Shape, so the case does not test the option`);
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
 * Compiles Transform UVs Textures on the transferred level and checks the mesh
 * came out.
 *
 * @param name Case name.
 * @param textures Move With Shape or World Aligned.
 * @param inner Template that contains one Input Brushes Into Copy line.
 * @returns Problem lines, or empty.
 */
function compareLevel(name: string, textures: string, inner: readonly SolidScriptLine[]): string[] {
  const result = compileLevel(meshed(stamped(texturesViaUvs(textures, inner))));
  if (result.error !== '') return [`${name} ${textures}: error ${result.error}`];
  if (result.samples.every((mesh) => mesh === '')) return [`${name} ${textures}: showed no mesh`];
  return [];
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

/**
 * Sets [Textures] to World Aligned on the second Repeat round (the moved copy
 * at two metres) and Move With Shape on the others.
 *
 * @returns Lines.
 */
function mixedPolicy(): SolidScriptLine[] {
  return [
    line('variable', { name: 'Textures', value: COPIED }),
    ...block(line('if', { condition: '[I] == 1' }), [line('variable', { name: 'Textures', value: WORLD })]),
  ];
}

/**
 * Three copies two metres apart, each with its own [Textures], moved by a
 * Transform around Input Brushes.
 *
 * @returns Lines.
 */
function mixedWrap(): SolidScriptLine[] {
  const inside = [inputBrushes(), transformUvs('[Textures]')];
  return block(line('repeat', { variable: 'I', from: '0', to: '3' }), [
    ...mixedPolicy(),
    ...block(line('transform', { move: '[=[I] * 2], 0, 0' }), inside),
    outputCopy(),
  ]);
}

/**
 * Three copies two metres apart, each with its own [Textures], then moved by
 * Move By Of [Copy].
 *
 * @returns Lines.
 */
function mixedMoveBy(): SolidScriptLine[] {
  const move = line('move_by', { by: '[=[I] * 2], 0, 0', of: '[Copy]' });
  const inside = [inputBrushes(), transformUvs('[Textures]'), move];
  return block(line('repeat', { variable: 'I', from: '0', to: '3' }), [...mixedPolicy(), ...inside, outputCopy()]);
}

/**
 * Checks that a mixed-policy run produced three copies, and that the World
 * Aligned copy at two metres did not keep the same UVs as the moved copy after
 * it.
 *
 * @param name Case name.
 * @param result Compiled mixed-policy result.
 * @returns Problem lines, or empty.
 */
function mixedPolicyCheck(name: string, result: CompiledUvs): string[] {
  if (result.error !== '') return [`${name}: error ${result.error}`];
  const worldBrush = brushAtX(result.brushes, 2);
  const copiedBrush = brushAtX(result.brushes, 4);
  if (!worldBrush || !copiedBrush)
    return [`${name}: expected copies at x=2 and x=4, got ${result.brushes.map(brushCenterX).join(', ')}`];
  const world = brushUvsAt(worldBrush, 2.5, 0.5, 0.5);
  const copied = brushUvsAt(copiedBrush, 4.5, 0.5, 0.5);
  if (world.some((uv) => uv[0] === 3.25 && uv[1] === -0.1) && copied.some((uv) => uv[0] === 1.25 && uv[1] === -0.1))
    return [];
  return [`${name}: mixed UVs world=${JSON.stringify(world)} copied=${JSON.stringify(copied)}`];
}

/**
 * Model-space mid X of a brush, rounded.
 *
 * @param brush Brush.
 * @returns Metres.
 */
function brushCenterX(brush: SolidBrushInstance): number {
  return rounded(brush.getModelSpaceBounds().getCenter(new THREE.Vector3()).x);
}

/**
 * The first brush whose mid X is the given metre value.
 *
 * @param brushes Brushes.
 * @param x Mid X in metres.
 * @returns Brush, or none.
 */
function brushAtX(brushes: readonly SolidBrushInstance[], x: number): SolidBrushInstance | undefined {
  return brushes.find((brush) => brushCenterX(brush) === rounded(x));
}

/**
 * Unique face-corner UVs of a brush at a world position.
 *
 * @param brush Brush.
 * @param x World X in metres.
 * @param y World Y in metres.
 * @param z World Z in metres.
 * @returns U and V pairs.
 */
function brushUvsAt(brush: SolidBrushInstance, x: number, y: number, z: number): [number, number][] {
  const prefix = `${rounded(x)},${rounded(y)},${rounded(z)}:`;
  const hits = brushSamples(brush).filter((sample) => sample.startsWith(prefix));
  const unique = new Set(hits.map((sample) => sample.slice(prefix.length)));
  return [...unique].map((text) => text.split(',').map(Number) as [number, number]);
}

/**
 * Compiles a mixed-policy script as brushes and as a mesh, and checks the World
 * Aligned copy kept world-locked UVs.
 *
 * @param name Case name.
 * @param write Script.
 * @param checkMesh True also checks mesh-corner UVs of the mixed copies.
 * @returns Problem lines, or empty.
 */
function compareMixed(name: string, write: () => SolidScriptLine[], checkMesh: boolean): string[] {
  const result = compileModifier(write());
  const rows = mixedPolicyCheck(name, result);
  const meshedResult = compileVolume(meshed(write()));
  if (meshedResult.error !== '') rows.push(`Mesh From Brushes ${name}: error ${meshedResult.error}`);
  else if (meshedResult.meshes.every((mesh) => mesh === '')) rows.push(`Mesh From Brushes ${name}: showed no mesh`);
  else if (checkMesh) rows.push(...mixedPolicyCheckMesh(`Mesh From Brushes ${name}`, meshedResult));
  return rows;
}

/**
 * Checks mesh-corner UVs of the mixed World Aligned and Move With Shape copies.
 *
 * @param name Case name.
 * @param result Compiled mesh result.
 * @returns Problem lines, or empty.
 */
function mixedPolicyCheckMesh(name: string, result: CompiledUvs): string[] {
  const world = meshUvsAt(result, 2.5, 0.5, 0.5);
  const copied = meshUvsAt(result, 4.5, 0.5, 0.5);
  if (world.some((uv) => uv[0] === 3.25 && uv[1] === -0.1) && copied.some((uv) => uv[0] === 1.25 && uv[1] === -0.1))
    return [];
  return [`${name}: mixed UVs world=${JSON.stringify(world)} copied=${JSON.stringify(copied)}`];
}

/**
 * Compiles a SolidScript generator in an empty solid.
 *
 * @param lines Script lines.
 * @returns Compiled output.
 */
function compileGenerator(lines: readonly SolidScriptLine[]): CompiledUvs {
  const world = new THREE.Group();
  const model = new SolidModel('Textures generator');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, script: scriptDocument(lines) } }, ...rest],
  });
  return compileShown(world, model, node);
}

describe('Transform UVs Textures replaces Input Brushes Textures', () => {
  it('sets Textures with Transform UVs after Input Brushes, for wraps and Of-tools, on brushes and meshes', () => {
    const rows: string[] = [];
    for (const [name, inner, mustDiffer] of aroundCases()) {
      rows.push(...compareCase(name, inner, mustDiffer));
      rows.push(...compareMeshes(name, inner, false));
    }
    for (const [name, inner, mustDiffer] of afterCases()) {
      rows.push(...compareCase(name, inner, mustDiffer));
      rows.push(...compareMeshes(name, inner, name.includes('Move By')));
    }
    expect(rows, rows.slice(0, 40).join('\n')).toEqual([]);
  });

  it('gives the same mesh UVs on the transferred level, including after a move', () => {
    const plain = [inputBrushes()];
    const moved = block(line('transform', { move: '2, 0, 0' }), [inputBrushes()]);
    const rows = [
      ...compareLevel('transferred level', WORLD, plain),
      ...compareLevel('transferred level', COPIED, plain),
      ...compareLevel('transferred level Transform Move', WORLD, moved),
      ...compareLevel('transferred level Transform Move', COPIED, moved),
    ];
    expect(rows, rows.slice(0, 40).join('\n')).toEqual([]);
  });

  it('lets Repeat copies use different Textures, including mixed Move By meshes', () => {
    const rows = [...compareMixed('mixed Wrap', mixedWrap, false), ...compareMixed('mixed Move By', mixedMoveBy, true)];
    expect(rows, rows.slice(0, 40).join('\n')).toEqual([]);
  });

  it('world-locks Mesh From Brushes UVs when Transform UVs World Aligned comes before Move By', () => {
    const inner = afterCases().find((entry) => entry[0] === 'Move By');
    if (!inner) throw new Error('Expected the Move By case');
    const result = compileVolume(meshed(stamped(texturesViaUvs(WORLD, inner[1]))));
    expect(result.error).toBe('');
    expect(meshUvsAt(result, 2.5, 0.5, 0.5)).toContainEqual([3.25, -0.1]);
  });

  it('does not world-lock Mesh From Brushes UVs when Transform UVs World Aligned comes after Move By', () => {
    const inner = afterCases().find((entry) => entry[0] === 'Move By');
    if (!inner) throw new Error('Expected the Move By case');
    const later = compileVolume(meshed(stamped(texturesAfter(WORLD, inner[1]))));
    expect(later.error).toBe('');
    expect(meshUvsAt(later, 2.5, 0.5, 0.5)).toContainEqual([1.25, -0.1]);
    expect(meshUvsAt(later, 2.5, 0.5, 0.5)).not.toContainEqual([3.25, -0.1]);
  });

  it('gives an empty generator result, because Input Brushes receives no brushes', () => {
    const result = compileGenerator([inputBrushes()]);
    expect(result.error).toBe('');
    expect(result.brushes).toHaveLength(0);
    expect(result.meshes.every((mesh) => mesh === '')).toBe(true);
  });
});
