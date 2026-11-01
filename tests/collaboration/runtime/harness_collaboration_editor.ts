import * as THREE from 'three';
import WebSocketNode from 'ws';
import { EditorApi } from '@/ai/client/editor_api.js';
import { HandlerMcpBridge } from '@/ai/client/handler_mcp_bridge.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type {
  HostCollaborationEditor,
  HostCollaborationPlayer,
} from '@/collaboration/host/host_collaboration_editor.js';
import type {
  SocketCollaborationLike,
  SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import { CONFIG_COLLABORATION_URL_DEVELOPMENT } from '@/collaboration/config/config_collaboration_server.js';
import { RuntimeCollaboration } from '@/collaboration/runtime/runtime_collaboration_client.js';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import { CommandStack } from '@/commands/command_stack.js';
import type { OutlinerEditGate, OutlinerMoveGate } from '@/outliner/ui/panel_outliner.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import {
  captureSharedContentMaterials,
  markShadingOverrideMaterial,
} from '@/viewports/shared/shared_content_material_store.js';

/**
 * Relay used by the integration tests: the dev relay unless
 * `AIWORLDED_COLLAB_URL` overrides it (e.g. `ws://127.0.0.1:8081/ws` for a
 * relay on this machine).
 */
export const HARNESS_COLLABORATION_URL = process.env['AIWORLDED_COLLAB_URL'] || CONFIG_COLLABORATION_URL_DEVELOPMENT;

/**
 * Whether the relay integration tests may connect at all. `bun run test:collab`
 * (`AIWORLDED_COLLAB_REQUIRED=1`) or an explicit `AIWORLDED_COLLAB_URL` enables
 * them; a plain `bun run testrun` (and CI) skips them instead of reaching the
 * public dev relay.
 */
export const HARNESS_COLLABORATION_RELAY_ENABLED =
  process.env['AIWORLDED_COLLAB_REQUIRED'] === '1' || Boolean(process.env['AIWORLDED_COLLAB_URL']);

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
  /** Chat messages of other members, as the runtime handed them to the UI. */
  readonly chats: SocketCollaborationMessage[];
  readonly helpers: THREE.Group;
  readonly cameras: THREE.PerspectiveCamera[];
  player: HostCollaborationPlayer | null;
  saves: number;
  socket: WebSocketNode | null;
  outlinerEditGate: OutlinerEditGate | null;
  outlinerMoveGate: OutlinerMoveGate | null;
  readonly tools: HandlerMcpBridge;
  /** Texture library of this tab. */
  readonly textures: TextureLibrary;
  /** Solid model controller, created on first use. */
  private solidController: SolidModelController | null = null;

  /** Whether the editor API is bound to the tool bridge. */
  private toolsBound: boolean;

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
    this.chats = [];
    this.saves = 0;
    this.socket = null;
    this.outlinerEditGate = null;
    this.outlinerMoveGate = null;
    this.tools = new HandlerMcpBridge();
    this.textures = new TextureLibrary();
    this.toolsBound = false;
    this.helpers = new THREE.Group();
    this.cameras = [];
    this.player = null;
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
      chat: (message: SocketCollaborationMessage) => this.chats.push(message),
    };
    this.runtime = new RuntimeCollaboration(this.host, options, listener);
    harnessCollaborationConnectRetry(this.runtime);
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
   * Swaps the materials of every world mesh for fresh black override materials,
   * as a wireframe shading pass of the viewport does every time it applies.
   */
  shadingOverride(): void {
    this.world.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      captureSharedContentMaterials(object);
      const override = new THREE.MeshBasicMaterial({ color: 0x000000 });
      markShadingOverrideMaterial(override);
      object.material = override;
    });
  }

  /**
   * Adds a solid model with an additive and a subtractive box brush.
   *
   * @param name Model name.
   * @returns The model.
   */
  solidAdd(name: string): SolidModel {
    const model = new SolidModel(name);
    model.root.name = name;
    model.addBoxBrush(2, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    this.world.add(model.root);
    return model;
  }

  /**
   * Finds a solid model by its root name.
   *
   * @param name Model name.
   * @returns Model.
   */
  solid(name: string): SolidModel {
    const model = SolidModel.fromObject(this.object(name));
    if (model === null) throw new Error(`missing solid model ${name}`);
    return model;
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
    const sync = this.runtime.session?.sync;
    return sync !== undefined && sync.leaseHolds(this.nodeIdOf(object));
  }

  /**
   * Returns the room node id of an object: brushes use their brush id.
   *
   * @param object Object.
   * @returns Node id.
   */
  nodeIdOf(object: THREE.Object3D): string {
    const replica = this.runtime.session?.sync.replica;
    if (replica === undefined) return object.uuid;
    replica.applier.invalidate();
    return replica.applier.nodes().forObjectOrAncestor(object)?.id ?? object.uuid;
  }

  /**
   * Returns the relay-confirmed holder of a named object.
   *
   * @param name Object name.
   * @returns Holder user id, or null when free.
   */
  holderOf(name: string): number | null {
    return this.runtime.session?.sync.replica.locks.holder(this.nodeIdOf(this.object(name))) ?? null;
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
   * Selects named objects and starts an operation on them: selection never
   * locks (protocol v2), so this also takes the operation lease a drag or tool
   * would take, and waits until the relay granted it.
   *
   * @param names Object names.
   */
  async select(...names: string[]): Promise<void> {
    if (!this.selectTry(...names)) throw new Error(`selection refused: ${this.statuses.at(-1) ?? ''}`);
    await this.editStart(...names);
  }

  /**
   * Starts an operation (takes the edit lease) on named objects and waits for
   * the grant.
   *
   * @param names Object names.
   */
  async editStart(...names: string[]): Promise<void> {
    if (!(await this.editTry(...names))) throw new Error(`edit refused: ${this.statuses.at(-1) ?? ''}`);
  }

  /**
   * Asks for the edit lease on named objects.
   *
   * @param names Object names.
   * @returns True once granted, false when refused.
   */
  async editTry(...names: string[]): Promise<boolean> {
    const sync = this.runtime.session?.sync;
    if (sync === undefined) throw new Error('not in a room');
    const objects = names.map((name) => this.object(name));
    const outcome = await sync.operationHold(objects.map((object) => this.nodeIdOf(object)));
    if (!outcome.ok) return false;
    await harnessCollaborationUntil(() => objects.every((object) => this.holds(object)), 5000, `lease ${names}`);
    return true;
  }

  /** Ends the running operation, clears the selection and waits for the release. */
  async deselect(): Promise<void> {
    this.selection.clearSelection();
    await this.editEnd();
  }

  /** Ends the running operation (commit, release) and waits for the release. */
  async editEnd(): Promise<void> {
    const sync = this.runtime.session?.sync;
    if (sync === undefined) return;
    sync.operationRelease();
    await harnessCollaborationUntil(() => !sync.leaseRunning(), 5000, 'release');
  }

  /**
   * Runs an edit of one object the way an outliner row action does.
   *
   * @param name Object name.
   * @param apply Edit to apply.
   * @returns Resolves true when the edit applied, false when it was refused.
   */
  outlinerEdit(name: string, apply: () => void): Promise<boolean> {
    const gate = this.outlinerEditGate;
    if (gate === null) throw new Error('no outliner edit gate installed');
    return new Promise((resolve) => {
      const applied = (): void => {
        apply();
        resolve(true);
      };
      gate(
        this.object(name),
        () => this.selectTry(name),
        applied,
        () => resolve(false),
      );
    });
  }

  /**
   * Moves named objects into a container the way an outliner drop does.
   *
   * @param names Moved object names.
   * @param container Name of the new parent, or empty for the world.
   * @param apply Applies the move once admitted.
   * @returns Resolves true when the move applied, false when it was refused.
   */
  outlinerMove(names: readonly string[], container: string, apply: () => void): Promise<boolean> {
    const gate = this.outlinerMoveGate;
    if (gate === null) throw new Error('no outliner move gate installed');
    const target = container === '' ? this.world : this.object(container);
    return new Promise((resolve) => {
      gate(
        names.map((name) => this.object(name)),
        target,
        () => this.selectTry(...names),
        () => {
          apply();
          resolve(true);
        },
        () => resolve(false),
      );
    });
  }

  /**
   * Runs an AI (MCP) tool through the bridge, like the desktop MCP host does.
   *
   * @param name Tool name.
   * @param args Tool arguments.
   * @returns Tool result.
   */
  tool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!this.toolsBound) this.toolsBind();
    return this.tools.invokeEditorTool({ name, arguments: args });
  }

  /**
   * Returns this client's solid model controller, as the import actions use it.
   *
   * @returns Controller.
   */
  solids(): SolidModelController {
    if (this.solidController === null) {
      const panel = new SolidModelPanel(document.createElement('div'), { onAddBoxBrush: () => undefined });
      this.solidController = new SolidModelController(this.world, this.commandStack, this.selection, panel);
    }
    return this.solidController;
  }

  /** Binds an editor API over this client's world, history and selection. */
  private toolsBind(): void {
    const solidModelController = this.solids();
    this.tools.bindEditorApi(
      new EditorApi({
        worldObject: this.world,
        commandStack: this.commandStack,
        selectionManager: this.selection,
        solidModelController,
        gridSnap: new GridSnap(false, 0.25),
        snapManager: new ManagerSnap(0.25),
        getUserSnapEnabled: () => false,
        refreshAfterWorldMutation: () => undefined,
        refreshOutliner: () => undefined,
        showStatus: (message) => this.statuses.push(message),
      }),
    );
    this.toolsBound = true;
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

  /**
   * Encodes the live scene (not the agreed baselines) node by node, sorted by
   * id: equal on every member once the room converged, and equal to
   * {@link agreedChecksumText} once nothing is pending locally.
   *
   * @returns Live scene text.
   */
  sceneChecksumText(): string {
    const replica = this.runtime.session?.sync.replica;
    if (replica === undefined) return '';
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    const texts = nodes.refs.map((ref) => {
      const state = replica.codec.encode(ref, nodes.parents.get(ref.id) ?? '', replica.keyOf(ref.id) ?? '');
      return state === null ? `${ref.id}:unencodable` : codecStateText(state);
    });
    return texts.sort().join('\n');
  }

  /**
   * Returns the agreed room states sorted by id.
   *
   * @returns Agreed state text.
   */
  agreedChecksumText(): string {
    return this.fingerprint().split('\n').sort().join('\n');
  }

  /**
   * Returns a short convergence checksum of the live scene.
   *
   * @returns FNV-1a hash of {@link sceneChecksumText} as hex.
   */
  checksum(): string {
    return harnessCollaborationHash(this.sceneChecksumText());
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
      operationCancel: () => false,
      outlinerHolderResolverSet: () => undefined,
      outlinerEditGateSet: (gate) => {
        this.outlinerEditGate = gate;
      },
      outlinerMoveGateSet: (gate) => {
        this.outlinerMoveGate = gate;
      },
      toolGuardSet: (guard) => this.tools.guardSet(guard),
      helperAdd: (object) => helpers.add(object),
      helperRemove: (object) => helpers.remove(object),
      presenceCameras: () => this.cameras,
      presencePlayer: () => this.player,
      status: (message) => this.statuses.push(message),
      statusRetract: (message) => {
        if (this.statuses.at(-1) === message) this.statuses.push('');
      },
      refresh: () => undefined,
      sceneDiscard: () => this.discard(),
      sceneSaveLocal: () => (this.saves += 1),
      sceneHasWork: () => this.world.children.length > 0,
      textureLibrary: () => this.textures,
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
 * Hashes text with 32-bit FNV-1a.
 *
 * @param text Text.
 * @returns Hash as 8 hex digits.
 */
export function harnessCollaborationHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Retries the relay handshake of a runtime: the public relay sits behind a TLS
 * proxy whose handshake occasionally stalls for several seconds.
 *
 * @param runtime Runtime whose connect is wrapped.
 */
function harnessCollaborationConnectRetry(runtime: RuntimeCollaboration): void {
  const connectOnce = runtime.connect.bind(runtime);
  runtime.connect = async (): Promise<void> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await connectOnce();
      } catch (error) {
        if (attempt >= 3 || !(error instanceof Error) || error.message !== 'timeout') throw error;
      }
    }
  };
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
 * Returns whether the relay accepts connections (false without trying when the
 * relay tests are not enabled, see
 * {@link HARNESS_COLLABORATION_RELAY_ENABLED}).
 *
 * @returns True when reachable.
 */
export function harnessCollaborationRelayUp(): Promise<boolean> {
  if (!HARNESS_COLLABORATION_RELAY_ENABLED) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = new WebSocketNode(HARNESS_COLLABORATION_URL, { origin: HARNESS_COLLABORATION_ORIGIN });
    const timer = setTimeout(() => finish(false), 5000);
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
  const like = harnessCollaborationSocketLike(socket);
  harnessCollaborationSocketBind(socket, like);
  return like;
}

/**
 * Wraps a Node socket in the browser-style socket surface.
 *
 * @param socket Node socket.
 * @returns Browser-style wrapper without event bindings.
 */
function harnessCollaborationSocketLike(socket: WebSocketNode): SocketCollaborationLike {
  return {
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
