import type { UndoCommand } from '@/commands/command_undo.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { PaintStroke } from '@/paint/stroke/paint_stroke.js';

/** One stroke record placed on one brush. */
export interface PaintStrokePlacement {
  /** Owning model. */
  readonly model: SolidModel;
  /** Brush id. */
  readonly brushId: string;
  /** Record. */
  readonly stroke: PaintStroke;
}

/**
 * Adds the records of one painted stroke to the brushes it reached. Brushes are
 * looked up by id each time, so the command still applies after the brush was
 * removed and restored by other history steps.
 */
export class CommandPaintStrokes implements UndoCommand {
  /**
   * Creates the command.
   *
   * @param placements Records per brush.
   */
  constructor(readonly placements: readonly PaintStrokePlacement[]) {}

  /** Adds every record. */
  execute(): void {
    for (const placement of this.placements) {
      placement.model.findBrush(placement.brushId)?.paint.add(placement.stroke);
    }
  }

  /** Removes every record. */
  undo(): void {
    for (const placement of this.placements) {
      placement.model.findBrush(placement.brushId)?.paint.remove(placement.stroke.id);
    }
  }
}
