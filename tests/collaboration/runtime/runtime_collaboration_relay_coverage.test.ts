import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { CommandObjectColorSet } from '@/outliner/commands/command_object_color_set.js';
import { CommandObjectDuplicate } from '@/outliner/commands/command_object_duplicate.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { CommandObjectReparent } from '@/outliner/commands/command_object_reparent.js';
import { CommandObjectUngroup } from '@/outliner/commands/command_object_ungroup.js';
import { CommandObjectVisibilityToggle } from '@/outliner/commands/command_object_visibility_toggle.js';
import { applyOutlinerLockToggle } from '@/outliner/hierarchy/helpers_outliner_action.js';
import { CommandSolidBrushOperationSet } from '@/solid/commands/brush/command_solid_brush_operation_set.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import type {
  ComponentTransformBrushVertex,
  ComponentTransformMeshVertex,
} from '@/edit/transform/component_transform_vertex.js';
import { clearMeshEditDocumentBinding, ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { CommandMeshCsgBoolean } from '@/tools/csg/commands/command_mesh_csg_boolean.js';
import { CommandMeshClip } from '@/tools/clip_plane/commands/command_mesh_clip.js';
import { isObjectLocked } from '@/utils/object_lock.js';
import { CommandObjectDelete } from '@/outliner/commands/command_object_delete.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { CommandModifierBevelVolumeCreate } from '@/modifier/volume/command_modifier_bevel_volume_create.js';
import { CommandModifierBevelDistanceSet } from '@/modifier/volume/command_modifier_bevel_distance_set.js';

/** One user-facing operation run through the two-client checks. */
interface CoverageCase {
  /** Operation label. */
  op: string;
  /** Names of the objects the operation edits. */
  targets: (client: HarnessCollaborationEditor) => string[];
  /** Runs the operation on the editing client. */
  apply: (client: HarnessCollaborationEditor) => void;
  /** Whether a client shows the result. */
  done: (client: HarnessCollaborationEditor) => boolean;
  /**
   * True when redo only recreates objects, so the held source does not block
   * it.
   */
  redoFree?: boolean;
}

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds Crate, Barrel, Group A holding Cube, and a solid model.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  owner.boxAdd('Crate').position.set(4, 0, 0);
  owner.boxAdd('Barrel').position.set(-4, 0, 0);
  owner.boxAdd('Cube', owner.groupAdd('Group A'));
  owner.solidAdd('Solid');
  const bevel = ModifierVolumeBevel.create();
  bevel.name = 'Bevel';
  bevel.scale.setScalar(4);
  owner.world.add(bevel);
}

/**
 * Reads the name of the first brush of the solid model.
 *
 * @param client Client.
 * @returns Brush mesh name.
 */
function brushName(client: HarnessCollaborationEditor): string {
  return client.solid('Solid').getBrushes()[0]?.mesh?.name ?? '';
}

/**
 * Builds a result mesh standing in for a clip or CSG result.
 *
 * @param name Mesh name.
 * @returns Mesh.
 */
function resultMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/**
 * Moves the first vertex of a mesh the way edit mode does: through its bound
 * mesh document and a component positions command, then leaves edit mode.
 *
 * @param client Client.
 * @param mesh Mesh.
 */
function vertexMove(client: HarnessCollaborationEditor, mesh: THREE.Mesh): void {
  const document = ensureMeshEditDocument(mesh);
  if (document === null) throw new Error('mesh without edit document');
  const positions = document.getTopology().getPositions();
  const initialLocal = new THREE.Vector3(positions[0], positions[1], positions[2]);
  positions[0] = (positions[0] ?? 0) + 0.5;
  const vertex: ComponentTransformMeshVertex = {
    kind: 'mesh',
    targetId: mesh.uuid,
    vertexIndex: 0,
    mesh,
    document,
    initialLocal,
  };
  client.commandStack.push(new CommandComponentPositions([vertex]));
  clearMeshEditDocumentBinding(mesh);
}

/**
 * Pushes the +x face of the first brush of the solid model outwards the way
 * brush edit mode does, through a component positions command.
 *
 * @param client Client.
 */
function brushVertexMove(client: HarnessCollaborationEditor): void {
  const model = client.solid('Solid');
  const instance = model.getBrushes()[0];
  if (instance === undefined) throw new Error('solid without brushes');
  const brush = instance.brush;
  const vertices: ComponentTransformBrushVertex[] = [];
  brush.vertices.forEach((point, vertexIndex) => {
    if (point.x <= 0) return;
    const initialLocal = point.clone();
    point.x *= 1.5;
    vertices.push({
      kind: 'brush',
      targetId: `brush:${instance.id}`,
      vertexIndex,
      solidModel: model,
      brushId: instance.id,
      brush,
      mesh: instance.mesh,
      initialLocal,
    });
  });
  client.commandStack.push(new CommandComponentPositions(vertices));
}

/**
 * Reads the largest x coordinate among the first brush's vertices.
 *
 * @param client Client.
 * @returns Coordinate.
 */
function brushVertexX(client: HarnessCollaborationEditor): number {
  const points = client.solid('Solid').getBrushes()[0]?.brush.vertices ?? [];
  return Math.max(0, ...points.map((point) => point.x));
}

/**
 * Reads the widest x extent of a geometry.
 *
 * @param geometry Geometry, or undefined.
 * @returns Extent.
 */
function geometrySpanX(geometry: THREE.BufferGeometry | undefined): number {
  if (geometry === undefined) return 0;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return box === null ? 0 : Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
}

/**
 * Returns whether the moved brush vertex shows in the data, the brush hull and
 * the compiled CSG result of a client.
 *
 * @param client Client.
 * @returns True when every layer shows the edit.
 */
function brushVertexShown(client: HarnessCollaborationEditor): boolean {
  const model = client.solid('Solid');
  const hull = model.getBrushes()[0]?.mesh?.geometry;
  const result = model.getResultMesh()?.geometry;
  const near = (value: number): boolean => Math.abs(value - 1.5) < 1e-6;
  return near(brushVertexX(client)) && near(geometrySpanX(hull)) && near(geometrySpanX(result));
}

/**
 * Halves the U scale of the first face of a mesh, as the UV tools do.
 *
 * @param mesh Mesh.
 */
function uvScale(mesh: THREE.Mesh): void {
  const maps = getFaceTextureMaps(mesh);
  const first = maps[0];
  if (first === undefined) throw new Error('mesh without face maps');
  first.mapping.uv.u.w = 0.5;
  setFaceTextureMaps(mesh, maps);
}

/**
 * Deletes Crate the way the outliner does.
 *
 * @param client Client.
 */
function crateDelete(client: HarnessCollaborationEditor): void {
  const mesh = client.mesh('Crate');
  const parent = mesh.parent;
  const snapshot = {
    mesh,
    parent,
    siblingIndex: parent ? parent.children.indexOf(mesh) : 0,
    position: mesh.position.clone(),
    rotation: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
    name: mesh.name,
    geometry: mesh.geometry.clone(),
    material: (mesh.material as THREE.Material).clone(),
  };
  client.commandStack.push(new CommandObjectDelete([snapshot]));
}

/** Bevel settings every parameter of which differs from the defaults. */
const BEVEL_EDITED = {
  distance: 0.3,
  segments: 3,
  angleDegrees: 45,
  uvFlow: 'positive-z',
  uvLayout: 'side',
  uvScaleU: 2,
  uvScaleV: 0.5,
  uvOffsetU: 0.25,
  uvOffsetV: 0.125,
  uvRotation: 30,
} as const;

/**
 * Changes every bevel volume parameter through the inspector command.
 *
 * @param client Client.
 */
function bevelEdit(client: HarnessCollaborationEditor): void {
  const volume = client.object('Bevel');
  const before = ModifierVolumeBevel.readSettings(volume);
  const after = { ...before, ...BEVEL_EDITED, blacklist: [client.object('Barrel').uuid] };
  client.commandStack.push(new CommandModifierBevelDistanceSet([{ volume, before, after }]));
}

/**
 * Returns whether a client shows every edited bevel parameter.
 *
 * @param client Client.
 * @returns True when all parameters match.
 */
function bevelEdited(client: HarnessCollaborationEditor): boolean {
  const settings = ModifierVolumeBevel.readSettings(client.object('Bevel'));
  const keys = Object.keys(BEVEL_EDITED) as (keyof typeof BEVEL_EDITED)[];
  const same = keys.every((key) => settings[key] === BEVEL_EDITED[key]);
  return same && settings.blacklist[0] === client.object('Barrel').uuid;
}

/**
 * Adds a named bevel volume the way the creation tool does.
 *
 * @param client Client.
 */
function bevelCreate(client: HarnessCollaborationEditor): void {
  const volume = ModifierVolumeBevel.create();
  volume.name = 'Bevel Two';
  volume.position.set(4, 0, 0);
  client.commandStack.push(new CommandModifierBevelVolumeCreate(volume, client.world));
}

const crate = (): string[] => ['Crate'];

const CASES: CoverageCase[] = [
  {
    op: 'rename (outliner, inspector)',
    targets: crate,
    apply: (client) => client.commandStack.push(new CommandObjectRename(client.object('Crate'), 'Crate renamed')),
    done: (client) => client.find('Crate renamed') !== undefined,
  },
  {
    op: 'visibility toggle',
    targets: crate,
    apply: (client) => client.commandStack.push(new CommandObjectVisibilityToggle(client.object('Crate'))),
    done: (client) => client.object('Crate').visible === false,
  },
  {
    op: 'lock toggle',
    targets: crate,
    apply: (client) => void applyOutlinerLockToggle(client.object('Crate'), () => undefined),
    done: (client) => isObjectLocked(client.object('Crate')),
  },
  {
    op: 'material color',
    targets: crate,
    apply: (client) => client.commandStack.push(new CommandObjectColorSet([client.mesh('Crate')], 0x3366cc)),
    done: (client) => (client.mesh('Crate').material as THREE.MeshStandardMaterial).color.getHex() === 0x3366cc,
  },
  {
    op: 'transform',
    targets: crate,
    apply: (client) => client.object('Crate').position.set(1, 2, 3),
    done: (client) => client.object('Crate').position.y === 2,
  },
  {
    op: 'rotate and scale',
    targets: crate,
    apply: (client) => {
      client.object('Crate').rotation.set(0, Math.PI / 4, 0);
      client.object('Crate').scale.set(1, 2.5, 1);
    },
    done: (client) =>
      Math.abs(client.object('Crate').rotation.y - Math.PI / 4) < 1e-6 && client.object('Crate').scale.y === 2.5,
  },
  {
    op: 'delete',
    targets: crate,
    apply: crateDelete,
    done: (client) => client.find('Crate') === undefined,
  },
  {
    op: 'bevel volume create',
    targets: crate,
    apply: bevelCreate,
    done: (client) =>
      client.find('Bevel Two') !== undefined && ModifierVolumeBevel.isVolume(client.object('Bevel Two')),
    redoFree: true,
  },
  {
    op: 'bevel volume parameters',
    targets: () => ['Bevel'],
    apply: bevelEdit,
    done: bevelEdited,
  },
  {
    op: 'edit mode vertex',
    targets: crate,
    apply: (client) => vertexMove(client, client.mesh('Crate')),
    done: (client) => new THREE.Box3().setFromObject(client.mesh('Crate'), true).max.x > 4.9,
  },
  {
    op: 'brush edit mode vertex',
    targets: (client) => [brushName(client)],
    apply: brushVertexMove,
    done: brushVertexShown,
  },
  {
    op: 'texture UV',
    targets: crate,
    apply: (client) => uvScale(client.mesh('Crate')),
    done: (client) => getFaceTextureMaps(client.mesh('Crate'))[0]?.mapping.uv.u.w === 0.5,
  },
  {
    op: 'group',
    targets: crate,
    apply: (client) =>
      client.commandStack.push(new CommandObjectGroup([client.object('Crate')], client.world, 'Folder')),
    done: (client) => client.find('Crate')?.parent?.name === 'Folder',
  },
  {
    op: 'ungroup',
    targets: () => ['Group A'],
    apply: (client) => client.commandStack.push(new CommandObjectUngroup(client.object('Group A') as THREE.Group)),
    done: (client) => client.find('Group A') === undefined,
  },
  {
    op: 'outliner reparent',
    targets: crate,
    apply: (client) =>
      client.commandStack.push(new CommandObjectReparent(client.object('Crate'), client.object('Group A'))),
    done: (client) => client.find('Crate')?.parent?.name === 'Group A',
  },
  {
    op: 'outliner reorder',
    targets: () => ['Barrel'],
    apply: (client) =>
      client.commandStack.push(
        new CommandObjectReparent(client.object('Barrel'), client.world, client.object('Crate')),
      ),
    done: (client) =>
      client.world.children.indexOf(client.object('Barrel')) < client.world.children.indexOf(client.object('Crate')),
  },
  {
    op: 'duplicate',
    targets: crate,
    apply: (client) =>
      client.commandStack.push(
        new CommandObjectDuplicate([client.mesh('Crate')], client.world, new THREE.Vector3(0, 0, 2)),
      ),
    done: (client) => client.world.children.filter((child) => child.name.startsWith('Crate')).length === 2,
    redoFree: true,
  },
  {
    op: 'clip',
    targets: crate,
    apply: (client) =>
      client.commandStack.push(new CommandMeshClip(client.mesh('Crate'), resultMesh('Clipped'), client.world)),
    done: (client) => client.find('Clipped') !== undefined && client.find('Crate') === undefined,
  },
  {
    op: 'mesh CSG',
    targets: () => ['Crate', 'Barrel'],
    apply: (client) =>
      client.commandStack.push(
        new CommandMeshCsgBoolean(client.mesh('Crate'), client.mesh('Barrel'), resultMesh('Merged'), client.world),
      ),
    done: (client) => client.find('Merged') !== undefined && client.find('Barrel') === undefined,
  },
  {
    op: 'solid brush operation',
    targets: (client) => [brushName(client)],
    apply: (client) =>
      client.commandStack.push(
        new CommandSolidBrushOperationSet([client.mesh(brushName(client))], SolidOperation.Intersecting),
      ),
    done: (client) => client.solid('Solid').getBrushes()[0]?.operation === SolidOperation.Intersecting,
  },
];

/**
 * Creates the room and joins Alice and Bob.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, sceneBuild);
  const alice = await harnessRelayJoin(room, 'Alice');
  const bob = await harnessRelayJoin(room, 'Bob');
  return [owner, alice, bob];
}

/**
 * Lets Bob select objects and waits until Alice sees his locks.
 *
 * @param alice Alice.
 * @param bob Bob.
 * @param names Object names.
 */
async function bobHolds(
  alice: HarnessCollaborationEditor,
  bob: HarnessCollaborationEditor,
  names: string[],
): Promise<void> {
  await harnessCollaborationUntil(() => bob.selectTry(...names), 3000, 'bob selects');
  await bob.select(...names);
  await harnessCollaborationUntil(
    () => names.every((name) => alice.holderOf(name) === bob.holderOf(name)),
    3000,
    'lock seen',
  );
}

/**
 * Releases Bob's locks and waits until Alice sees them free.
 *
 * @param alice Alice.
 * @param bob Bob.
 * @param names Object names.
 */
async function bobLetsGo(
  alice: HarnessCollaborationEditor,
  bob: HarnessCollaborationEditor,
  names: string[],
): Promise<void> {
  await bob.deselect();
  await harnessCollaborationUntil(() => names.every((name) => alice.holderOf(name) === null), 3000, 'release seen');
}

/**
 * Runs the operation: refused while Bob holds the targets, then synced.
 *
 * @param entry Operation.
 * @param clients Owner, Alice and Bob.
 */
async function caseApply(entry: CoverageCase, clients: HarnessCollaborationEditor[]): Promise<void> {
  const [owner, alice, bob] = clients as [
    HarnessCollaborationEditor,
    HarnessCollaborationEditor,
    HarnessCollaborationEditor,
  ];
  const targets = entry.targets(alice);
  await bobHolds(alice, bob, targets);
  expect(alice.selectTry(...targets)).toBe(false);
  expect(alice.statuses.at(-1)).toContain('Bob');
  await bobLetsGo(alice, bob, targets);
  await alice.select(...targets);
  entry.apply(alice);
  alice.commit();
  await harnessCollaborationUntil(() => entry.done(owner) && entry.done(bob), 3000, `${entry.op} synced`);
  await harnessRelayConverged(clients);
}

/**
 * Undoes the operation, refuses the redo while Bob holds the targets, then
 * redoes it.
 *
 * @param entry Operation.
 * @param clients Owner, Alice and Bob.
 */
async function caseUndo(entry: CoverageCase, clients: HarnessCollaborationEditor[]): Promise<void> {
  const [owner, alice, bob] = clients as [
    HarnessCollaborationEditor,
    HarnessCollaborationEditor,
    HarnessCollaborationEditor,
  ];
  await alice.deselect();
  alice.commandStack.undo();
  await harnessCollaborationUntil(() => !entry.done(owner) && !entry.done(bob), 3000, `${entry.op} undone`);
  await harnessRelayConverged(clients);
  if (entry.redoFree !== true) await redoRefused(alice, bob, entry.targets(alice));
  alice.commandStack.redo();
  await harnessCollaborationUntil(() => entry.done(owner), 3000, `${entry.op} redone`);
  await harnessRelayConverged(clients);
}

/**
 * Checks that a redo is refused while Bob holds the targets, then frees them.
 *
 * @param alice Alice.
 * @param bob Bob.
 * @param targets Object names.
 */
async function redoRefused(
  alice: HarnessCollaborationEditor,
  bob: HarnessCollaborationEditor,
  targets: string[],
): Promise<void> {
  await bobHolds(alice, bob, targets);
  expect(alice.commandStack.redo()).toBe(false);
  expect(alice.statuses.at(-1)).toContain('Bob');
  await bobLetsGo(alice, bob, targets);
}

/** Two-client coverage of every user-facing editing operation in a room. */
describe('collaboration operation coverage over the relay', { timeout: 30000 }, () => {
  CASES.forEach((entry) => {
    it(`${entry.op}: syncs, takes locks, is refused under conflict and undoes`, async ({ skip }) => {
      if (!relayUp) skip();
      const clients = await roomOfThree(`cover ${entry.op}`);
      await caseApply(entry, clients);
      await caseUndo(entry, clients);
    });
  });
});
