import * as THREE from 'three';
import WebSocketNode from 'ws';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { RuntimeCollaboration } from '@/collaboration/runtime/runtime_collaboration_client.js';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';

/** Relay used by the integration tests. */
export const HARNESS_COLLABORATION_URL = process.env['AIWORLDED_COLLAB_URL'] ?? 'ws://127.0.0.1:8081/ws';

/** Origin presented to the relay, as a local dev server would. */
export const HARNESS_COLLABORATION_ORIGIN = 'http://localhost:5179';

/** Notice shown to a test client. */
export interface HarnessCollaborationNotice {
  title: string;
  message: string;
  offline: boolean;
}

/**
 * One editor tab: a world, selection, history and the collaboration runtime
 * against the real relay.
 */
export class HarnessCollaborationEditor {
  readonly world: THREE.Group;
  readonly selection: ManagerSelection;
  readonly commandStack: CommandStack;
  readonly host: HostCollaborationEditor;
  readonly runtime: RuntimeCollaboration;
  readonly statuses: string[];
  readonly notices: HarnessCollaborationNotice[];
  saves: number;

  /**
   * Creates a client.
   *
   * @param name Display name.
   */
  constructor(name: string) {
    this.world = new THREE.Group();
    this.selection = new ManagerSelection();
    this.commandStack = new CommandStack(100);
    this.statuses = [];
    this.notices = [];
    this.saves = 0;
    this.host = this.hostBuild();
    const options = {
      url: () => HARNESS_COLLABORATION_URL,
      name: () => name,
      factory: harnessCollaborationSocket,
    };
    const listener = {
      stateChanged: () => undefined,
      rosterChanged: () => undefined,
      notice: (title: string, message: string, offline: boolean) => this.notices.push({ title, message, offline }),
    };
    this.runtime = new RuntimeCollaboration(this.host, options, listener);
  }

  /**
   * Adds a box mesh to the world, textured like the creation tool does.
   *
   * @param name Object name.
   * @param parent Parent, the world by default.
   * @returns The mesh.
   */
  boxAdd(name: string, parent: THREE.Object3D = this.world): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name;
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    parent.add(mesh);
    return mesh;
  }

  /**
   * Finds an object by name.
   *
   * @param name Object name.
   * @returns Object or undefined.
   */
  find(name: string): THREE.Object3D | undefined {
    return this.world.getObjectByName(name);
  }

  /**
   * Finds a mesh by name.
   *
   * @param name Mesh name.
   * @returns Mesh.
   */
  mesh(name: string): THREE.Mesh {
    const object = this.find(name);
    if (!(object instanceof THREE.Mesh)) throw new Error(`missing mesh ${name}`);
    return object;
  }

  /** Commits local changes immediately instead of waiting for the poll. */
  commit(): void {
    this.runtime.session?.sync.commit();
  }

  /**
   * Returns a canonical text of the synchronized scene.
   *
   * @returns Scene fingerprint.
   */
  fingerprint(): string {
    const replica = this.runtime.session?.sync.replica;
    if (replica === undefined) return '';
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    return nodes.refs
      .map((ref) => {
        const state = replica.codec.encode(ref, nodes.parents.get(ref.id) ?? '', replica.keyOf(ref.id) ?? '');
        return state === null ? '' : codecStateText(state);
      })
      .join('\n');
  }

  /**
   * Builds the editor services.
   *
   * @returns Host.
   */
  private hostBuild(): HostCollaborationEditor {
    const helpers = new THREE.Group();
    return {
      container: document.body,
      world: this.world,
      selection: this.selection,
      commandStack: this.commandStack,
      statusBarElement: () => null,
      outlinerHolderResolverSet: () => undefined,
      helperAdd: (object) => helpers.add(object),
      helperRemove: (object) => helpers.remove(object),
      status: (message) => this.statuses.push(message),
      refresh: () => undefined,
      sceneDiscard: () => this.discard(),
      sceneSaveLocal: () => (this.saves += 1),
      sceneHasWork: () => this.world.children.length > 0,
    };
  }

  /** Clears the scene like File, New without the startup cube. */
  private discard(): void {
    this.selection.clearSelection();
    this.world.clear();
    this.commandStack.clear();
  }
}

/**
 * Waits until a condition holds.
 *
 * @param condition Condition.
 * @param timeout Milliseconds before failing.
 * @param label Failure label.
 */
export async function harnessCollaborationUntil(
  condition: () => boolean,
  timeout = 5000,
  label = 'condition',
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Returns whether the relay accepts connections.
 *
 * @returns True when reachable.
 */
export function harnessCollaborationRelayUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocketNode(HARNESS_COLLABORATION_URL, { origin: HARNESS_COLLABORATION_ORIGIN });
    const timer = setTimeout(() => finish(false), 1500);
    const finish = (value: boolean): void => {
      clearTimeout(timer);
      socket.onopen = null;
      socket.onerror = null;
      socket.close();
      resolve(value);
    };
    socket.onopen = () => finish(true);
    socket.onerror = () => finish(false);
  });
}

/**
 * Opens a Node socket to the relay (jsdom and the Node WebSocket disagree on
 * event classes, so the tests use the ws package).
 *
 * @param url Relay URL.
 * @returns Socket.
 */
export function harnessCollaborationSocket(url: string): SocketCollaborationLike {
  const socket = new WebSocketNode(url, { origin: HARNESS_COLLABORATION_ORIGIN });
  const like: SocketCollaborationLike = {
    get binaryType() {
      return socket.binaryType;
    },
    set binaryType(value: string) {
      socket.binaryType = value === 'arraybuffer' ? 'arraybuffer' : 'nodebuffer';
    },
    get readyState() {
      return socket.readyState;
    },
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.on('open', () => like.onopen?.({}));
  socket.on('message', (data, binary) =>
    like.onmessage?.({ data: binary ? harnessCollaborationBytes(data) : data.toString() }),
  );
  socket.on('close', (code, reason) => like.onclose?.({ code, reason: reason.toString() }));
  socket.on('error', (error) => like.onerror?.(error));
  return like;
}

/**
 * Copies a ws binary payload into a Uint8Array of the test realm, since jsdom
 * and Node use distinct ArrayBuffer constructors.
 *
 * @param data Payload delivered by ws.
 * @returns Payload bytes.
 */
function harnessCollaborationBytes(data: WebSocketNode.RawData): Uint8Array {
  const parts = Array.isArray(data) ? data : [data];
  const views = parts.map((part) => (part instanceof Buffer ? part : Buffer.from(part)));
  return Uint8Array.from(Buffer.concat(views));
}
