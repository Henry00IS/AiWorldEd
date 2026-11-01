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
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import { rebuildComponentTransformDisplays } from '@/edit/transform/component_transform_apply.js';
import type {
  ComponentTransformBrushVertex,
  ComponentTransformMeshVertex,
} from '@/edit/transform/component_transform_vertex.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';

let relayUp = false;
let roomCurrent = '';

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Opens a room holding a solid model and a box mesh, with Alice and Bob joined,
 * and remembers it in `roomCurrent`.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, (client) => {
    client.solidAdd('Solid');
    const crate = client.boxAdd('Crate');
    crate.position.set(4, 0, 0);
  });
  roomCurrent = room;
  return [owner, await harnessRelayJoin(room, 'Alice'), await harnessRelayJoin(room, 'Bob')];
}

/**
 * Holds or releases a pointer on a client, as a gizmo drag does, so the idle
 * poll never commits half a drag.
 *
 * @param client Client.
 * @param down True while dragging.
 */
function pointerHold(client: HarnessCollaborationEditor, down: boolean): void {
  (client.runtime.session as unknown as { pointersDown: number }).pointersDown = down ? 1 : 0;
}

/**
 * Describes the +x face vertices of the solid's first brush for a drag.
 *
 * @param client Client.
 * @returns Vertex descriptors.
 */
function brushFace(client: HarnessCollaborationEditor): ComponentTransformBrushVertex[] {
  const model = client.solid('Solid');
  const instance = model.getBrushes()[0];
  if (instance === undefined) throw new Error('solid without brushes');
  const vertices: ComponentTransformBrushVertex[] = [];
  instance.brush.vertices.forEach((point, vertexIndex) => {
    if (point.x <= 0) return;
    vertices.push({
      kind: 'brush',
      targetId: `brush:${instance.id}`,
      vertexIndex,
      solidModel: model,
      brushId: instance.id,
      brush: instance.brush,
      mesh: instance.mesh,
      initialLocal: point.clone(),
    });
  });
  return vertices;
}

/**
 * Moves drag vertices to x = initial x times a factor and refreshes displays,
 * like one frame of a gizmo drag.
 *
 * @param vertices Drag vertices.
 * @param factor X factor.
 */
function dragFrame(vertices: ComponentTransformBrushVertex[], factor: number): void {
  vertices.forEach((vertex) => {
    vertex.brush.vertices[vertex.vertexIndex]!.x = vertex.initialLocal.x * factor;
  });
  rebuildComponentTransformDisplays(vertices);
}

/**
 * Reads the widest x extent of the solid's brush hull and compiled result.
 *
 * @param client Client.
 * @returns Hull and result extents.
 */
function extents(client: HarnessCollaborationEditor): [number, number] {
  const model = client.solid('Solid');
  const span = (geometry: THREE.BufferGeometry | undefined): number => {
    if (geometry === undefined) return 0;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    return box === null ? 0 : Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  };
  return [span(model.getBrushes()[0]?.mesh?.geometry), span(model.getResultMesh()?.geometry)];
}

/**
 * Returns whether a client shows the brush at a given x extent.
 *
 * @param client Client.
 * @param extent Expected extent.
 * @returns True when hull and result match.
 */
function shows(client: HarnessCollaborationEditor, extent: number): boolean {
  return extents(client).every((value) => Math.abs(value - extent) < 1e-6);
}

/**
 * Starts a drag on Alice: she selects the brush and holds the pointer.
 *
 * @param alice Alice.
 * @returns Drag vertices.
 */
async function dragStart(alice: HarnessCollaborationEditor): Promise<ComponentTransformBrushVertex[]> {
  const brush = alice.solid('Solid').getBrushes()[0]?.mesh?.name ?? '';
  await alice.select(brush);
  pointerHold(alice, true);
  return brushFace(alice);
}

/**
 * Moves the +x vertices of Crate to a given x the way a mesh edit-mode drag
 * frame does: through the bound mesh document and the display rebuild.
 *
 * @param client Client.
 * @param x New x.
 */
function meshStretch(client: HarnessCollaborationEditor, x: number): void {
  const mesh = client.mesh('Crate');
  const document = ensureMeshEditDocument(mesh);
  if (document === null) throw new Error('mesh without edit document');
  const positions = document.getTopology().getPositions();
  const vertices: ComponentTransformMeshVertex[] = [];
  for (let index = 0; index * 3 < positions.length; index++) {
    if ((positions[index * 3] ?? 0) <= 0) continue;
    const initialLocal = new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    positions[index * 3] = x;
    vertices.push({ kind: 'mesh', targetId: mesh.uuid, vertexIndex: index, mesh, document, initialLocal });
  }
  rebuildComponentTransformDisplays(vertices);
}

/**
 * Reads the largest x of Crate's mesh vertices.
 *
 * @param client Client.
 * @returns X.
 */
function meshExtent(client: HarnessCollaborationEditor): number {
  const position = (client.mesh('Crate').geometry as THREE.BufferGeometry).getAttribute('position');
  let largest = -Infinity;
  for (let index = 0; index < position.count; index++) largest = Math.max(largest, position.getX(index));
  return largest;
}

/** Edit-mode geometry streams live while the drag is in progress. */
describe('live edit-mode shapes over the relay', { timeout: 30000 }, () => {
  it('streams a brush face drag before the commit and settles on commit', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live shape commit');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    const vertices = await dragStart(alice!);
    dragFrame(vertices, 1.5);
    await harnessCollaborationUntil(() => shows(bob!, 1.5) && shows(owner, 1.5), 3000, 'bob sees the drag');
    dragFrame(vertices, 2);
    await harnessCollaborationUntil(() => shows(bob!, 2), 3000, 'bob follows the drag');
    alice!.commandStack.recordExecuted(new CommandComponentPositions(vertices));
    pointerHold(alice!, false);
    await harnessRelayConverged(clients);
    expect(shows(bob!, 2) && shows(owner, 2)).toBe(true);
    alice!.commandStack.undo();
    await harnessCollaborationUntil(() => shows(bob!, 1) && shows(owner, 1), 3000, 'undo seen');
    await harnessRelayConverged(clients);
  });

  it('restores receivers when the drag is cancelled', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live shape cancel');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    const vertices = await dragStart(alice!);
    dragFrame(vertices, 1.5);
    await harnessCollaborationUntil(() => shows(bob!, 1.5), 3000, 'bob sees the drag');
    dragFrame(vertices, 1);
    pointerHold(alice!, false);
    alice!.commit();
    await harnessCollaborationUntil(() => shows(bob!, 1) && shows(owner, 1), 3000, 'cancel seen');
    await harnessRelayConverged(clients);
    expect(alice!.commandStack.canUndo()).toBe(false);
  });

  it('streams a mesh vertex drag before the commit', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live shape mesh');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    await alice!.select('Crate');
    pointerHold(alice!, true);
    meshStretch(alice!, 3);
    await harnessCollaborationUntil(() => meshExtent(bob!) === 3 && meshExtent(owner) === 3, 3000, 'mesh drag seen');
    pointerHold(alice!, false);
    alice!.commit();
    await harnessRelayConverged(clients);
    expect(meshExtent(bob!)).toBe(3);
  });

  it('restores receivers when a plain move is cancelled', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live pose cancel');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    await alice!.select('Crate');
    pointerHold(alice!, true);
    alice!.object('Crate').position.x = 9;
    await harnessCollaborationUntil(() => bob!.object('Crate').position.x === 9, 3000, 'bob sees the move');
    alice!.object('Crate').position.x = 4;
    pointerHold(alice!, false);
    alice!.commit();
    await harnessCollaborationUntil(
      () => bob!.object('Crate').position.x === 4 && owner.object('Crate').position.x === 4,
      3000,
      'cancel seen',
    );
    await harnessRelayConverged(clients);
  });

  it('puts a moved object back when the mover leaves mid-move', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live pose leave');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    await alice!.select('Crate');
    pointerHold(alice!, true);
    alice!.object('Crate').position.x = 9;
    await harnessCollaborationUntil(() => bob!.object('Crate').position.x === 9, 3000, 'bob sees the move');
    alice!.runtime.disconnect();
    await harnessCollaborationUntil(
      () => bob!.object('Crate').position.x === 4 && owner.object('Crate').position.x === 4,
      3000,
      'move dropped',
    );
    await harnessRelayConverged([owner, bob!]);
    await bob!.select('Crate');
  });

  it('restores receivers and frees the brush when the dragging member leaves mid-drag', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live shape leave');
    const [owner, alice, bob] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    const vertices = await dragStart(alice!);
    dragFrame(vertices, 1.5);
    await harnessCollaborationUntil(() => shows(bob!, 1.5) && shows(owner, 1.5), 3000, 'drag seen');
    alice!.runtime.disconnect();
    await harnessCollaborationUntil(() => shows(bob!, 1) && shows(owner, 1), 3000, 'drag dropped');
    await harnessRelayConverged([owner, bob!]);
    await bob!.select(bob!.solid('Solid').getBrushes()[0]?.mesh?.name ?? '');
  });

  it('brings a member joining mid-drag to the committed shape, then the final one', async ({ skip }) => {
    if (!relayUp) skip();
    const clients = await roomOfThree('live shape late');
    const [owner, alice] = clients as [HarnessCollaborationEditor, ...HarnessCollaborationEditor[]];
    const vertices = await dragStart(alice!);
    dragFrame(vertices, 1.5);
    await harnessCollaborationUntil(() => shows(owner, 1.5), 3000, 'drag seen');
    const carol = await harnessRelayJoin(roomCurrent, 'Carol');
    dragFrame(vertices, 2);
    await harnessCollaborationUntil(() => shows(carol, 2), 3000, 'carol follows the drag');
    alice!.commandStack.recordExecuted(new CommandComponentPositions(vertices));
    pointerHold(alice!, false);
    await harnessRelayConverged([...clients, carol]);
    expect(shows(carol, 2)).toBe(true);
  });
});
