/** What a paint over script lines needs from the line list. */
export interface SolidScriptEditorLinePaintHost {
  /**
   * Returns the line under a pointer height, clamped to the script.
   *
   * @param clientY Pointer height in client pixels.
   * @returns Line index, or null when the script has no lines.
   */
  lineAt: (clientY: number) => number | null;
  /**
   * Paints the lines from the pressed line to the line under the pointer on top
   * of the selection the gesture started from.
   *
   * @param painted Painted line indexes in order.
   * @param base Selection when the gesture started.
   * @param subtractive True removes the painted lines, false adds them.
   * @param pointerLine Line under the pointer.
   */
  paint: (painted: number[], base: ReadonlySet<number>, subtractive: boolean, pointerLine: number) => void;
}

/**
 * Modifier-drag paint over script lines: pressing Shift or Ctrl/Cmd on a line
 * and dragging over other lines selects (Shift) or deselects (Ctrl/Cmd) every
 * line from the pressed one to the one under the pointer. Nothing is painted
 * until the pointer reaches another line, so a plain modifier click keeps its
 * own behaviour.
 */
export class SolidScriptEditorLinePaint {
  private pressedLine: number | null = null;
  private base: ReadonlySet<number> = new Set();
  private subtractive = false;
  private paintedTo: number | null = null;
  private readonly mouseMoveBound = (event: MouseEvent): void => this.mouseMove(event);
  private readonly mouseUpBound = (): void => this.end();

  /**
   * Creates an idle paint.
   *
   * @param host Line list callbacks.
   */
  constructor(private readonly host: SolidScriptEditorLinePaintHost) {}

  /**
   * Starts painting from a pressed line.
   *
   * @param pressedLine Line under the press.
   * @param base Selection before the press changed it.
   * @param subtractive True for a Ctrl/Cmd press, even with Shift held.
   */
  begin(pressedLine: number, base: ReadonlySet<number>, subtractive: boolean): void {
    this.end();
    this.pressedLine = pressedLine;
    this.base = new Set(base);
    this.subtractive = subtractive;
    document.addEventListener('mousemove', this.mouseMoveBound, true);
    document.addEventListener('mouseup', this.mouseUpBound, true);
  }

  /** Ends the gesture. */
  end(): void {
    this.pressedLine = null;
    this.paintedTo = null;
    document.removeEventListener('mousemove', this.mouseMoveBound, true);
    document.removeEventListener('mouseup', this.mouseUpBound, true);
  }

  /**
   * Follows the pointer and paints when it reaches a new line.
   *
   * @param event Mouse move event.
   */
  private mouseMove(event: MouseEvent): void {
    if ((event.buttons & 1) === 0) return this.end();
    const pressedLine = this.pressedLine;
    const pointerLine = this.host.lineAt(event.clientY);
    if (pressedLine === null || pointerLine === null || pointerLine === this.paintedTo) return;
    if (this.paintedTo === null && pointerLine === pressedLine) return;
    event.preventDefault();
    this.paintedTo = pointerLine;
    const first = Math.min(pressedLine, pointerLine);
    const painted = Array.from({ length: Math.abs(pointerLine - pressedLine) + 1 }, (_, index) => first + index);
    this.host.paint(painted, this.base, this.subtractive, pointerLine);
  }
}
