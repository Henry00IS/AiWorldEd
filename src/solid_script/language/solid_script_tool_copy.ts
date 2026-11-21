import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptGeometryLeaves } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptShape } from './solid_script_shape.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';

/**
 * Holds the edited copies a tool makes when Into is set, so the original leaves
 * stay as they are.
 */
export class SolidScriptToolCopy {
  private active = false;
  private readonly copies = new Map<SolidScriptGeometryLeaf, SolidScriptGeometryLeaf>();

  /** Starts a copy session for one tool line. */
  start(): void {
    this.active = true;
    this.copies.clear();
  }

  /** Whether a tool line is writing a copy instead of editing in place. */
  get copying(): boolean {
    return this.active;
  }

  /**
   * Remembers an edited copy instead of swapping the original.
   *
   * @param leaf Leaf the tool asked to replace.
   * @param by Edited leaf.
   * @returns True when the swap was kept as a copy.
   */
  take(leaf: SolidScriptGeometryLeaf, by: SolidScriptGeometryLeaf): boolean {
    if (!this.active) return false;
    this.copies.set(leaf, by);
    return true;
  }

  /**
   * The edited copy of a leaf in this session, if the tool has written one.
   *
   * @param leaf Original or later leaf.
   * @returns Copy, or null when this session has none.
   */
  of(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf | null {
    if (!this.active) return null;
    return this.copies.get(leaf) ?? null;
  }

  /** Edited copies this session has written, in the order they were kept. */
  results(): SolidScriptGeometryLeaf[] {
    return [...this.copies.values()];
  }

  /** Ends the session and drops the kept copies. */
  end(): void {
    this.active = false;
    this.copies.clear();
  }
}

/**
 * Runs an edit tool: a copy-style Into leaves the original and keeps the result
 * in the variable, not in the scene; otherwise the tool edits in place.
 *
 * @param run Running line.
 * @param body The tool's own step.
 * @param writeInto True when this line's Into is the edited copy.
 * @param into Variable a copy-style Into names, or empty to edit in place.
 * @returns Shapes to place in the scene, if any.
 */
export function solidScriptToolRun(
  run: SolidScriptBlockRun,
  body: (run: SolidScriptBlockRun) => SolidScriptShape[],
  writeInto: boolean,
  into: string,
): SolidScriptShape[] {
  if (into === '') return solidScriptToolStay(run, body(run));
  run.toolCopyStart();
  const shapes = body(run);
  if (writeInto) solidScriptToolWrite(run, into, shapes);
  run.toolCopyEnd();
  return [];
}

/**
 * Writes the edited copies and any new shapes to Into, as a list.
 *
 * @param run Running line.
 * @param into Variable name.
 * @param shapes New shapes the tool built.
 */
function solidScriptToolWrite(run: SolidScriptBlockRun, into: string, shapes: readonly SolidScriptShape[]): void {
  const leaves = [...solidScriptGeometryLeaves(shapes), ...run.toolCopyResults()];
  if (leaves.length === 0) return;
  const brushes: SolidScriptValue[] = leaves.map((leaf) => run.elements.brush(leaf));
  if (brushes.some((entry) => !(entry instanceof SolidScriptElement))) return;
  run.variableSet(into, brushes);
}

/**
 * Places new shapes in the scene only when the tool's targets are already
 * there; otherwise keeps them with the target in memory.
 *
 * @param run Running line.
 * @param shapes New shapes the tool built.
 * @returns Shapes to place in the scene.
 */
function solidScriptToolStay(run: SolidScriptBlockRun, shapes: readonly SolidScriptShape[]): SolidScriptShape[] {
  if (shapes.length === 0) return [];
  const leaves = solidScriptToolLeaves(run);
  if (leaves.length === 0 || solidScriptToolShown(run, leaves)) return [...shapes];
  if (run.partAdopt(leaves, shapes)) return [];
  return [...shapes];
}

/**
 * Tells whether any of a tool's target leaves is already in the scene.
 *
 * @param run Running line.
 * @param leaves Target leaves.
 * @returns True when a target was built into the current output.
 */
function solidScriptToolShown(run: SolidScriptBlockRun, leaves: readonly SolidScriptGeometryLeaf[]): boolean {
  const built = solidScriptGeometryLeaves(run.built());
  return leaves.some((leaf) => built.includes(leaf) || built.includes(run.leafLatest(leaf)));
}

/**
 * Leaves a tool is working on, from Of or the current selection.
 *
 * @param run Running line.
 * @returns Unique solids and meshes.
 */
function solidScriptToolLeaves(run: SolidScriptBlockRun): SolidScriptGeometryLeaf[] {
  const values = run.ofValues() ?? [
    ...run.selectedGet('faces'),
    ...run.selectedGet('edges'),
    ...run.selectedGet('vertices'),
    ...run.selectedGet('objects'),
  ];
  const leaves: SolidScriptGeometryLeaf[] = [];
  for (const value of values) {
    if (!(value instanceof SolidScriptElement)) continue;
    if (value.kind !== 'brush' && value.kind !== 'face' && value.kind !== 'edge' && value.kind !== 'vertex') continue;
    const leaf = run.leafLatest(run.elements.leaf(value));
    if (!leaves.includes(leaf)) leaves.push(leaf);
  }
  return leaves;
}
