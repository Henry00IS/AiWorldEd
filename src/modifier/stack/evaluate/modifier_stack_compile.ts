import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { ModifierBevelSurfaceOverlay } from '@/modifier/compile/modifier_bevel_surface_overlay.js';
import { ModifierVolume, modifierVolumeSceneRoot, modifierVolumesActive } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackCaptureUnits } from './modifier_stack_capture.js';
import { modifierStackAuthoredBevel, type ModifierStackCapture } from './modifier_stack_authored_bevel.js';
import { ModifierStackBudget } from './modifier_stack_budget.js';
import { ModifierStackRecords } from './modifier_stack_records.js';
import { modifierStackStagingCreate } from './modifier_stack_frame.js';
import {
  modifierStackBrushCount,
  modifierStackEvaluateVolume,
  type ModifierStackSharedContext,
} from './modifier_stack_evaluate.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierStackStatusWrite } from './modifier_stack_status.js';
import { modifierStackTreeClone, modifierStackTreePlace } from './modifier_stack_tree.js';

/** Compile list and tree for one solid after every modifier volume ran. */
export interface ModifierStackCompileResult {
  /** Brushes handed to the CSG compiler. */
  instances: SolidBrushInstance[];
  /** Hierarchy the compiler walks: the authored root, or a compile-only clone. */
  root: THREE.Object3D;
  /** True when derived brushes were produced; forces a full compile. */
  derivedActive: boolean;
  /** Authored ids whose prepared geometry must refresh. */
  extraDirtyBrushIds: string[];
}

/** Presentation brushes of derived ids, per solid root, for result UVs. */
export const modifierStackDerivedByRoot = new WeakMap<THREE.Object3D, ReadonlyMap<string, SolidBrushInstance>>();

const modifierStackDerivedIdsByScope = new Map<string, string[]>();

/**
 * Runs every active modifier volume against one solid's authored brushes. Every
 * volume captures from the same authored snapshot, so outputs never feed other
 * volumes and evaluation cannot loop.
 *
 * @param authored Authored evaluation list.
 * @param solidRoot Solid model root.
 * @returns Compile list, tree and dirty ids.
 */
export function modifierStackCompile(
  authored: readonly SolidBrushInstance[],
  solidRoot: THREE.Object3D,
): ModifierStackCompileResult {
  const scopeId = solidRoot.uuid;
  modifierStackDerivedOverlaysClear(scopeId);
  const sceneRoot = modifierVolumeSceneRoot(solidRoot);
  const captures = modifierVolumesActive(sceneRoot).map((volume) =>
    modifierStackCaptureOf(volume, authored, solidRoot),
  );
  const bevel = modifierStackAuthoredBevel(captures, scopeId);
  const substituted = authored.map((brush) => bevel.standIns.get(brush.id) ?? brush);
  if (captures.length === 0) return modifierStackCompileResult(substituted, solidRoot, [], bevel.extraDirtyBrushIds);
  const records = modifierStackRecordsSeed(authored, bevel.derived);
  const shared = modifierStackSharedCreate(solidRoot, records, (brush) => bevel.standIns.get(brush.id) ?? brush);
  const derivedUnits = captures.flatMap((capture) => modifierStackRunCapture(capture, shared, sceneRoot));
  modifierStackDerivedPublish(scopeId, solidRoot, derivedUnits, records);
  return modifierStackCompileResult(substituted, solidRoot, derivedUnits, bevel.extraDirtyBrushIds);
}

/**
 * Captures one volume's authored operands.
 *
 * @param volume Modifier volume.
 * @param authored Authored brushes.
 * @param solidRoot Solid root.
 * @returns Capture.
 */
export function modifierStackCaptureOf(
  volume: THREE.Object3D,
  authored: readonly SolidBrushInstance[],
  solidRoot: THREE.Object3D,
): ModifierStackCapture {
  volume.updateWorldMatrix(true, false);
  const settings = ModifierVolume.read(volume);
  return { volume, settings, units: modifierStackCaptureUnits(authored, solidRoot, volume, settings.grouping) };
}

/**
 * Creates presentation records seeded with the authored chamfers, so copies of
 * chamfered brushes inherit their strip shading.
 *
 * @param authored Authored brushes.
 * @param chamfers Chamfer per authored id.
 * @returns Records.
 */
export function modifierStackRecordsSeed(
  authored: readonly SolidBrushInstance[],
  chamfers: ReadonlyMap<string, ModifierBevelDerivedBrush>,
): ModifierStackRecords {
  const records = new ModifierStackRecords();
  for (const source of authored) {
    const derived = chamfers.get(source.id);
    if (derived) records.bevelSet(source.id, { derived, presentation: source });
  }
  return records;
}

/**
 * Creates the context shared by every modifier of this compile.
 *
 * @param solidRoot Solid root.
 * @param records Presentation records.
 * @param authoredBevel Stand-in lookup of authored brushes.
 * @returns Shared context; ownership of generated output is set per volume.
 */
export function modifierStackSharedCreate(
  solidRoot: THREE.Object3D,
  records: ModifierStackRecords,
  authoredBevel: (brush: SolidBrushInstance) => SolidBrushInstance,
): ModifierStackSharedContext {
  return {
    solidRoot,
    staging: modifierStackStagingCreate(solidRoot),
    budget: new ModifierStackBudget(),
    ownsGenerated: false,
    authoredBevel,
    records,
  };
}

/**
 * Runs one volume, records its feedback and returns only what it derived.
 *
 * @param capture Volume capture.
 * @param shared Shared context.
 * @param sceneRoot Scene root.
 * @returns Derived units in output order.
 */
export function modifierStackRunCapture(
  capture: ModifierStackCapture,
  shared: ModifierStackSharedContext,
  sceneRoot: THREE.Object3D,
): ModifierStackUnit[] {
  const ownsGenerated = modifierStackGeneratedOwner(capture.volume, sceneRoot) === shared.solidRoot;
  const run = modifierStackEvaluateVolume(capture.volume, capture.settings, capture.units, {
    ...shared,
    ownsGenerated,
  });
  const derived = run.units.filter((unit) => !unit.authored);
  const captured = modifierStackBrushCount(capture.units);
  modifierStackStatusWrite(capture.volume, shared.solidRoot.uuid, {
    captured,
    derived: modifierStackBrushCount(derived),
    steps: run.reports,
  });
  return derived;
}

/**
 * Returns the solid that receives a volume's generated brushes: the solid the
 * volume is parented under, else the first solid in the scene.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @returns Owning solid root, or null when the scene has none.
 */
export function modifierStackGeneratedOwner(volume: THREE.Object3D, sceneRoot: THREE.Object3D): THREE.Object3D | null {
  for (let current = volume.parent; current; current = current.parent) if (isSolidModelObject(current)) return current;
  let first: THREE.Object3D | null = null;
  sceneRoot.traverse((object) => {
    if (!first && isSolidModelObject(object)) first = object;
  });
  return first;
}

/**
 * Publishes presentation brushes and shading overlays of derived brushes.
 *
 * @param scopeId Solid identity.
 * @param solidRoot Solid root.
 * @param units Derived units.
 * @param records Presentation records.
 */
function modifierStackDerivedPublish(
  scopeId: string,
  solidRoot: THREE.Object3D,
  units: readonly ModifierStackUnit[],
  records: ModifierStackRecords,
): void {
  for (const unit of units) for (const brush of unit.brushes) records.derivedAdd(brush);
  const ids = [...records.derivedAll().keys()];
  for (const id of ids) {
    const bevel = records.bevelGet(id);
    if (bevel) ModifierBevelSurfaceOverlay.set(id, bevel.derived);
    const shading = records.normalsAll().get(id);
    if (shading) ModifierBevelSurfaceOverlay.shadingSet(id, shading);
  }
  modifierStackDerivedIdsByScope.set(scopeId, ids);
  modifierStackDerivedByRoot.set(solidRoot, records.derivedAll());
}

/**
 * Drops overlays of the derived ids the previous compile of a solid produced.
 *
 * @param scopeId Solid identity.
 */
function modifierStackDerivedOverlaysClear(scopeId: string): void {
  for (const id of modifierStackDerivedIdsByScope.get(scopeId) ?? []) {
    ModifierBevelSurfaceOverlay.clear(id);
    ModifierBevelSurfaceOverlay.shadingClear(id);
  }
  modifierStackDerivedIdsByScope.delete(scopeId);
}

/**
 * Assembles the compile result, building a compile-only tree when derived
 * brushes exist.
 *
 * @param substituted Authored list with chamfered stand-ins.
 * @param solidRoot Solid root.
 * @param units Derived units.
 * @param extraDirtyBrushIds Authored ids to refresh.
 * @returns Compile result.
 */
function modifierStackCompileResult(
  substituted: SolidBrushInstance[],
  solidRoot: THREE.Object3D,
  units: readonly ModifierStackUnit[],
  extraDirtyBrushIds: string[],
): ModifierStackCompileResult {
  if (units.length === 0) {
    modifierStackDerivedByRoot.delete(solidRoot);
    return { instances: substituted, root: solidRoot, derivedActive: false, extraDirtyBrushIds };
  }
  const virtualRoot = modifierStackTreeClone(solidRoot);
  modifierStackTreePlace(virtualRoot, units);
  const derived = units.flatMap((unit) => unit.brushes);
  return { instances: [...substituted, ...derived], root: virtualRoot, derivedActive: true, extraDirtyBrushIds };
}
