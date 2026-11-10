import type { Curve } from '@/curve/model/curve_model.js';
import type { CurveEditorHistory } from '@/curve/ui/curve_editor.js';

/**
 * Plays the app history of an edited curve: every commit is one step, and undo
 * and redo hand the neighbouring step back to the editor, as the edited field
 * does after the app stepped its history.
 */
export class CurveHistoryFake implements CurveEditorHistory {
  private readonly steps: Curve[];
  private at = 0;

  /**
   * Starts at the curve the editor opens with.
   *
   * @param initial Curve before any commit.
   * @param adopt Shows a stepped-to curve in the editor.
   */
  constructor(
    initial: Curve,
    private readonly adopt: (curve: Curve) => void,
  ) {
    this.steps = [initial];
  }

  /**
   * Records a commit as the newest step, dropping the redo steps.
   *
   * @param curve Committed curve.
   */
  commit(curve: Curve): void {
    this.steps.length = this.at + 1;
    this.steps.push(curve);
    this.at += 1;
  }

  /** Steps back. */
  readonly undo = (): void => this.step(-1);

  /** Steps forward again. */
  readonly redo = (): void => this.step(1);

  /**
   * Returns whether undo and redo are possible.
   *
   * @returns Undo and redo availability.
   */
  readonly state = (): { undo: boolean; redo: boolean } => ({
    undo: this.at > 0,
    redo: this.at < this.steps.length - 1,
  });

  /**
   * Moves to a neighbouring step and shows it.
   *
   * @param by -1 back, 1 forward.
   */
  private step(by: number): void {
    const curve = this.steps[this.at + by];
    if (!curve) return;
    this.at += by;
    this.adopt(curve);
  }
}
