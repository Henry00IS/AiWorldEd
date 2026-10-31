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
  readonly helpers: THREE.Group;
  saves: number;
  socket: WebSocketNode | null;

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
    this.socket = null;
    this.helpers = new THREE.Group();
    this.host = this.hostBuild();
    const options = {
      url: () => HARNESS_COLLABORATION_URL,
      name: () => name,
      factory: (url: string) => harnessCollaborationSocket(url, (socket) => (this.socket = socket)),
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

  /**
   * Adds an empty group to the world.
   *
   * @param name Group name.
   * @returns The group.
   */
  groupAdd(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    this.world.add(group);
    return group;
  }

  /**
   * Finds an object by name or fails.
   *
   * @param name Object name.
   * @returns Object.
   */
  object(name: string): THREE.Object3D {
    const object = this.find(name);
    if (object === undefined) throw new Error(`missing object ${name}`);
    return object;
  }

  /**
   * Returns whether the relay confirmed the local user's lock on an object.
   *
   * @param object Object.
   * @returns True when held by this client.
   */
  holds(object: THREE.Object3D): boolean {
    const locks = this.runtime.session?.sync.replica.locks;
    return locks !== undefined && locks.holder(object.uuid) === locks.selfGet();
  }

  /**
   * Returns the relay-confirmed holder of a named object.
   *
   * @param name Object name.
   * @returns Holder user id, or null when free.
   */
  holderOf(name: string): number | null {
    return this.runtime.session?.sync.replica.locks.holder(this.object(name).uuid) ?? null;
  }

  /**
   * Tries to select named objects without waiting for the relay.
   *
   * @param names Object names.
   * @returns True when the selection admitted them.
   */
  selectTry(...names: string[]): boolean {
    const objects = names.map((name) => this.object(name));
    const meshes = objects.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    const others = objects.filter((object) => !(object instanceof THREE.Mesh));
    return this.selection.setSelection(meshes, others) && this.selection.getSelectedObjectCount() === meshes.length;
  }

  /**
   * Selects named objects and waits until the relay granted their locks.
   *
   * @param names Object names.
   */
  async select(...names: string[]): Promise<void> {
    if (!this.selectTry(...names)) throw new Error(`selection refused: ${this.statuses.at(-1) ?? ''}`);
    const objects = names.map((name) => this.object(name));
    await harnessCollaborationUntil(() => objects.every((object) => this.holds(object)), 5000, `lock ${names}`);
  }

  /** Clears the selection and waits until the relay released every lock. */
  async deselect(): Promise<void> {
    this.selection.clearSelection();
    const locks = this.runtime.session?.sync.replica.locks;
    if (locks === undefined) return;
    await harnessCollaborationUntil(() => locks.idsOf(locks.selfGet()).length === 0, 5000, 'release');
  }

  /** Commits local changes immediately instead of waiting for the poll. */
  commit(): void {
    this.runtime.session?.sync.commit();
  }

  /**
   * Returns the agreed room states in scene order: equal on every member once
   * the room converged.
   *
   * @returns Agreed state fingerprint.
   */
  fingerprint(): string {
    const replica = this.runtime.session?.sync.replica;
    if (replica === undefined) return '';
    return replica
      .snapshotStates()
      .map((state) => codecStateText(state))
      .join('\n');
  }

  /** Cuts the connection abruptly, like a network failure. */
  drop(): void {
    this.socket?.terminate();
  }

  /**
   * Builds the editor services.
   *
   * @returns Host.
   */
  private hostBuild(): HostCollaborationEditor {
    const helpers = this.helpers;
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
 * @param opened Receives the underlying ws socket.
 * @returns Socket.
 */
export function harnessCollaborationSocket(
  url: string,
  opened: (socket: WebSocketNode) => void = () => undefined,
): SocketCollaborationLike {
  const socket = new WebSocketNode(url, { origin: HARNESS_COLLABORATION_ORIGIN });
  opened(socket);
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
  harnessCollaborationSocketBind(socket, like);
  return like;
}

/**
 * Forwards ws events to the browser-style socket handlers.
 *
 * @param socket Node socket.
 * @param like Browser-style wrapper.
 */
function harnessCollaborationSocketBind(socket: WebSocketNode, like: SocketCollaborationLike): void {
  socket.on('open', () => like.onopen?.({}));
  socket.on('message', (data, binary) =>
    like.onmessage?.({ data: binary ? harnessCollaborationBytes(data) : data.toString() }),
  );
  socket.on('close', (code, reason) => like.onclose?.({ code, reason: reason.toString() }));
  socket.on('error', (error) => like.onerror?.(error));
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
  const views = parts.map((part) => Uint8Array.from(part instanceof Buffer ? part : Buffer.from(part)));
  const bytes = new Uint8Array(views.reduce((total, view) => total + view.length, 0));
  views.reduce((offset, view) => {
    bytes.set(view, offset);
    return offset + view.length;
  }, 0);
  return bytes;
}
