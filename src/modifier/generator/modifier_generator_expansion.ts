import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { generatorKindFind } from './modifier_generator_catalog.js';
import { generatorBrushTouches } from './modifier_generator_capture.js';
import { generatorCopyBrush } from './modifier_generator_copy.js';
import { ModifierGeneratorVolume, generatorSceneRoot, generatorVolumes } from './modifier_generator_volume.js';
import type { GeneratorSettings } from './modifier_generator_types.js';

/** Compile-only expansion, never parented to the authored scene. */
export interface GeneratorExpansion {
  instances: SolidBrushInstance[];
  root: THREE.Object3D;
  active: boolean;
}
/** Inspector feedback for an evaluated selector. */
export const generatorStatus = new WeakMap<
  THREE.Object3D,
  { sources: THREE.Object3D[]; copies: number; error: string }
>();
const MAX_GENERATED_BRUSHES = 4096;
/** Compile-only derived lookup for result UV presentation. */
export const generatorDerivedByRoot = new WeakMap<THREE.Object3D, Map<string, SolidBrushInstance>>();

/**
 * Expands each selector against the same immutable authored snapshot. @param
 * sources Authored brushes only. @param root Solid root.
 */
export function generatorExpand(sources: readonly SolidBrushInstance[], root: THREE.Object3D): GeneratorExpansion {
  const volumes = generatorVolumes(generatorSceneRoot(root));
  if (!volumes.length) {
    generatorDerivedByRoot.delete(root);
    return { instances: sources.slice(), root, active: false };
  }
  const virtual = generatorCloneTree(root);
  virtual.uuid = root.uuid;
  virtual.matrix.copy(root.matrixWorld);
  virtual.matrixAutoUpdate = false;
  const expansion = { instances: sources.slice(), root: virtual, active: true };
  for (const volume of volumes) generatorExpandVolume(expansion, sources, root, volume);
  virtual.updateMatrixWorld(true);
  generatorDerivedByRoot.set(
    root,
    new Map(
      expansion.instances.filter((entry) => entry.mesh?.userData['generatorDerived']).map((entry) => [entry.id, entry]),
    ),
  );
  return expansion;
}
/**
 * Makes a hierarchy-only clone without scene registration or buffers. @param
 * source Authored tree node.
 */
function generatorCloneTree(source: THREE.Object3D): THREE.Object3D {
  const copy = new THREE.Group();
  copy.uuid = source.uuid;
  copy.userData = { ...source.userData };
  copy.visible = source.visible;
  for (const child of source.children) {
    if (SolidBrushVisual.isBrushObject(child) || child instanceof THREE.Group) copy.add(generatorCloneTree(child));
  }
  return copy;
}
/**
 * Captures and expands one selector. @param expansion Mutable output. @param
 * sources Immutable brushes. @param root Solid root. @param volume Selector.
 */
function generatorExpandVolume(
  expansion: GeneratorExpansion,
  sources: readonly SolidBrushInstance[],
  root: THREE.Object3D,
  volume: THREE.Object3D,
): void {
  const settings = ModifierGeneratorVolume.read(volume);
  const kind = generatorKindFind(settings.kind);
  const units = generatorCaptureUnits(sources, root, volume, settings);
  const status = { sources: [...units.keys()], copies: 0, error: '' };
  generatorStatus.set(volume, status);
  if (!kind) {
    status.error = 'Generator type unavailable; install its feature branch.';
    return;
  }
  const required = [...units.values()].reduce((sum, entries) => sum + entries.length * (settings.count - 1), 0);
  if (expansion.instances.length - sources.length + required > MAX_GENERATED_BRUSHES) {
    status.error = '4096 generated-brush budget exceeded; reduce count or capture scope.';
    return;
  }
  for (const [unit, entries] of units) {
    generatorExpandUnit(expansion, entries, root, volume, unit, settings);
    status.copies += settings.count - 1;
  }
}
/**
 * Promotes touched brushes to intact selected compounds. @param sources
 * Authored brushes. @param root Solid root. @param volume Selector. @param
 * settings Capture policy.
 */
export function generatorCaptureUnits(
  sources: readonly SolidBrushInstance[],
  root: THREE.Object3D,
  volume: THREE.Object3D,
  settings: GeneratorSettings,
): Map<THREE.Object3D, SolidBrushInstance[]> {
  const selected = new Set<THREE.Object3D>();
  for (const source of sources) {
    if (!source.mesh || generatorExcluded(source.mesh, settings.excludedIds)) continue;
    if (generatorBrushTouches(source, volume)) selected.add(generatorCaptureRoot(source.mesh, root, settings.grouping));
  }
  const units = new Map<THREE.Object3D, SolidBrushInstance[]>();
  for (const unit of selected)
    units.set(
      unit,
      sources.filter(
        (source) =>
          source.mesh && generatorUnder(source.mesh, unit) && !generatorExcluded(source.mesh, settings.excludedIds),
      ),
    );
  return units;
}
/**
 * Finds the capture root without relying on edge IDs. @param mesh Brush. @param
 * root Solid. @param grouping Group policy.
 */
function generatorCaptureRoot(mesh: THREE.Object3D, root: THREE.Object3D, grouping: string): THREE.Object3D {
  if (grouping === 'brush') return mesh;
  let unit = mesh;
  while (unit.parent && unit.parent !== root) unit = unit.parent;
  return unit;
}
/**
 * Checks an authored ancestor exclusion. @param node Candidate. @param excluded
 * Saved IDs.
 */
function generatorExcluded(node: THREE.Object3D, excluded: readonly string[]): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (excluded.includes(current.uuid)) return true;
    current = current.parent;
  }
  return false;
}
/**
 * Tests ancestor membership. @param node Candidate. @param ancestor Captured
 * unit.
 */
function generatorUnder(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}
/**
 * Adds sibling copies of one complete operand. @param expansion Output. @param
 * entries Source brushes. @param root Solid. @param volume Selector. @param
 * unit Operand. @param settings Strategy settings.
 */
function generatorExpandUnit(
  expansion: GeneratorExpansion,
  entries: SolidBrushInstance[],
  root: THREE.Object3D,
  volume: THREE.Object3D,
  unit: THREE.Object3D,
  settings: GeneratorSettings,
): void {
  const slot = expansion.root.getObjectByProperty('uuid', unit.uuid);
  const parent = slot?.parent;
  if (!parent || !slot) return;
  const frame = generatorFrame(volume, settings.space);
  const bounds = generatorSourceBounds(entries, frame);
  const kind = generatorKindFind(settings.kind);
  if (!kind) return;
  for (let index = 1; index < settings.count; index++) {
    const transform = frame
      .clone()
      .multiply(kind.transform(index, { settings, bounds }))
      .multiply(frame.clone().invert());
    const modelTransform = root.matrixWorld.clone().invert().multiply(transform).multiply(root.matrixWorld);
    const copied = generatorCopyUnit(unit, entries, modelTransform, volume.uuid, index, settings, expansion.instances);
    parent.add(copied);
    parent.children.splice(parent.children.indexOf(copied), 1);
    parent.children.splice(parent.children.indexOf(slot) + index, 0, copied);
  }
}
/**
 * Uses the selector rotation but not selector scale as placement units. @param
 * volume Selector. @param space World or selector basis.
 */
export function generatorFrame(volume: THREE.Object3D, space: string): THREE.Matrix4 {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  volume.matrixWorld.decompose(position, rotation, new THREE.Vector3());
  if (space === 'world') rotation.identity();
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
}
/**
 * Measures immutable bounds in placement coordinates. @param entries Sources.
 * @param frame Placement basis.
 */
function generatorSourceBounds(entries: readonly SolidBrushInstance[], frame: THREE.Matrix4): THREE.Box3 {
  const bounds = new THREE.Box3();
  const inverse = frame.clone().invert();
  for (const entry of entries) {
    if (!entry.mesh) continue;
    const matrix = inverse.clone().multiply(entry.mesh.matrixWorld);
    for (const point of entry.brush.vertices) bounds.expandByPoint(point.clone().applyMatrix4(matrix));
  }
  return bounds;
}
/**
 * Copies a compound while retaining tree boundaries. @param unit Authored node.
 * @param entries Source brushes. @param transform Model delta. @param
 * generatorId Owner. @param index Copy index. @param settings Mapping. @param
 * output Compile list.
 */
function generatorCopyUnit(
  unit: THREE.Object3D,
  entries: readonly SolidBrushInstance[],
  transform: THREE.Matrix4,
  generatorId: string,
  index: number,
  settings: GeneratorSettings,
  output: SolidBrushInstance[],
): THREE.Object3D {
  const source = entries.find((entry) => entry.mesh === unit);
  if (source) {
    const id = `${source.id}#${generatorId}:array:${index}`;
    const copy = generatorCopyBrush(source, transform.clone().multiply(source.getModelSpaceMatrix()), id, settings);
    output.push(copy);
    if (copy.mesh) return copy.mesh;
  }
  const group = new THREE.Group();
  group.userData = { ...unit.userData };
  for (const child of unit.children) {
    if (entries.some((entry) => entry.mesh && generatorUnder(entry.mesh, child)))
      group.add(generatorCopyUnit(child, entries, transform, generatorId, index, settings, output));
  }
  return group;
}
