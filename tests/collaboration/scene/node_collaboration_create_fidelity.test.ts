import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { serializeFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';

/** One object type the editor can add, built the way the editor builds it. */
interface CreateFidelityCase {
  name: string;
  build: () => THREE.Object3D;
  /** False when the editor always creates this type at the origin. */
  posed?: boolean;
}

const PRIMITIVES = new ToolPrimitiveCreation(new THREE.Group());

/**
 * Builds a two-brush solid model.
 *
 * @returns Solid model root.
 */
function solidModelBuild(): THREE.Object3D {
  const model = new SolidModel('Solid');
  model.addBoxBrush(2, SolidOperation.Additive);
  model.addBoxBrush(1, SolidOperation.Subtractive);
  return model.root;
}

/**
 * Imports a small non-primitive OBJ mesh with its own UVs.
 *
 * @returns Imported mesh.
 */
function objImportBuild(): THREE.Object3D {
  const text = [
    'v 0 0 0',
    'v 2 0 0',
    'v 2 1 1',
    'v 0 1.5 0',
    'vt 0 0',
    'vt 1 0',
    'vt 1 1',
    'vt 0 1',
    'f 1/1 2/2 3/3 4/4',
  ];
  const mesh = new ObjImporter().importFromText(text.join('\n'), 'quad.obj').meshes[0];
  if (mesh === undefined) throw new Error('OBJ import built no mesh');
  return mesh;
}

/**
 * Places an object at a random pose so orientation mismatches show.
 *
 * @param object Object to pose.
 * @returns The same object.
 */
function poseRandomize(object: THREE.Object3D): THREE.Object3D {
  object.position.set(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2);
  object.rotation.y += Math.random() * Math.PI;
  return object;
}

const CASES: CreateFidelityCase[] = [
  { name: 'cube', build: () => PRIMITIVES.createBox(1, 1, 1) },
  { name: 'sphere', build: () => PRIMITIVES.createSphere(0.5) },
  { name: 'cylinder', build: () => PRIMITIVES.createCylinder(0.5, 0.5, 1) },
  { name: 'plane', build: () => PRIMITIVES.createPlane(2, 2) },
  {
    name: 'terrain',
    build: () => new TerrainGenerator().createTerrain(20, 20, 8, 2.5, 1 + Math.floor(Math.random() * 900)),
  },
  { name: 'bevel volume', build: () => ModifierVolumeBevel.create() },
  { name: 'solid model', build: solidModelBuild, posed: false },
  { name: 'group', build: () => new THREE.Group() },
  { name: 'imported OBJ mesh', build: objImportBuild },
];

/**
 * Keys a peer may legitimately hold differently: lock state, local import
 * markers, the live document.
 */
const LOCAL_USERDATA_KEYS = new Set(['meshDocument', 'editorLocked', 'importedFromObj']);

/**
 * Summarizes the editable MeshDocument bound to an object.
 *
 * @param object Object that may carry a document.
 * @returns Vertex, face and half-edge counts, or null.
 */
function documentDescribe(object: THREE.Object3D): number[] | null {
  const document = readPersistentMeshDocument(object);
  if (document === null) return null;
  const topology = document.getTopology();
  return [topology.getVertexCount(), topology.getFaceCount(), topology.getHalfEdgeCount()];
}

/**
 * Rounds numbers of an attribute so float noise does not count as a change.
 *
 * @param attribute Buffer attribute or undefined.
 * @returns Rounded values, or null.
 */
function attributeValues(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
): number[] | null {
  if (attribute === undefined) return null;
  const values: number[] = [];
  for (let index = 0; index < attribute.count; index++) {
    for (let component = 0; component < attribute.itemSize; component++) {
      values.push(Math.round(attribute.getComponent(index, component) * 1e4) / 1e4 + 0);
    }
  }
  return values;
}

/**
 * Describes the display material of a mesh.
 *
 * @param material Mesh material.
 * @returns Plain description.
 */
function materialDescribe(material: THREE.Material): Record<string, unknown> {
  const typed = material as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  return {
    type: material.type,
    color: typed.color?.getHex() ?? null,
    flatShading: (material as THREE.MeshStandardMaterial).flatShading ?? null,
    map: typed.map ? typed.map.uuid : null,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    depthWrite: material.depthWrite,
  };
}

/**
 * Describes one object: pose, geometry, material, texture maps and children.
 *
 * @param object Object to describe.
 * @returns Plain description.
 */
function objectDescribe(object: THREE.Object3D): Record<string, unknown> {
  object.updateMatrixWorld(true);
  const base = {
    type: object.type,
    matrix: object.matrixWorld.elements.map((value) => Math.round(value * 1e4) / 1e4 + 0),
    children: object.children.map((child) => `${child.type}:${userDataKeysShared(child).join(',')}`).sort(),
    userData: JSON.parse(
      JSON.stringify(object.userData, (key, value) => (LOCAL_USERDATA_KEYS.has(key) ? undefined : value)),
    ),
    document: documentDescribe(object),
  };
  if (!(object instanceof THREE.Mesh)) return base;
  const geometry = object.geometry as THREE.BufferGeometry;
  const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
  return {
    ...base,
    position: attributeValues(geometry.getAttribute('position')),
    normal: attributeValues(geometry.getAttribute('normal')),
    uv: attributeValues(geometry.getAttribute('uv')),
    index: geometry.index ? Array.from(geometry.index.array) : null,
    groups: geometry.groups.map((group) => ({ ...group })),
    materials: materials.map(materialDescribe),
    faceTextureMaps: getFaceTextureMaps(object).map((entry) => ({
      triangleIndices: entry.triangleIndices,
      mapping: serializeFaceTextureMapping(entry.mapping),
    })),
  };
}

/**
 * Lists the shared userData keys of an object.
 *
 * @param object Object to inspect.
 * @returns Sorted keys without member-local ones.
 */
function userDataKeysShared(object: THREE.Object3D): string[] {
  return Object.keys(object.userData)
    .filter((key) => !LOCAL_USERDATA_KEYS.has(key))
    .sort();
}

/**
 * Describes an object and every descendant that is not a decorative line, as
 * JSON values so signed zeros compare equal. Descendants are sorted because a
 * rebuilt solid model may list its result mesh after its brushes.
 *
 * @param root Subtree root.
 * @returns Root description followed by sorted descendant descriptions.
 */
function subtreeDescribe(root: THREE.Object3D): unknown[] {
  const descendants: string[] = [];
  root.traverse((object) => {
    if (object === root || object instanceof THREE.LineSegments) return;
    descendants.push(JSON.stringify(objectDescribe(object)));
  });
  return [objectDescribe(root), ...descendants.sort()].map((description) =>
    typeof description === 'string' ? JSON.parse(description) : JSON.parse(JSON.stringify(description)),
  );
}

/**
 * Creates an empty owner and a joiner synced to it.
 *
 * @returns Owner and joiner replicas.
 */
function replicasEmptyPair(): { owner: ReplicaCollaborationScene; joiner: ReplicaCollaborationScene } {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { owner, joiner };
}

/**
 * Returns the object a replica holds under an id.
 *
 * @param replica Replica.
 * @param id Node id.
 * @returns Object.
 */
function replicaObject(replica: ReplicaCollaborationScene, id: string): THREE.Object3D {
  replica.applier.invalidate();
  const object = replica.applier.nodes().get(id)?.object;
  if (object === undefined) throw new Error(`replica is missing ${id}`);
  return object;
}

describe('collaboration create fidelity', () => {
  it.each(CASES)('a peer rebuilds a created $name exactly like its creator', ({ build, posed }) => {
    const { owner, joiner } = replicasEmptyPair();
    const tracker = new TrackerCollaboration(owner, 1 << 22);
    const created = posed === false ? build() : poseRandomize(build());
    owner.world.add(created);
    const commit = tracker.commit();
    joiner.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    expect(subtreeDescribe(replicaObject(joiner, created.uuid))).toEqual(subtreeDescribe(created));
  });

  it.each(CASES)('a late joiner rebuilds a $name exactly like its creator', ({ build, posed }) => {
    const { owner } = replicasEmptyPair();
    const tracker = new TrackerCollaboration(owner, 1 << 22);
    const created = posed === false ? build() : poseRandomize(build());
    owner.world.add(created);
    tracker.commit();
    const late = new ReplicaCollaborationScene(new THREE.Group());
    late.locks.selfSet(3);
    late.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    expect(subtreeDescribe(replicaObject(late, created.uuid))).toEqual(subtreeDescribe(created));
  });
});
