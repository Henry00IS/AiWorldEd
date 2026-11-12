import type { UndoCommand } from '@/commands/command_undo.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { PaintStrokePlacement } from './command_paint_strokes.js';

/** A brush whose paint is cleared. */
export interface PaintClearTarget {
  /** Owning model. */
  readonly model: SolidModel;
  /** Brush id. */
  readonly brushId: string;
}

/** Removes all paint from a set of brushes; undo puts every record back. */
export class CommandPaintClear implements UndoCommand {
  private readonly removed: PaintStrokePlacement[] = [];

  /**
   * Creates the command.
   *
   * @param targets Brushes to clear.
   */
  constructor(private readonly targets: readonly PaintClearTarget[]) {}

  /**
   * Returns whether any brush has paint to clear.
   *
   * @returns True when executing would change something.
   */
  hasPaint(): boolean {
    return this.targets.some((target) => target.model.findBrush(target.brushId)?.paint.isEmpty() === false);
  }

  /** Removes every record and remembers them. */
  execute(): void {
    this.removed.length = 0;
    for (const target of this.targets) {
      const paint = target.model.findBrush(target.brushId)?.paint;
      if (paint === undefined) continue;
      for (const stroke of paint.ordered()) this.removed.push({ ...target, stroke });
      paint.clear();
    }
  }

  /** Restores every removed record. */
  undo(): void {
    for (const placement of this.removed) {
      placement.model.findBrush(placement.brushId)?.paint.add(placement.stroke);
    }
  }
}
