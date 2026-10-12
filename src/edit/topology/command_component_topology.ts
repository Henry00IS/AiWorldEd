import type { UndoCommand } from '@/commands/command_undo.js';
import type { TopologySnapshot } from './topology_snapshot.js';
import { restoreTopologySnapshot } from './topology_snapshot_restore.js';

/** Undoable topology edit. Stores before/after snapshots captured at commit. */
export class CommandComponentTopology implements UndoCommand {
  private readonly beforeSnapshots: TopologySnapshot[];
  private readonly afterSnapshots: TopologySnapshot[];
  private readonly afterDisplaysRebuilt: (() => void) | null;

  /**
   * Creates a topology command from already-applied after snapshots.
   *
   * @param beforeSnapshots State before the operator.
   * @param afterSnapshots State after the operator.
   * @param afterDisplaysRebuilt Optional cage/presentation refresh.
   */
  constructor(
    beforeSnapshots: readonly TopologySnapshot[],
    afterSnapshots: readonly TopologySnapshot[],
    afterDisplaysRebuilt: (() => void) | null = null,
  ) {
    this.beforeSnapshots = beforeSnapshots.slice();
    this.afterSnapshots = afterSnapshots.slice();
    this.afterDisplaysRebuilt = afterDisplaysRebuilt;
  }

  /** Re-applies the post-edit topology. */
  execute(): void {
    this.restoreAll(this.afterSnapshots);
  }

  /** Restores the pre-edit topology. */
  undo(): void {
    this.restoreAll(this.beforeSnapshots);
  }

  /**
   * Writes a snapshot list onto the live targets and refreshes presentation.
   *
   * @param snapshots Snapshots to restore.
   */
  private restoreAll(snapshots: readonly TopologySnapshot[]): void {
    for (const snapshot of snapshots) {
      restoreTopologySnapshot(snapshot);
    }
    this.afterDisplaysRebuilt?.();
  }
}
