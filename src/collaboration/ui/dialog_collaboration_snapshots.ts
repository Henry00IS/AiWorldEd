import type { SnapshotCollaborationMeta } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationText,
  uiCollaborationTextSet,
} from '@/collaboration/ui/ui_collaboration_elements.js';

/** Snapshots the restore dialog lists. */
export interface DialogCollaborationSnapshotsSource {
  /**
   * Lists snapshots, newest first.
   *
   * @returns Snapshot list.
   */
  list(): Promise<SnapshotCollaborationMeta[]>;
  /**
   * Takes a snapshot now.
   *
   * @returns Resolves once saved.
   */
  take(): Promise<unknown>;
}

const DIALOG_COLLABORATION_SNAPSHOTS_REASONS: Readonly<Record<SnapshotCollaborationMeta['reason'], string>> = {
  'room-start': 'room created',
  periodic: 'periodic',
  'large-change': 'before a large deletion',
  'before-restore': 'before a restore',
  manual: 'taken by hand',
};

/**
 * Describes a snapshot for the list.
 *
 * @param meta Snapshot.
 * @param now Current time in milliseconds.
 * @returns Label like "14:22:33 (5 min ago) · 3000 objects · periodic".
 */
export function dialogCollaborationSnapshotsLabel(meta: SnapshotCollaborationMeta, now: number): string {
  const date = new Date(meta.savedAt);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  const time = sameDay ? date.toLocaleTimeString() : date.toLocaleString();
  const minutes = Math.max(0, Math.round((now - meta.savedAt) / 60_000));
  const ago = minutes < 1 ? 'just now' : minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  const place = meta.stored === 'project' ? ' \u00b7 in project folder' : '';
  return `${time} (${ago}) \u00b7 ${meta.count} object(s) \u00b7 ${DIALOG_COLLABORATION_SNAPSHOTS_REASONS[meta.reason]}${place}`;
}

/** Lists the owner's room snapshots and returns the one to restore. */
export class DialogCollaborationSnapshots extends DialogCollaborationBase<SnapshotCollaborationMeta> {
  private readonly source: DialogCollaborationSnapshotsSource;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;

  /**
   * Builds the dialog and loads the list.
   *
   * @param host Modal host.
   * @param source Snapshots.
   */
  constructor(host: HTMLElement, source: DialogCollaborationSnapshotsSource) {
    super(host, 'Restore scene from snapshot', 640);
    this.source = source;
    this.list = dialogCollaborationSnapshotsList();
    this.status = uiCollaborationText('Loading snapshots...', 'muted');
    this.body.append(
      uiCollaborationText(
        'Restoring sets the room back to a snapshot for everyone as one step you can undo. ' +
          'Objects other members are editing stay as they are.',
        'muted',
      ),
      this.list,
      this.status,
      uiCollaborationButtons(
        uiCollaborationButton('Take snapshot now', false, () => void this.takeNow()),
        uiCollaborationButton('Close', false, () => this.finish(null)),
      ),
    );
    void this.refresh();
  }

  /** Reloads and shows the list. */
  async refresh(): Promise<void> {
    const snapshots = await this.source.list().catch(() => []);
    this.list.replaceChildren(...snapshots.map((meta) => this.row(meta)));
    const text = snapshots.length === 0 ? 'No snapshots yet.' : `${snapshots.length} snapshot(s)`;
    uiCollaborationTextSet(this.status, text, 'muted');
  }

  /** Takes a snapshot and shows it. */
  private async takeNow(): Promise<void> {
    uiCollaborationTextSet(this.status, 'Taking snapshot...', 'muted');
    await this.source.take();
    await this.refresh();
  }

  /**
   * Creates one snapshot row.
   *
   * @param meta Snapshot.
   * @returns Row element.
   */
  private row(meta: SnapshotCollaborationMeta): HTMLElement {
    const row = document.createElement('div');
    row.dataset['collaborationSnapshot'] = meta.id;
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.padding = '6px 8px';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    const label = document.createElement('span');
    label.style.flex = '1';
    label.textContent = dialogCollaborationSnapshotsLabel(meta, Date.now());
    row.append(
      label,
      uiCollaborationButton('Restore', false, () => this.finish(meta)),
    );
    return row;
  }
}

/**
 * Creates the scrolling snapshot list.
 *
 * @returns List element.
 */
function dialogCollaborationSnapshotsList(): HTMLElement {
  const list = document.createElement('div');
  list.dataset['collaborationSnapshotList'] = 'true';
  list.style.maxHeight = 'max(240px, calc(100vh - 320px))';
  list.style.minHeight = '120px';
  list.style.overflowY = 'auto';
  list.style.border = '1px solid rgba(255,255,255,0.08)';
  list.style.borderRadius = '6px';
  list.style.background = 'rgba(0,0,0,0.25)';
  list.style.margin = '8px 0';
  return list;
}
