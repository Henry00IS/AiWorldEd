import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CameraCollaborationPresence,
  cameraCollaborationLinesFill,
} from '@/collaboration/presence/camera_collaboration_presence.js';
import {
  characterCollaborationTint,
  type CharacterCollaborationModel,
} from '@/collaboration/presence/character_collaboration_presence.js';
import { nametagCollaborationInk } from '@/collaboration/presence/nametag_collaboration_presence.js';
import { ReceiverCollaborationPresence } from '@/collaboration/presence/receiver_collaboration_presence.js';
import { PresenceCollaborationSession } from '@/collaboration/presence/session_collaboration_presence.js';
import { screenCollaborationWorldHeight } from '@/collaboration/presence/screen_collaboration_presence.js';
import {
  PRESENCE_ID_CHARACTER,
  presenceFrameEncode,
  presenceFrameRelay,
  type PresenceEntry,
} from '@/collaboration/shared/presence_frame.js';
import {
  MemberCollaborationRoster,
  memberCollaborationColor,
} from '@/collaboration/sync/member_collaboration_roster.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { HarnessCollaborationEditor } from '../runtime/harness_collaboration_editor.js';

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

/** Test fixture: a host, a roster with member 2 and a manual clock. */
interface Fixture {
  editor: HarnessCollaborationEditor;
  receiver: ReceiverCollaborationPresence;
  frames: (() => void)[];
  clock: { now: number };
  template: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
}

/**
 * Builds the fixture.
 *
 * @returns Fixture.
 */
function fixture(): Fixture {
  const editor = new HarnessCollaborationEditor('A');
  const roster = new MemberCollaborationRoster();
  roster.upsert(2, 'Bea', false, 1);
  const frames: (() => void)[] = [];
  const clock = { now: 0 };
  const template = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const model: CharacterCollaborationModel = {
    ready: () => true,
    load: () => Promise.resolve(),
    build: () => template.clone(),
  };
  const options = { now: () => clock.now, schedule: (callback: () => void) => frames.push(callback), model };
  return { editor, receiver: new ReceiverCollaborationPresence(editor.host, roster, options), frames, clock, template };
}

/**
 * Builds an entry.
 *
 * @param id Entry id.
 * @param x X position.
 * @returns Entry.
 */
function entry(id: number, x: number): PresenceEntry {
  return { id, position: [x, 1, 0], quaternion: [0, 0, 0, 1], fov: id === PRESENCE_ID_CHARACTER ? 0 : 60 };
}

/**
 * Runs scheduled animation frames.
 *
 * @param frames Pending callbacks.
 */
function flush(frames: (() => void)[]): void {
  while (frames.length > 0) frames.shift()?.();
}

describe('presence receiver', () => {
  it('shows a remote camera as an unpickable, unsaved helper in the member color', () => {
    const { editor, receiver } = fixture();
    receiver.frame({ sender: 2, entries: [entry(0, 3)] });
    const gizmo = receiver.objectsOf(2).get(0);
    expect(gizmo).toBeDefined();
    expect(editor.helpers.children).toContain(gizmo);
    expect(editor.world.children).toHaveLength(0);
    gizmo?.traverse((child) => expect(isEditorHelperObject(child)).toBe(true));
    const hits: THREE.Intersection[] = [];
    gizmo?.traverse((child) => child.raycast(new THREE.Raycaster(), hits));
    expect(hits).toEqual([]);
    const lines = gizmo?.getObjectsByProperty('type', 'LineSegments')[0] as THREE.LineSegments;
    const material = lines.material as THREE.LineBasicMaterial;
    expect(material.color.getHex()).toBe(memberCollaborationColor(1));
    expect(gizmo?.getObjectsByProperty('type', 'Sprite')).toHaveLength(1);
  });

  it('interpolates toward new poses and stops scheduling when settled', () => {
    const { receiver, frames, clock } = fixture();
    receiver.frame({ sender: 2, entries: [entry(0, 0)] });
    flush(frames);
    clock.now = 200;
    receiver.frame({ sender: 2, entries: [entry(0, 10)] });
    const gizmo = receiver.objectsOf(2).get(0)?.children[0];
    clock.now = 300;
    frames.shift()?.();
    expect(gizmo?.position.x).toBeCloseTo(5);
    expect(frames).toHaveLength(1);
    clock.now = 500;
    flush(frames);
    expect(gizmo?.position.x).toBe(10);
    expect(frames).toHaveLength(0);
  });

  it('removes entries missing from the latest frame, empty frames and departed members', () => {
    const { editor, receiver } = fixture();
    receiver.frame({ sender: 2, entries: [entry(0, 0), entry(1, 1)] });
    receiver.frame({ sender: 2, entries: [entry(1, 1)] });
    expect([...receiver.objectsOf(2).keys()]).toEqual([1]);
    receiver.frame({ sender: 2, entries: [] });
    expect(editor.helpers.children).toHaveLength(0);
    receiver.frame({ sender: 2, entries: [entry(0, 0)] });
    receiver.memberLeft(2);
    expect(editor.helpers.children).toHaveLength(0);
    receiver.frame({ sender: 9, entries: [entry(0, 0)] });
    expect(editor.helpers.children).toHaveLength(0);
  });

  it('shows a tinted copy of the character without touching the shared model', () => {
    const { receiver, template } = fixture();
    receiver.frame({ sender: 2, entries: [entry(PRESENCE_ID_CHARACTER, 4)] });
    const character = receiver.objectsOf(2).get(PRESENCE_ID_CHARACTER);
    const body = character?.getObjectsByProperty('type', 'Mesh')[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(body.material).not.toBe(template.material);
    expect(body.material.color.getHex()).not.toBe(0xffffff);
    expect(template.material.color.getHex()).toBe(0xffffff);
    expect(isEditorHelperObject(body)).toBe(true);
    expect(body.getWorldPosition(new THREE.Vector3()).x).toBe(4);
    receiver.clear();
    expect(template.material.color.getHex()).toBe(0xffffff);
  });

  it('decodes relayed frames and ignores its own', () => {
    const editor = new HarnessCollaborationEditor('A');
    const roster = new MemberCollaborationRoster();
    roster.upsert(1, 'Me', true, 0);
    roster.upsert(2, 'Bea', false, 1);
    const sent: Uint8Array[] = [];
    const link = { sendPresence: (frame: Uint8Array) => sent.push(frame) > 0, limits: { presencePerSecond: 10 } };
    const session = new PresenceCollaborationSession(editor.host, link, roster);
    session.start(1);
    session.binary(presenceFrameRelay(presenceFrameEncode([entry(0, 1)]), 1));
    expect(editor.helpers.children).toHaveLength(0);
    session.binary(presenceFrameRelay(presenceFrameEncode([entry(0, 1)]), 2));
    expect(editor.helpers.children).toHaveLength(1);
    session.memberLeft(2);
    expect(editor.helpers.children).toHaveLength(0);
    session.stop();
  });

  it('sends nothing to a relay without presence support but still shows others', async () => {
    const editor = new HarnessCollaborationEditor('A');
    editor.cameras.push(new THREE.PerspectiveCamera());
    const roster = new MemberCollaborationRoster();
    roster.upsert(2, 'Bea', false, 1);
    const sent: Uint8Array[] = [];
    const link = { sendPresence: (frame: Uint8Array) => sent.push(frame) > 0, limits: { presencePerSecond: 0 } };
    const session = new PresenceCollaborationSession(editor.host, link, roster);
    session.start(1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(sent).toHaveLength(0);
    session.binary(presenceFrameRelay(presenceFrameEncode([entry(0, 1)]), 2));
    expect(editor.helpers.children).toHaveLength(1);
    session.stop();
  });
});

describe('presence visuals', () => {
  it('draws a frustum with an up marker that widens with the field of view', () => {
    const narrow = new Float32Array(66);
    const wide = new Float32Array(66);
    cameraCollaborationLinesFill(narrow, Math.tan(Math.PI / 12));
    cameraCollaborationLinesFill(wide, Math.tan(Math.PI / 4));
    expect(wide[4] ?? 0).toBeLessThan(narrow[4] ?? 0);
    expect(narrow[5]).toBe(-1);
    const gizmo = new CameraCollaborationPresence('Bea', 0xff0000);
    gizmo.target(entry(0, 0), 0);
    gizmo.dispose();
  });

  it('measures the visible world height for perspective and orthographic panes', () => {
    const perspective = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    perspective.updateMatrixWorld();
    expect(screenCollaborationWorldHeight(perspective, new THREE.Vector3(0, 0, -5))).toBeCloseTo(10);
    const ortho = new THREE.OrthographicCamera(-4, 4, 3, -3);
    ortho.zoom = 2;
    expect(screenCollaborationWorldHeight(ortho, new THREE.Vector3())).toBe(3);
  });

  it('picks readable name ink and tints every material copy', () => {
    expect(nametagCollaborationInk(0xffffff)).toBe('#111827');
    expect(nametagCollaborationInk(0x1f2937)).toBe('#ffffff');
    const shared = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const root = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), [shared, shared]));
    const created = characterCollaborationTint(root, 0x0000ff);
    expect(created).toHaveLength(2);
    expect(shared.color.getHex()).toBe(0xffffff);
  });
});
