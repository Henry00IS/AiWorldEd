/** What the active-lines filter needs to know about a line. */
export interface SolidScriptActiveSource {
  /** True for a line turned off. */
  readonly off?: boolean;
}

/** A line that is on, with its 0-based index in the whole script. */
export interface SolidScriptActiveLine<Line extends SolidScriptActiveSource> {
  /** The line. */
  readonly block: Line;
  /** 0-based index of the line in the whole script. */
  readonly line: number;
}

/**
 * Lists the lines that are on, the one filter every check that reads a script
 * without running it and the block tree of a run share, so a line turned off
 * gives no names, Types, Functions, Parts or warnings. Only lines turned off
 * themselves are left out: the lines inside an off block line stay, since they
 * run without it.
 *
 * @param lines Lines of the script.
 * @param from 0-based index of the first line to look at.
 * @param to 0-based index after the last line to look at.
 * @returns Lines that are on, with their index, in line order.
 */
export function solidScriptDocumentActiveLines<Line extends SolidScriptActiveSource>(
  lines: readonly Line[],
  from = 0,
  to = lines.length,
): SolidScriptActiveLine<Line>[] {
  return lines.slice(from, to).flatMap((block, offset) => (block.off === true ? [] : [{ block, line: from + offset }]));
}
