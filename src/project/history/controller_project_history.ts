import type * as THREE from 'three';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SCENE_FILE_EXTENSION } from '@/io/scene_file/scene_file_extension.js';
import { projectAutosaveParse, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectPathJoin, projectPathName, projectPathParent, projectPathStem } from '@/project/fs/project_path.js';
import { projectTextureCacheRestore } from '@/project/textures/cache/project_texture_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import type { ProjectHistoryStore } from './store/project_history_store.js';
import {
  projectHistoryLevelKeyLabel,
  projectHistoryLevelLabel,
  projectHistoryRoomKey,
} from './store/project_history_keys.js';
import { projectHistoryLevelStore, projectHistoryStoresList } from './store/project_history_trees.js';
import type { ProjectHistoryNode } from './tree/project_history_tree.js';
import {
  projectHistoryTreeNote,
  projectHistoryTreeRemove,
  projectHistoryTreeRename,
  projectHistoryTreeRestore,
} from './tree/project_history_tree_edit.js';
import { PROJECT_HISTORY_HERE } from './tree/project_history_tree_layout.js';
import type { ProjectHistoryRoom } from './project_history_room.js';
import { DialogProjectHistory } from './ui/dialog_project_history.js';
import { dialogProjectHistoryNodeRef } from './ui/dialog_project_history_text.js';
import type {
  DialogProjectHistoryResult,
  DialogProjectHistorySource,
  DialogProjectHistoryTree,
} from './ui/dialog_project_history_types.js';

/** What the Level History needs from the level autosave. */
export interface ControllerProjectHistoryAutosave {
  /** Writes pending changes now. */
  flush(): Promise<void>;
  /** Tells whether changes wait for the next autosave. */
  pending(): boolean;
  /**
   * Keeps the open level as a named snapshot.
   *
   * @param name Snapshot name.
   */
  snapshot(name: string): Promise<ProjectHistoryNode | null>;
}

/** What the Level History needs from the editor. */
export interface ControllerProjectHistoryHost {
  container: HTMLElement;
  /** Open project folder. */
  fileSystem(): ProjectFileSystem | null;
  /** Project path of the open level, or null when untitled. */
  levelPath(): string | null;
  autosave: ControllerProjectHistoryAutosave;
  /**
   * Loads a saved level state into the editor.
   *
   * @param document Saved state.
   */
  restore(document: ProjectAutosaveDocument): Promise<boolean>;
  /**
   * Opens a level file of the project.
   *
   * @param path Project path.
   * @param size File size in bytes.
   */
  open(path: string, size: number): Promise<void>;
  /**
   * Writes a serialized level as a level file.
   *
   * @param data Serialized level.
   */
  levelFile(data: SceneJSON): Promise<Blob>;
  /**
   * Serializes a world.
   *
   * @param world World root.
   */
  serialize(world: THREE.Group): SceneJSON;
  /** Texture library that receives restored embedded textures. */
  textureLibrary(): TextureLibrary;
  /** The room this client owns, or null. */
  room(): ProjectHistoryRoom | null;
  /** Whether this client is in any room. */
  inRoom(): boolean;
  /**
   * Shows a status line.
   *
   * @param message Status.
   */
  status(message: string): void;
}

/**
 * The Level History: a tree of saved states per level and per room. Works with
 * or without a room; only room members, whose project is the owner's, cannot
 * use it.
 */
export class ControllerProjectHistory {
  private readonly host: ControllerProjectHistoryHost;
  private readonly stores = new Map<string, ProjectHistoryStore>();
  private readonly thumbnails = new Map<string, Promise<string | null>>();
  private dialog: DialogProjectHistory | null = null;

  /**
   * Creates the controller.
   *
   * @param host Editor services.
   */
  constructor(host: ControllerProjectHistoryHost) {
    this.host = host;
  }

  /**
   * Returns whether the Level History can open: with a writable project, or
   * while owning a room.
   *
   * @returns True when available.
   */
  available(): boolean {
    if (this.host.room() !== null) return true;
    return this.host.fileSystem()?.writable === true && !this.host.inRoom();
  }

  /** Opens the Level History. */
  async open(): Promise<void> {
    if (!this.available() || this.dialog !== null) return;
    this.dialog = new DialogProjectHistory(this.host.container, this.source());
    await this.dialog.open();
    this.dialog = null;
  }

  /**
   * Reads every tree: the open level's and the owned room's first, then the
   * most recently saved.
   *
   * @returns Trees.
   */
  async trees(): Promise<DialogProjectHistoryTree[]> {
    const found = await this.storesFind();
    this.stores.clear();
    const trees: DialogProjectHistoryTree[] = [];
    for (const [store, current] of found) {
      const id = `${store.kind}/${store.key}`;
      if (this.stores.has(id)) continue;
      this.stores.set(id, store);
      trees.push(await this.treeView(id, store, current));
    }
    const newest = (tree: DialogProjectHistoryTree) => Math.max(0, ...tree.index.nodes.map((node) => node.time));
    return trees.sort((left, right) => Number(right.current) - Number(left.current) || newest(right) - newest(left));
  }

  /**
   * Finds the stores to show, each with whether its work is live.
   *
   * @returns Stores, the live ones first.
   */
  private async storesFind(): Promise<Array<[ProjectHistoryStore, boolean]>> {
    const fileSystem = this.host.fileSystem();
    const room = this.host.room();
    const found: Array<[ProjectHistoryStore, boolean]> = [];
    if (room !== null) found.push([await room.store(), true]);
    if (fileSystem === null || (this.host.inRoom() && room === null)) return found;
    if (!this.host.inRoom()) found.push([await projectHistoryLevelStore(fileSystem, this.host.levelPath()), true]);
    for (const store of await projectHistoryStoresList(fileSystem)) found.push([store, false]);
    return found;
  }

  /**
   * Builds the dialog's view of a tree.
   *
   * @param id Tree id.
   * @param store Store.
   * @param current Whether its work is live.
   * @returns Tree view with a copy of the index.
   */
  private async treeView(id: string, store: ProjectHistoryStore, current: boolean): Promise<DialogProjectHistoryTree> {
    const index = structuredClone(await store.index());
    const fallback = store.kind === 'level' ? projectHistoryLevelKeyLabel(store.key) : store.key;
    const room = this.host.room();
    const pending = !current ? false : store.kind === 'room' ? room?.pending() === true : this.host.autosave.pending();
    return { id, kind: store.kind, label: index.label || fallback, index, current, pending };
  }

  /**
   * Builds what the dialog reads and does.
   *
   * @returns Dialog source.
   */
  private source(): DialogProjectHistorySource {
    return {
      projectName: () => this.host.fileSystem()?.name ?? '',
      now: () => Date.now(),
      trees: () => this.trees(),
      thumbnail: (tree, node) => this.thumbnail(tree, node),
      release: () => this.release(),
      restore: (tree, node) => this.guard(() => this.restore(tree, node)),
      take: (tree, name) => this.guard(() => this.take(tree, name)),
      rename: (tree, node, name) => this.guard(() => this.rename(tree, node, name)),
      note: (tree, node, note) => this.guard(() => this.note(tree, node, note)),
      remove: (tree, node) => this.guard(() => this.remove(tree, node)),
      copy: (tree, node) => this.guard(() => this.copy(tree, node)),
    };
  }

  /**
   * Runs an action and turns a failure into a status line.
   *
   * @param run Action.
   * @returns Outcome.
   */
  private async guard(run: () => Promise<DialogProjectHistoryResult>): Promise<DialogProjectHistoryResult> {
    try {
      return await run();
    } catch (error) {
      return { message: `Level History: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Returns the store of a tree the dialog shows.
   *
   * @param tree Tree.
   * @returns Store.
   * @throws {Error} When the tree is gone.
   */
  private store(tree: DialogProjectHistoryTree): ProjectHistoryStore {
    const store = this.stores.get(tree.id);
    if (store === undefined) throw new Error('This history is no longer available.');
    return store;
  }

  /**
   * Loads a node's thumbnail once per dialog.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Object URL, or null.
   */
  thumbnail(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<string | null> {
    const key = `${tree.id}/${node.id}@${node.time}`;
    let url = this.thumbnails.get(key);
    if (url === undefined) {
      const store = this.stores.get(tree.id);
      const read = store === undefined ? Promise.resolve(null) : store.thumbnailRead(node.id).catch(() => null);
      url = read.then((blob) => (blob === null ? null : URL.createObjectURL(blob)));
      this.thumbnails.set(key, url);
    }
    return url;
  }

  /** Frees the thumbnail URLs of the closed dialog. */
  private release(): void {
    for (const url of this.thumbnails.values()) void url.then((value) => value !== null && URL.revokeObjectURL(value));
    this.thumbnails.clear();
  }

  /**
   * Continues from a node straight away; unsaved work is saved into its session
   * first, so nothing is lost.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  async restore(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult> {
    const done = {
      message: `Restored ${dialogProjectHistoryNodeRef(node)}. The work you left stays at the end of its branch.`,
    };
    if (tree.kind === 'room') return this.roomRestore(tree, node, done);
    if (this.host.inRoom()) return { message: 'Leave the room to restore a level state.' };
    await this.host.autosave.flush();
    const document = await this.documentRead(tree, node);
    if (document === null) return { message: 'This saved state could not be read.' };
    if (!(await this.host.restore(document))) return { message: 'The saved state was not restored.' };
    await this.store(tree).change((index) => projectHistoryTreeRestore(index, node.id));
    return { ...done, select: PROJECT_HISTORY_HERE };
  }

  /**
   * Sets the owned room back to a node for everyone.
   *
   * @param tree Room tree.
   * @param node Node.
   * @param done Outcome on success.
   * @returns Outcome.
   */
  private async roomRestore(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
    done: DialogProjectHistoryResult,
  ): Promise<DialogProjectHistoryResult> {
    const room = this.host.room();
    if (room === null || !tree.current)
      return { message: 'A room state restores while you own that room. Open As Copy works any time.' };
    await room.restore(node.id);
    return { ...done, select: PROJECT_HISTORY_HERE };
  }

  /**
   * Reads a level node's saved state.
   *
   * @param tree Level tree.
   * @param node Node.
   * @returns Saved state, or null.
   */
  private async documentRead(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
  ): Promise<ProjectAutosaveDocument | null> {
    const blob = await this.store(tree).stateRead(node.id);
    return blob === null ? null : projectAutosaveParse(await blob.text());
  }

  /**
   * Keeps the live work of a tree as a named snapshot.
   *
   * @param tree Current tree.
   * @param name Snapshot name.
   * @returns Outcome.
   */
  async take(tree: DialogProjectHistoryTree, name: string): Promise<DialogProjectHistoryResult> {
    const room = this.host.room();
    const node = tree.kind === 'room' ? await room?.snapshot(name) : await this.host.autosave.snapshot(name);
    if (node === null || node === undefined) return { message: 'Nothing to keep yet.' };
    return {
      message: `Kept \u201c${node.name}\u201d. Named snapshots are kept until you delete them.`,
      select: node.id,
    };
  }

  /**
   * Names a node or clears its name.
   *
   * @param tree Tree.
   * @param node Node.
   * @param name New name; empty clears it.
   * @returns Outcome.
   */
  async rename(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
    name: string,
  ): Promise<DialogProjectHistoryResult> {
    const changed = await this.store(tree).change((index) => projectHistoryTreeRename(index, node.id, name));
    if (changed === null) return { message: 'This state is gone.' };
    if (changed.name === '')
      return { message: 'Cleared the name: it is an unnamed state again and may be cleaned up.' };
    return { message: `Named \u201c${changed.name}\u201d: kept until you delete it.` };
  }

  /**
   * Sets a node's note.
   *
   * @param tree Tree.
   * @param node Node.
   * @param note Note.
   * @returns Outcome.
   */
  async note(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
    note: string,
  ): Promise<DialogProjectHistoryResult> {
    await this.store(tree).change((index) => projectHistoryTreeNote(index, node.id, note));
    return { message: 'Saved the note.' };
  }

  /**
   * Deletes a node; the states that grew from it attach to its parent.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  async remove(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult> {
    const store = this.store(tree);
    await store.change((index) => projectHistoryTreeRemove(index, node.id));
    await store.filesRemove([node.id]).catch(() => undefined);
    const message = `Deleted ${dialogProjectHistoryNodeRef(node)}.`;
    const select = node.parent ?? (tree.current ? PROJECT_HISTORY_HERE : null);
    return select === null ? { message } : { message, select };
  }

  /**
   * Writes a node out as a new level file; a level copy opens when not in a
   * room.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  async copy(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult> {
    const fileSystem = this.host.fileSystem();
    if (fileSystem === null || !fileSystem.writable) return { message: 'Open a project folder to save a copy.' };
    const data =
      tree.kind === 'room' ? await this.roomData(node) : ((await this.documentRead(tree, node))?.data ?? null);
    if (data === null) return { message: 'This saved state could not be read.' };
    await projectTextureCacheRestore(fileSystem, this.host.textureLibrary(), data).catch(() => 0);
    const blob = await this.host.levelFile(data);
    const path = await projectHistoryCopyPath(fileSystem, tree);
    await fileSystem.fileWrite(path, blob);
    if (tree.kind === 'room' || this.host.inRoom()) return { message: `Saved a copy as ${path}.` };
    await this.host.open(path, blob.size);
    return { message: `Saved a copy as ${path} and opened it.` };
  }

  /**
   * Rebuilds a room node as a serialized level.
   *
   * @param node Node.
   * @returns Serialized level, or null when it cannot be read.
   */
  private async roomData(node: ProjectHistoryNode): Promise<SceneJSON | null> {
    const world = await this.host.room()?.world(node.id);
    if (world === null || world === undefined) return null;
    try {
      return this.host.serialize(world.world);
    } finally {
      world.dispose();
    }
  }
}

/**
 * Picks a free path for a copy: "<level> Copy.aiworld" beside the level, or
 * "<room> Copy.aiworld" (or "Untitled Level Copy.aiworld") in the project root,
 * numbered when taken.
 *
 * @param fileSystem Project folder.
 * @param tree Tree the copy comes from.
 * @returns Path.
 */
export async function projectHistoryCopyPath(
  fileSystem: ProjectFileSystem,
  tree: DialogProjectHistoryTree,
): Promise<string> {
  const level = tree.kind === 'level' && tree.label !== projectHistoryLevelLabel(null);
  const directory = level ? projectPathParent(tree.label) : '';
  const stem = level ? projectPathStem(projectPathName(tree.label)) : projectHistoryRoomKey(tree.label);
  const names = new Set(
    (await fileSystem.directoryList(directory, () => false).catch(() => [])).map((entry) => entry.name),
  );
  let name = `${stem} Copy.${SCENE_FILE_EXTENSION}`;
  for (let count = 2; names.has(name); count += 1) name = `${stem} Copy ${count}.${SCENE_FILE_EXTENSION}`;
  return projectPathJoin(directory, name);
}
