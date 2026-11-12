import * as THREE from 'three';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SOLID_BRUSH_OPERATION_USERDATA_KEY, SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';

/** Builds the overdraw material for one CSG operation. */
export type DerivedOverlapMaterialResolver = (operation: SolidOperation) => THREE.MeshBasicMaterial;

/** Overlap hulls built for the derived brushes of one solid compile. */
interface DerivedOverlapHullCache {
  derived: ReadonlyMap<string, SolidBrushInstance>;
  hulls: THREE.Mesh[];
}

/** Cached hulls per solid root, rebuilt when the solid publishes new brushes. */
const derivedOverlapHullsByRoot = new WeakMap<THREE.Object3D, DerivedOverlapHullCache>();

/**
 * Adds temporary overdraw hulls for brushes that generators and modifiers
 * produce. They have no scene mesh of their own, so without these the Overlap
 * view would lose them along with the hidden CSG result. Returns a callback
 * that removes the hulls again.
 *
 * @param scene Shared editor scene.
 * @param resolveMaterial Overdraw material for a CSG operation.
 * @param includeHiddenSolids When false, solids the user hid are skipped.
 * @returns Removal callback.
 */
export function addDerivedBrushOverlapHulls(
  scene: THREE.Scene,
  resolveMaterial: DerivedOverlapMaterialResolver,
  includeHiddenSolids: boolean,
): () => void {
  const added: THREE.Mesh[] = [];
  for (const solidRoot of collectSolidRootsWithDerivedBrushes(scene, includeHiddenSolids)) {
    solidRoot.updateWorldMatrix(true, false);
    for (const hull of resolveDerivedOverlapHulls(solidRoot, resolveMaterial)) {
      hull.matrix.copy(solidRoot.matrixWorld);
      hull.material = resolveMaterial(SolidBrushVisual.getOperation(hull));
      added.push(hull);
    }
  }
  if (added.length > 0) scene.add(...added);
  return () => added.forEach((hull) => hull.removeFromParent());
}

/**
 * Lists solid roots whose last compile published derived brushes.
 *
 * @param scene Scene to walk.
 * @param includeHiddenSolids When false, only visible solids are listed.
 * @returns Solid roots.
 */
function collectSolidRootsWithDerivedBrushes(scene: THREE.Scene, includeHiddenSolids: boolean): THREE.Object3D[] {
  const roots: THREE.Object3D[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (isSolidModelObject(object) && (modifierStackDerivedByRoot.get(object)?.size ?? 0) > 0) roots.push(object);
  };
  if (includeHiddenSolids) scene.traverse(visit);
  else scene.traverseVisible(visit);
  return roots;
}

/**
 * Returns cached overlap hulls for a solid, rebuilding them when its derived
 * brush map changed.
 *
 * @param solidRoot Solid root.
 * @param resolveMaterial Overdraw material for a CSG operation.
 * @returns Hull meshes in solid model space.
 */
function resolveDerivedOverlapHulls(
  solidRoot: THREE.Object3D,
  resolveMaterial: DerivedOverlapMaterialResolver,
): THREE.Mesh[] {
  const derived = modifierStackDerivedByRoot.get(solidRoot) ?? new Map<string, SolidBrushInstance>();
  const cached = derivedOverlapHullsByRoot.get(solidRoot);
  if (cached && cached.derived === derived) return cached.hulls;
  cached?.hulls.forEach((hull) => disposeDerivedOverlapHull(hull));
  const hulls = [...derived.values()]
    .filter((brush) => brush.visible)
    .map((brush) => createDerivedOverlapHull(brush, resolveMaterial));
  derivedOverlapHullsByRoot.set(solidRoot, { derived, hulls });
  return hulls;
}

/**
 * Builds one overlap hull for a derived brush, with outline edges so stacked
 * pieces stay readable.
 *
 * @param brush Derived brush.
 * @param resolveMaterial Overdraw material for a CSG operation.
 * @returns Hull mesh in solid model space; its matrix is set per pass.
 */
function createDerivedOverlapHull(
  brush: SolidBrushInstance,
  resolveMaterial: DerivedOverlapMaterialResolver,
): THREE.Mesh {
  const hull = new THREE.Mesh(SolidBrushVisual.buildHullGeometry(brush.getModelSpaceBrush()));
  hull.name = `overlap_derived_${brush.id}`;
  hull.matrixAutoUpdate = false;
  hull.raycast = () => undefined;
  hull.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY] = brush.operation;
  hull.userData['isDerivedBrushOverlapHull'] = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(hull.geometry),
    createDerivedOverlapEdgeMaterial(resolveMaterial(brush.operation).color),
  );
  edges.raycast = () => undefined;
  hull.add(edges);
  return hull;
}

/**
 * Creates the faint operation-colored outline material of a derived hull.
 *
 * @param color Overdraw color of the brush operation.
 * @returns Line material.
 */
function createDerivedOverlapEdgeMaterial(color: THREE.Color): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
}

/**
 * Frees the geometry of a derived hull and its outline.
 *
 * @param hull Derived hull mesh.
 */
function disposeDerivedOverlapHull(hull: THREE.Mesh): void {
  hull.removeFromParent();
  hull.geometry.dispose();
  for (const child of hull.children) {
    if (!(child instanceof THREE.LineSegments)) continue;
    child.geometry.dispose();
    (child.material as THREE.Material).dispose();
  }
}
