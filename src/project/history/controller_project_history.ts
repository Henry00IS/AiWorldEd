import type { SnapshotCollaborationMeta } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import {
  projectAutosaveParse,
  type ProjectAutosaveCopyKind,
  type ProjectAutosaveDocument,
} from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { textCount } from '@/utils/utils_plural.js';
import { timeRelativeText } from '@/utils/utils_time_relative.js';
import { DialogProjectHistory } from './dialog_project_history.js';
import { ProjectHistoryDetailsReader, type ProjectHistoryDetails } from './project_history_details.js';
import {
  projectHistoryKindLabel,
  projectHistoryLevelLabel,
  type ProjectHistoryEntry,
} from './project_history_entry.js';
import { projectHistoryList } from './project_history_list.js';
import { projectHistoryLock } from './project_history_lock.js';

/** The room the owner runs, as the Level History sees it. */
export interface ProjectHistoryRoom {
  /**
   * Lists the room snapshots, including those kept only in memory.
   *
   * @returns Snapshot list.
   */
  list(): Promise<SnapshotCollaborationMeta[]>;
  /**
   * Takes a locked room snapshot now.
   *
   * @returns Resolves once saved.
   */
  take(): Promise<unknown>;
  /**
   * Asks, then sets the room back to a snapshot for everyone.
   *
   * @param id Snapshot id.
   * @param label What the confirmation calls the snapshot.
   * @returns Resolves once done or declined.
   */
  restore(id: string, label: string): Promise<void>;
}

/** What the Level History needs from the editor. */
export interface ControllerProjectHistoryHost {
  container: HTMLElement;
  /** Open project folder. */
  fileSystem(): ProjectFileSystem | null;
  /** Level key of the open level. */
  level(): string | null;
  /** Writes the open level as a rotated copy now. */
  keep(kind: Exclude<ProjectAutosaveCopyKind, 'autosave'>, locked: boolean): Promise<string | null>;
  /** Replaces the open level with an autosave. */
  restore(document: ProjectAutosaveDocument): Promise<void>;
  /** The room this client owns, or null. */
  room(): ProjectHistoryRoom | null;
  /** Whether this client is in any room. */
  inRoom(): boolean;
  confirm(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean>;
  status(message: string): void;
}

/**
 * The Level History: lists every autosave, snapshot and room snapshot of the
 * open project, locks the ones to keep and restores one. Works with or without
 * a room; only room members, whose project is the owner's, cannot use it.
 */
export class ControllerProjectHistory {
  private readonly host: ControllerProjectHistoryHost;
  private readonly detailsReader = new ProjectHistoryDetailsReader();
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

  /** Opens the Level History; restores the entry picked there. */
  async open(): Promise<void> {
    if (!this.available() || this.dialog !== null) return;
    this.dialog = new DialogProjectHistory(this.host.container, this.dialogSource());
    const choice = await this.dialog.open();
    this.dialog = null;
    if (choice !== null) await this.restore(choice);
  }

  /**
   * Lists the entries of the project folder and of the owned room, newest
   * first.
   *
   * @returns History entries.
   */
  async entries(): Promise<ProjectHistoryEntry[]> {
    const fileSystem = this.host.fileSystem();
    const files = fileSystem === null ? [] : await projectHistoryList(fileSystem);
    const room = this.host.room();
    const memory = room === null ? [] : projectHistoryMemoryEntries(await room.list().catch(() => []), files);
    return [...files, ...memory].sort((left, right) => right.time - left.time);
  }

  /**
   * Returns why an entry cannot be restored right now.
   *
   * @param entry History entry.
   * @returns Reason, or null when it can.
   */
  restoreBlocked(entry: ProjectHistoryEntry): string | null {
    if (entry.kind === 'room') return this.host.room() === null ? 'Room snapshots restore while you own a room.' : null;
    if (this.host.inRoom()) return 'Leave the room to restore a level autosave.';
    return this.host.fileSystem() === null ? 'Open the project folder to restore.' : null;
  }

  /**
   * Builds what the dialog reads and does.
   *
   * @returns Dialog source.
   */
  private dialogSource(): ConstructorParameters<typeof DialogProjectHistory>[1] {
    return {
      projectName: () => this.host.fileSystem()?.name ?? '',
      current: () => this.host.level(),
      entries: () => this.entries(),
      details: (entry) => this.details(entry),
      lock: (entry, locked) => this.lock(entry, locked),
      restoreBlocked: (entry) => this.restoreBlocked(entry),
      take: () => this.take(),
      takeLabel: () => (this.host.room() === null ? 'Take Snapshot' : 'Take Room Snapshot'),
    };
  }

  /**
   * Reads an entry's object count, level and room from its file.
   *
   * @param entry History entry.
   * @returns Details.
   */
  private async details(entry: ProjectHistoryEntry): Promise<ProjectHistoryDetails> {
    const fileSystem = this.host.fileSystem();
    if (fileSystem === null || entry.path === null)
      return { objectCount: entry.objectCount, sourcePath: null, room: null };
    return this.detailsReader.read(fileSystem, entry);
  }

  /**
   * Locks or unlocks an entry, found again on disk so a rename that happened
   * since the list was shown does not get in the way.
   *
   * @param entry History entry.
   * @param locked Wanted lock state.
   */
  private async lock(entry: ProjectHistoryEntry, locked: boolean): Promise<void> {
    const fileSystem = this.host.fileSystem();
    if (fileSystem === null || !fileSystem.writable) return;
    const current = (await projectHistoryList(fileSystem)).find((listed) => projectHistorySameEntry(listed, entry));
    if (current === undefined) return this.host.status('That entry no longer exists');
    await projectHistoryLock(fileSystem, current, locked);
    this.host.status(locked ? 'Locked: no cleanup will delete it' : 'Unlocked: cleaned up like other autosaves');
  }

  /** Takes a locked snapshot of the room, or of the open level outside a room. */
  private async take(): Promise<void> {
    const room = this.host.room();
    if (room !== null) await room.take();
    else if ((await this.host.keep('snapshot', true)) === null)
      return this.host.status('Open a writable project folder to take snapshots');
    this.host.status('Snapshot taken and locked');
  }

  /**
   * Restores an entry after a confirmation that says what happens.
   *
   * @param entry History entry.
   */
  private async restore(entry: ProjectHistoryEntry): Promise<void> {
    const blocked = this.restoreBlocked(entry);
    if (blocked !== null) return this.host.status(blocked);
    const label = projectHistoryEntryLabel(entry, Date.now());
    const room = this.host.room();
    if (entry.kind === 'room')
      return room === null || entry.snapshotId === null ? undefined : room.restore(entry.snapshotId, label);
    const document = await this.documentRead(entry);
    if (document === null) return this.host.status('Could not read that autosave');
    const message = projectHistoryRestoreMessage(label, document);
    if (!(await this.host.confirm('Restore Level', message, 'Restore', 'Cancel'))) return;
    await this.host.keep('restore', false);
    await this.host.restore(document);
  }

  /**
   * Reads an autosave entry's document.
   *
   * @param entry History entry.
   * @returns Document, or null when unreadable.
   */
  private async documentRead(entry: ProjectHistoryEntry): Promise<ProjectAutosaveDocument | null> {
    const fileSystem = this.host.fileSystem();
    if (fileSystem === null || entry.path === null) return null;
    const file = await fileSystem.fileRead(entry.path).catch(() => null);
    return file === null ? null : projectAutosaveParse(await file.text());
  }
}

/**
 * Describes an entry for a confirmation ("the Snapshot of maps/start from
 * 11/11/2026, 02:14:00 (5 min ago)").
 *
 * @param entry History entry.
 * @param now Current time in milliseconds.
 * @returns Description.
 */
export function projectHistoryEntryLabel(entry: ProjectHistoryEntry, now: number): string {
  const when = `${new Date(entry.time).toLocaleString()} (${timeRelativeText(entry.time, now)})`;
  const what =
    entry.kind === 'room'
      ? `the ${projectHistoryKindLabel(entry)}`
      : `the ${projectHistoryKindLabel(entry)} of ${projectHistoryLevelLabel(entry.level)}`;
  return `${what} from ${when}`;
}

/**
 * Returns whether two entries are the same autosave or snapshot, whatever its
 * lock state.
 *
 * @param left First entry.
 * @param right Second entry.
 * @returns True for the same entry.
 */
function projectHistorySameEntry(left: ProjectHistoryEntry, right: ProjectHistoryEntry): boolean {
  if (left.kind !== right.kind || left.level !== right.level || left.time !== right.time) return false;
  return left.snapshotId === right.snapshotId;
}

/**
 * Words the confirmation of an autosave restore.
 *
 * @param label Entry description.
 * @param document Autosave document.
 * @returns Message.
 */
function projectHistoryRestoreMessage(label: string, document: ProjectAutosaveDocument): string {
  return (
    `Replace the open level with ${label}, ${textCount(document.objectCount, 'object')}?\n\n` +
    'The level as it is now is kept in Level History as "Before Restore" first, so you can go back to it.'
  );
}

/**
 * Turns room snapshots kept only in memory into entries.
 *
 * @param metas Room snapshot list.
 * @param files Entries already listed from files.
 * @returns Memory-only entries.
 */
function projectHistoryMemoryEntries(
  metas: readonly SnapshotCollaborationMeta[],
  files: readonly ProjectHistoryEntry[],
): ProjectHistoryEntry[] {
  const onDisk = new Set(files.map((entry) => entry.snapshotId));
  return metas
    .filter((meta) => meta.stored === 'memory' && !onDisk.has(meta.id))
    .map((meta) => ({
      id: `memory:${meta.id}`,
      path: null,
      kind: 'room',
      level: null,
      time: meta.savedAt,
      locked: false,
      size: null,
      objectCount: meta.count,
      reason: meta.reason,
      snapshotId: meta.id,
    }));
}
