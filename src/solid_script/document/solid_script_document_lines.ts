import type { SolidScriptDocument } from './solid_script_document.js';

/** Lines one change of a script touched: set (new, changed or moved) and gone. */
export interface SolidScriptLinesChange {
  /** Ids of lines the change set. */
  set: string[];
  /** Ids of lines the change removed. */
  gone: string[];
}

/**
 * Lists the lines a change of a script touched, by stable line id: a line is
 * set when it is new, its text changed or the line before it is another.
 *
 * @param left Lines before.
 * @param right Lines after.
 * @returns Set and removed line ids.
 */
export function solidScriptLinesDiff<Line extends { id: string }>(
  left: readonly Line[],
  right: readonly Line[],
): SolidScriptLinesChange {
  const old = new Map(left.map((block, line) => [block.id, { text: JSON.stringify(block), line }]));
  const kept = new Set(right.map((block) => block.id));
  const set: string[] = [];
  right.forEach((block, line) => {
    const was = old.get(block.id);
    const previous = line === 0 ? null : (right[line - 1]?.id ?? null);
    const wasPrevious = was === undefined || was.line === 0 ? null : (left[was.line - 1]?.id ?? null);
    if (was === undefined || was.text !== JSON.stringify(block) || previous !== wasPrevious) set.push(block.id);
  });
  return { set, gone: left.filter((block) => !kept.has(block.id)).map((block) => block.id) };
}

/**
 * Writes the lines of a change into other lines: set lines take the source's
 * text and go after the nearest line before them in the source, removed lines
 * go, and every other line stays, so lines others changed survive.
 *
 * @param base Lines written into (not changed).
 * @param source Lines the set lines are read from.
 * @param change Lines to take.
 * @param taken Returns false for a line to leave as the base has it.
 * @returns Merged lines.
 */
export function solidScriptLinesApply<Line extends { id: string }>(
  base: readonly Line[],
  source: readonly Line[],
  change: SolidScriptLinesChange,
  taken: (id: string) => boolean = () => true,
): Line[] {
  const result = base.filter((block) => !(change.gone.includes(block.id) && taken(block.id)));
  const set = new Set(change.set.filter(taken));
  // A line that followed a moved line in the source moves along with it, so a
  // run of lines moved together keeps its order.
  const moved = new Set<string>();
  source.forEach((block, line) => {
    const follows = line > 0 && moved.has(source[line - 1]!.id) && taken(block.id);
    if (!set.has(block.id) && !follows) return;
    moved.add(block.id);
    const at = result.findIndex((candidate) => candidate.id === block.id);
    if (at < 0 && !set.has(block.id)) return;
    // A line that only follows keeps its own text, which others may have changed.
    const placed = at >= 0 && !set.has(block.id) ? result[at]! : structuredClone(block);
    if (at >= 0) result.splice(at, 1);
    let after = -1;
    for (let previous = line - 1; previous >= 0 && after < 0; previous--) {
      const prior = source[previous]?.id;
      after = result.findIndex((candidate) => candidate.id === prior);
    }
    result.splice(after + 1, 0, placed);
  });
  return result;
}

/**
 * Carries one change of a script (from one version to another) over to the
 * script as it is now, line by line: only the lines and settings that change
 * touched are written, so what others changed since stays. Undo passes the
 * change backwards, redo forwards.
 *
 * @param current Script as it is now.
 * @param from Version the change starts at.
 * @param to Version the change leads to.
 * @returns Script with the change carried over.
 */
export function solidScriptDocumentLinesCarry(
  current: SolidScriptDocument,
  from: SolidScriptDocument,
  to: SolidScriptDocument,
): SolidScriptDocument {
  const carried: Record<string, unknown> = { ...current };
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of keys) {
    if (key === 'blocks') continue;
    const before = (from as unknown as Record<string, unknown>)[key];
    const after = (to as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (after === undefined) delete carried[key];
    else carried[key] = structuredClone(after);
  }
  const blocks = solidScriptLinesApply(current.blocks, to.blocks, solidScriptLinesDiff(from.blocks, to.blocks));
  return { ...(carried as unknown as SolidScriptDocument), blocks };
}
