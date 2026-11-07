import { curveClone, curveEquals, type Curve } from './curve_model.js';

/** Most undo steps a curve history keeps. */
export const CURVE_HISTORY_LIMIT = 100;

/** Local undo and redo of one curve editing session. */
export class CurveHistory {
  private readonly undoSteps: Curve[] = [];
  private readonly redoSteps: Curve[] = [];

  /**
   * Records the curve before a change; equal neighbours are not stored twice.
   *
   * @param before Curve before the change.
   */
  record(before: Curve): void {
    const last = this.undoSteps[this.undoSteps.length - 1];
    if (last && curveEquals(last, before)) return;
    this.undoSteps.push(curveClone(before));
    if (this.undoSteps.length > CURVE_HISTORY_LIMIT) this.undoSteps.shift();
    this.redoSteps.length = 0;
  }

  /**
   * Steps back.
   *
   * @param current Curve now.
   * @returns Earlier curve, or null when there is none.
   */
  undo(current: Curve): Curve | null {
    const previous = this.undoSteps.pop();
    if (!previous) return null;
    this.redoSteps.push(curveClone(current));
    return previous;
  }

  /**
   * Steps forward again.
   *
   * @param current Curve now.
   * @returns Later curve, or null when there is none.
   */
  redo(current: Curve): Curve | null {
    const next = this.redoSteps.pop();
    if (!next) return null;
    this.undoSteps.push(curveClone(current));
    return next;
  }

  /**
   * Returns whether undo has a step.
   *
   * @returns True when undo would change the curve.
   */
  canUndo(): boolean {
    return this.undoSteps.length > 0;
  }

  /**
   * Returns whether redo has a step.
   *
   * @returns True when redo would change the curve.
   */
  canRedo(): boolean {
    return this.redoSteps.length > 0;
  }
}
