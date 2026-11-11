import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ObjectDuplicator } from '@/outliner/hierarchy/object_duplicator.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getSolidGroupOperation, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * What a hierarchy node is, as far as copying goes. Helpers are editor-only
 * children (outlines, edges, guides, the solid result) and are never copied.
 */
export type HierarchyDuplicateKind = 'helper' | 'solidModel' | 'brush' | 'solidGroup' | 'volume' | 'mesh' | 'group';

/** Everything one copy created besides its scene objects. */
export interface HierarchyDuplicateCreated {
  /** New brushes per existing solid model. */
  brushes: Map<SolidModel, SolidBrushInstance[]>;
  /** Whether the copy holds a modifier volume or generator. */
  volumes: boolean;
}

/**
 * Classifies a hierarchy node for copying. Throws for content of a kind that
 * Duplicate does not know, so a new kind can never be dropped silently.
 *
 * @param object Hierarchy node.
 * @returns Its kind.
 */
export function hierarchyDuplicateKindOf(object: THREE.Object3D): HierarchyDuplicateKind {
  if (isEditorHelperObject(object) || SolidModel.isResultMesh(object)) return 'helper';
  if (object instanceof THREE.Group && SolidModel.isSolidModelObject(object)) return 'solidModel';
  if (object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object)) return 'brush';
  if (isSolidCsgGroup(object)) return 'solidGroup';
  if (object instanceof THREE.Mesh && ModifierVolume.isVolume(object)) return 'volume';
  if (object instanceof THREE.Mesh) return 'mesh';
  if (object instanceof THREE.Group) return 'group';
  throw new Error(`Duplicate cannot copy ${object.type} "${object.name}"`);
}

/**
 * Classifies a node and every content node a copy of it would walk, so an
 * unknown kind throws before anything is created.
 *
 * @param object Hierarchy node to check.
 */
export function hierarchyDuplicateAssertCopyable(object: THREE.Object3D): void {
  const kind = hierarchyDuplicateKindOf(object);
  if (kind !== 'group' && kind !== 'solidGroup') return;
  for (const child of object.children) hierarchyDuplicateAssertCopyable(child);
}

/**
 * Copies a hierarchy node with all of its content into a parent, as its last
 * child. Groups and CSG groups are walked child by child in order; brushes are
 * cloned into their solid model but only registered later through
 * {@link HierarchyDuplicateCreated}; a solid model is copied whole as an
 * independent model.
 *
 * @param source Node to copy.
 * @param parent Parent that receives the copy.
 * @param offset Position offset applied to the copy itself.
 * @param created Collects brushes and volumes the copy creates.
 * @returns The copy, or null for an editor helper.
 */
export function hierarchyDuplicateClone(
  source: THREE.Object3D,
  parent: THREE.Object3D,
  offset: THREE.Vector3,
  created: HierarchyDuplicateCreated,
): THREE.Object3D | null {
  const kind = hierarchyDuplicateKindOf(source);
  switch (kind) {
    case 'helper':
      return null;
    case 'brush':
      return hierarchyDuplicateBrush(source as THREE.Mesh, parent, offset, created);
    case 'solidModel':
      return hierarchyDuplicateAttach(hierarchyDuplicateSolidModel(source, offset, created), parent);
    case 'volume':
    case 'mesh': {
      if (kind === 'volume') created.volumes = true;
      const clone = ObjectDuplicator.cloneSingleMesh(source as THREE.Mesh);
      clone.position.add(offset);
      return hierarchyDuplicateAttach(clone, parent);
    }
    case 'solidGroup':
    case 'group': {
      const clone = hierarchyDuplicateAttach(hierarchyDuplicateGroupShallow(source, kind, offset), parent);
      for (const child of source.children.slice()) {
        hierarchyDuplicateClone(child, clone, new THREE.Vector3(), created);
      }
      return clone;
    }
  }
}

/**
 * Clones a brush into its solid model under a parent.
 *
 * @param source Brush mesh.
 * @param parent Solid root or CSG group of the same model.
 * @param offset Position offset.
 * @param created Receives the unregistered clone.
 * @returns Clone mesh.
 */
function hierarchyDuplicateBrush(
  source: THREE.Mesh,
  parent: THREE.Object3D,
  offset: THREE.Vector3,
  created: HierarchyDuplicateCreated,
): THREE.Object3D {
  const model = SolidModel.fromObject(source);
  const instance = model?.findBrushByMesh(source);
  if (!model || !instance) throw new Error(`Duplicate found brush "${source.name}" outside its solid model`);
  const clone = model.cloneBrushUnder(instance, parent, offset);
  const list = created.brushes.get(model) ?? [];
  list.push(clone);
  created.brushes.set(model, list);
  return clone.mesh!;
}

/**
 * Copies a solid model as an independent model with fresh brush ids.
 *
 * @param source Solid model root.
 * @param offset Position offset.
 * @param created Notes modifier volumes inside the copy.
 * @returns Copied root.
 */
function hierarchyDuplicateSolidModel(
  source: THREE.Object3D,
  offset: THREE.Vector3,
  created: HierarchyDuplicateCreated,
): THREE.Object3D {
  const model = SolidModel.fromObject(source);
  if (!model || model.root !== source) throw new Error(`Duplicate found solid model "${source.name}" without a model`);
  const copy = createIndependentSolidModelDuplicate(model, offset);
  copy.root.traverse((object) => {
    if (ModifierVolume.isVolume(object)) created.volumes = true;
  });
  return copy.root;
}

/**
 * Creates an empty group with the transform, visibility and CSG operation of a
 * source group and a fresh copy name.
 *
 * @param source Plain group or CSG group.
 * @param kind Its kind.
 * @param offset Position offset.
 * @returns Empty copy.
 */
function hierarchyDuplicateGroupShallow(
  source: THREE.Object3D,
  kind: 'solidGroup' | 'group',
  offset: THREE.Vector3,
): THREE.Group {
  const clone = new THREE.Group();
  clone.name = hierarchyNameAllocator.allocateFromSourceName(source.name);
  clone.position.copy(source.position).add(offset);
  clone.quaternion.copy(source.quaternion);
  clone.scale.copy(source.scale);
  clone.visible = source.visible;
  if (kind === 'solidGroup') markAsSolidCsgGroup(clone, getSolidGroupOperation(source));
  return clone;
}

/**
 * Appends an object to a parent.
 *
 * @param object Object to add.
 * @param parent New parent.
 * @returns The object.
 */
function hierarchyDuplicateAttach(object: THREE.Object3D, parent: THREE.Object3D): THREE.Object3D {
  parent.add(object);
  return object;
}
