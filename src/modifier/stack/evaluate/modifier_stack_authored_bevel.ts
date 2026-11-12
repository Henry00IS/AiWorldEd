import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelCreateStandIn } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { ModifierBevelAffectedSet } from '@/modifier/compile/modifier_bevel_affected_set.js';
import { ModifierBevelSurfaceOverlay } from '@/modifier/compile/modifier_bevel_surface_overlay.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';
import type { ModifierStackSettings, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackBevelProxy } from './modifier_stack_bevel_proxy.js';
import { modifierStackBevelShapeValid } from './modifier_stack_validity.js';

/** One volume's capture, ready for evaluation. */
export interface ModifierStackCapture {
  /** Modifier volume. */
  volume: THREE.Object3D;
  /** Normalized stack. */
  settings: ModifierStackSettings;
  /** Authored units the volume touches. */
  units: ModifierStackUnit[];
  /** Cap pieces the stack names, by object id. */
  caps: Map<string, ModifierStackUnit>;
  /** Touching brushes skipped because they are invalid. */
  skipped: number;
  /** Captured brushes kept unbevelled because their bevel would be invalid. */
  unbevelled: number;
}

/** Joint chamfer of authored brushes across all volumes. */
export interface ModifierStackAuthoredBevelResult {
  /** Chamfered stand-in per authored id. */
  standIns: Map<string, SolidBrushInstance>;
  /** Chamfer record per authored id. */
  derived: Map<string, ModifierBevelDerivedBrush>;
  /** Authored ids whose prepared geometry must refresh. */
  extraDirtyBrushIds: string[];
  /** Brushes whose bevel would be invalid; they keep their own shape. */
  rejected: Set<string>;
}

/**
 * Chamfers authored brushes once with every bevel modifier that still sees
 * them, across all volumes, matching the several-volumes workflow. A bevel
 * placed after a generator that replaces its input never touches authored
 * brushes. Also publishes the chamfers for surface lookup and tracks which
 * brushes changed.
 *
 * @param captures Captures of every active volume.
 * @param scopeId Solid identity used to track chamfered brushes.
 * @returns Stand-ins, records and dirty ids.
 */
export function modifierStackAuthoredBevel(
  captures: readonly ModifierStackCapture[],
  scopeId: string,
): ModifierStackAuthoredBevelResult {
  const result = modifierStackAuthoredBevelDerive(captures);
  for (const [id, derived] of result.derived) ModifierBevelSurfaceOverlay.set(id, derived);
  const changed = ModifierBevelAffectedSet.replace(scopeId, new Set(result.standIns.keys()));
  for (const id of changed) if (!result.standIns.has(id)) ModifierBevelSurfaceOverlay.clear(id);
  result.extraDirtyBrushIds.push(...changed);
  for (const capture of captures)
    capture.unbevelled = capture.units
      .flatMap((unit) => unit.brushes)
      .filter((brush) => result.rejected.has(brush.id)).length;
  return result;
}

/**
 * Chamfers authored brushes without publishing anything, for evaluation that
 * must not disturb the live scene, such as baking.
 *
 * @param captures Captures to chamfer with.
 * @returns Stand-ins, records and the ids whose chamfer was recomputed.
 */
export function modifierStackAuthoredBevelDerive(
  captures: readonly ModifierStackCapture[],
): ModifierStackAuthoredBevelResult {
  const result: ModifierStackAuthoredBevelResult = {
    standIns: new Map(),
    derived: new Map(),
    extraDirtyBrushIds: [],
    rejected: new Set(),
  };
  for (const { brush, proxies } of modifierStackAuthoredBevelTargets(captures).values())
    modifierStackAuthoredBevelOne(brush, proxies, result);
  return result;
}

/**
 * Collects, per authored brush, the bevel proxies that apply to it.
 *
 * @param captures Captures of every active volume.
 * @returns Map from authored id to the brush and its proxies.
 */
function modifierStackAuthoredBevelTargets(
  captures: readonly ModifierStackCapture[],
): Map<string, { brush: SolidBrushInstance; proxies: THREE.Object3D[] }> {
  const targets = new Map<string, { brush: SolidBrushInstance; proxies: THREE.Object3D[] }>();
  for (const capture of captures) {
    for (const proxy of modifierStackAuthoredBevelProxies(capture)) {
      for (const brush of capture.units.flatMap((unit) => unit.brushes)) {
        const target = targets.get(brush.id) ?? { brush, proxies: [] };
        target.proxies.push(proxy);
        targets.set(brush.id, target);
      }
    }
  }
  return targets;
}

/**
 * Lists the bevel proxies of a stack that run while authored brushes are still
 * in the working set.
 *
 * @param capture One volume's capture.
 * @returns Proxies in stack order.
 */
function modifierStackAuthoredBevelProxies(capture: ModifierStackCapture): THREE.Object3D[] {
  const proxies: THREE.Object3D[] = [];
  for (const step of capture.settings.modifiers) {
    const kind = modifierStackKindFind(step.kind);
    if (!kind || !step.enabled) continue;
    if (step.kind === MODIFIER_STACK_KIND_BEVEL) proxies.push(modifierStackBevelProxy(capture.volume, step));
    if (!kind.passesAuthoredInput(step.parameters)) break;
  }
  return proxies;
}

/**
 * Chamfers one authored brush with its proxies and records the result. Brushes
 * the proxies leave untouched get no record.
 *
 * @param brush Authored brush.
 * @param proxies Bevel proxies that reach it.
 * @param result Result to fill.
 */
function modifierStackAuthoredBevelOne(
  brush: SolidBrushInstance,
  proxies: THREE.Object3D[],
  result: ModifierStackAuthoredBevelResult,
): void {
  const cached = modifierBevelDerivedFromCache(brush, proxies);
  if (!cached) return;
  if (!modifierStackBevelShapeValid(cached.derived)) {
    result.rejected.add(brush.id);
    return;
  }
  if (cached.rebuilt) result.extraDirtyBrushIds.push(brush.id);
  result.derived.set(brush.id, cached.derived);
  result.standIns.set(brush.id, modifierBevelCreateStandIn(brush, cached.derived));
}
