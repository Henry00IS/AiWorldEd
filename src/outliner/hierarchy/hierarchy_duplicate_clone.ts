import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getSolidGroupOperation, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { isObjectLocked, setObjectLocked } from '@/utils/object_lock.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * What a hierarchy node is, as far as copying goes. These are all the kinds a
 * user can make: scene file entries are meshes (modifier volumes when they
 * carry a stack) and groups (solid models when they carry a brush tree), and a
 * solid model holds brushes, CSG groups and modifier nodes (volumes and
 * generators). Anything else, such as outlines, edges, guides, the solid result
 * or other internal render objects, is a helper and is never copied.
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
 * Classifies a hierarchy node for copying.
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
  return 'helper';
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
      return hierarchyDuplicateAttach(hierarchyDuplicateEntryCopy(source, offset), parent);
    }
    case 'solidGroup':
    case 'group': {
      const shallow =
        kind === 'group'
          ? hierarchyDuplicateEntryCopy(source, offset)
          : hierarchyDuplicateCsgGroupShallow(source, offset);
      const clone = hierarchyDuplicateAttach(shallow, parent);
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
 * Copies one mesh, modifier volume or plain group without its children through
 * the scene file codec, so the copy keeps everything a saved file keeps (the
 * editable document, texture mappings, primitive source, modifier stack,
 * visibility and unknown fields) and is built exactly like the replica that
 * collaboration members build from it. The lock flag is kept as well.
 *
 * @param source Mesh, volume or plain group.
 * @param offset Position offset.
 * @returns Copy with a new id and a fresh copy name.
 */
function hierarchyDuplicateEntryCopy(source: THREE.Object3D, offset: THREE.Vector3): THREE.Object3D {
  const entry = structuredClone(new SceneSerializer().createEntryForChild(source, ''));
  entry.uuid = THREE.MathUtils.generateUUID();
  entry.name = hierarchyNameAllocator.allocateFromSourceName(source.name);
  const clone = new SceneDeserializer({ exactReplica: true }).objectCreateFromEntry(entry);
  clone.position.add(offset);
  if (isObjectLocked(source)) setObjectLocked(clone, true);
  return clone;
}

/**
 * Creates an empty CSG group with the transform, visibility, lock and CSG
 * operation of a source group and a fresh copy name.
 *
 * @param source CSG group.
 * @param offset Position offset.
 * @returns Empty copy.
 */
function hierarchyDuplicateCsgGroupShallow(source: THREE.Object3D, offset: THREE.Vector3): THREE.Group {
  const clone = new THREE.Group();
  clone.name = hierarchyNameAllocator.allocateFromSourceName(source.name);
  clone.position.copy(source.position).add(offset);
  clone.quaternion.copy(source.quaternion);
  clone.scale.copy(source.scale);
  clone.visible = source.visible;
  if (isObjectLocked(source)) setObjectLocked(clone, true);
  markAsSolidCsgGroup(clone, getSolidGroupOperation(source));
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
