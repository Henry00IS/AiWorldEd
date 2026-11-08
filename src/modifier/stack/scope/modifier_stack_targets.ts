import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackScopeOf, type ModifierStackScope } from './modifier_stack_scope.js';
import { modifierStackBuiltTreeBuild } from './modifier_stack_built_tree.js';
import { modifierStackBuiltTouched } from './modifier_stack_built_touch.js';

/** What a volume affects in one solid, before its exclusions. */
export interface ModifierStackTargets {
  /** Scope of the volume in this solid, or null when it affects nothing here. */
  scope: ModifierStackScope | null;
  /** Ids of authored brushes whose built geometry meets the volume. */
  authoredIds: ReadonlySet<string>;
  /** Generator piece units with a brush whose built geometry meets it. */
  pieces: readonly ModifierStackUnit[];
  /** Generator node of each listed piece unit. */
  pieceGenerators: ReadonlyMap<ModifierStackUnit, THREE.Object3D>;
}

/** Generator pieces each solid's last compile built, for the affect list. */
export const modifierStackGeneratorsByRoot = new WeakMap<
  THREE.Object3D,
  ReadonlyMap<THREE.Object3D, readonly ModifierStackUnit[]>
>();

/**
 * Resolves what a volume affects in one solid. Three rules apply in turn: only
 * nodes in the volume's parent (its CSG group or solid root), only nodes that
 * come before it there, and only brushes whose built geometry, the surface
 * those earlier nodes build, meets the volume box. Air inside a subtracted room
 * or window is not built geometry. Everything the volume and later nodes do is
 * left out, so the result never feeds back on itself.
 *
 * @param volume Modifier volume.
 * @param solidRoot Solid model root.
 * @param authored Authored brushes of the solid.
 * @param generators Pieces of each generator node of the solid.
 * @returns Targets before exclusions.
 */
export function modifierStackTargetsResolve(
  volume: THREE.Object3D,
  solidRoot: THREE.Object3D,
  authored: readonly SolidBrushInstance[],
  generators: ReadonlyMap<THREE.Object3D, readonly ModifierStackUnit[]> = new Map(),
): ModifierStackTargets {
  const inverted = SolidModelRegistry.get(solidRoot)?.isInvertedWorld() ?? false;
  const scope = modifierStackScopeOf(volume, solidRoot, inverted);
  if (!scope) return { scope, authoredIds: new Set(), pieces: [], pieceGenerators: new Map() };
  volume.updateWorldMatrix(true, false);
  const sources = {
    authored: new Map(authored.map((brush) => [brush.id, brush])),
    generators,
    solidToWorld: solidRoot.matrixWorld,
    volume,
  };
  const nodes = modifierStackBuiltTreeBuild(scope.before, sources);
  const touched = modifierStackBuiltTouched(nodes, scope.startsSolid, volume);
  const authoredIds = new Set(touched.filter((leaf) => !leaf.generator).map((leaf) => leaf.brush.id));
  return { scope, authoredIds, ...modifierStackTargetsPieces(touched, generators) };
}

/**
 * Picks the generator piece units that hold a touched piece.
 *
 * @param touched Touched leaves.
 * @param generators Pieces of each generator node.
 * @returns Units in generator order and the node of each.
 */
function modifierStackTargetsPieces(
  touched: readonly { brush: SolidBrushInstance; generator: THREE.Object3D | null }[],
  generators: ReadonlyMap<THREE.Object3D, readonly ModifierStackUnit[]>,
): Pick<ModifierStackTargets, 'pieces' | 'pieceGenerators'> {
  const hit = new Set(touched.filter((leaf) => leaf.generator).map((leaf) => leaf.brush));
  const pieceGenerators = new Map<ModifierStackUnit, THREE.Object3D>();
  for (const [node, units] of generators)
    for (const unit of units) if (unit.brushes.some((brush) => hit.has(brush))) pieceGenerators.set(unit, node);
  return { pieces: [...pieceGenerators.keys()], pieceGenerators };
}
