import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { fieldCollaborationGet } from '@/collaboration/sync/field_collaboration_paths.js';
import { solidScriptLinesApply, solidScriptLinesDiff } from '@/solid_script/document/solid_script_document_lines.js';

/** Most lines one operation may name; larger changes replace the whole stack. */
export const SCRIPT_COLLABORATION_LINES_MAXIMUM = 2048;

/** Longest accepted line or modifier id. */
const SCRIPT_COLLABORATION_ID_LENGTH = 64;

/** Field paths of a node state that hold a modifier list. */
const SCRIPT_COLLABORATION_PATHS = ['data.entry.modifierStack.modifiers', 'data.modifierStack.modifiers'];

/**
 * Lines of the scripts in one modifier list that an edit changed: per modifier
 * id the ids of lines it set (new, changed or moved) and the ids it removed.
 * Script edits name their lines this way, so concurrent edits of different
 * lines of one script both win and an undo only reverts its own lines.
 */
export interface ScriptCollaborationLines {
  /** Field path of the modifier list. */
  path: string;
  /** Changed lines by modifier id. */
  steps: Record<string, { set: string[]; gone: string[] }>;
}

/** Script line as stored: anything with a string id. */
type ScriptCollaborationBlock = { id: string } & Record<string, unknown>;

/** One modifier of a list. */
type ScriptCollaborationStep = { id?: unknown; parameters?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Returns the lines of a script parameter, or null when it is no script.
 *
 * @param step Modifier.
 * @returns Lines, or null.
 */
function scriptCollaborationBlocks(step: ScriptCollaborationStep | undefined): ScriptCollaborationBlock[] | null {
  const script = step?.parameters?.['script'];
  if (typeof script !== 'object' || script === null) return null;
  const blocks = (script as Record<string, unknown>)['blocks'];
  if (!Array.isArray(blocks)) return null;
  const valid = blocks.every(
    (block) => typeof block === 'object' && block !== null && typeof (block as { id?: unknown }).id === 'string',
  );
  return valid ? (blocks as ScriptCollaborationBlock[]) : null;
}

/**
 * Returns a modifier with its script lines left out, for comparing everything
 * else.
 *
 * @param step Modifier.
 * @returns Comparable text.
 */
function scriptCollaborationRest(step: ScriptCollaborationStep): string {
  const parameters = step.parameters ?? {};
  const script = parameters['script'];
  const rest =
    typeof script === 'object' && script !== null ? { ...(script as Record<string, unknown>), blocks: null } : script;
  return JSON.stringify({ ...step, parameters: { ...parameters, script: rest } });
}

/**
 * Returns the lines a change of one modifier list touches, or null when the
 * change is more than script lines (another value, another modifier, a modifier
 * added or removed), which then replaces the list as before.
 *
 * @param before Modifier list before.
 * @param after Modifier list after.
 * @returns Changed lines by modifier id, or null.
 */
function scriptCollaborationListDiff(before: unknown, after: unknown): ScriptCollaborationLines['steps'] | null {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return null;
  const steps: ScriptCollaborationLines['steps'] = {};
  let count = 0;
  for (let index = 0; index < after.length; index++) {
    const a = before[index] as ScriptCollaborationStep;
    const b = after[index] as ScriptCollaborationStep;
    if (typeof b?.id !== 'string' || a?.id !== b.id) return null;
    if (scriptCollaborationRest(a) !== scriptCollaborationRest(b)) return null;
    const left = scriptCollaborationBlocks(a);
    const right = scriptCollaborationBlocks(b);
    if (left === null || right === null) continue;
    const { set, gone } = solidScriptLinesDiff(left, right);
    if (set.length === 0 && gone.length === 0) continue;
    count += set.length + gone.length;
    if (count > SCRIPT_COLLABORATION_LINES_MAXIMUM) return null;
    steps[b.id] = { set, gone };
  }
  return Object.keys(steps).length > 0 ? steps : null;
}

/**
 * Returns the script lines a change of a node state touches, when the change of
 * its modifier list is only script lines.
 *
 * @param before State before.
 * @param after State after.
 * @param fields Changed field paths of the change.
 * @returns Lines, or null.
 */
export function scriptCollaborationLinesDiff(
  before: NodeCollaborationState,
  after: NodeCollaborationState,
  fields: readonly string[],
): ScriptCollaborationLines | null {
  const path = SCRIPT_COLLABORATION_PATHS.find((candidate) => fields.includes(candidate));
  if (path === undefined) return null;
  const parts = path.split('.');
  const steps = scriptCollaborationListDiff(fieldCollaborationGet(before, parts), fieldCollaborationGet(after, parts));
  return steps === null ? null : { path, steps };
}

/**
 * Parses the line list of a relayed operation.
 *
 * @param value Untrusted `d.l`.
 * @returns Lines, or null when absent or malformed (the whole list applies).
 */
export function scriptCollaborationLinesParse(value: unknown): ScriptCollaborationLines | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const path = record['path'];
  const steps = record['steps'];
  if (typeof path !== 'string' || !SCRIPT_COLLABORATION_PATHS.includes(path)) return null;
  if (typeof steps !== 'object' || steps === null || Array.isArray(steps)) return null;
  const ids = (list: unknown): list is string[] =>
    Array.isArray(list) &&
    list.every((id) => typeof id === 'string' && id !== '' && id.length <= SCRIPT_COLLABORATION_ID_LENGTH);
  const parsed: ScriptCollaborationLines['steps'] = {};
  let count = 0;
  for (const [step, entry] of Object.entries(steps as Record<string, unknown>)) {
    if (step === '' || step.length > SCRIPT_COLLABORATION_ID_LENGTH || step === '__proto__') return null;
    const { set, gone } = (entry ?? {}) as { set?: unknown; gone?: unknown };
    if (!ids(set) || !ids(gone)) return null;
    count += set.length + gone.length;
    if (count > SCRIPT_COLLABORATION_LINES_MAXIMUM) return null;
    parsed[step] = { set: [...set], gone: [...gone] };
  }
  return { path, steps: parsed };
}

/**
 * Returns the keys of every line an edit touches, as `modifier:line`, for
 * keeping own unacknowledged lines.
 *
 * @param lines Lines.
 * @returns Keys.
 */
export function scriptCollaborationLinesKeys(lines: ScriptCollaborationLines): string[] {
  return Object.entries(lines.steps).flatMap(([step, entry]) =>
    [...entry.set, ...entry.gone].map((line) => `${step}:${line}`),
  );
}

/**
 * Writes the named lines of a source state's scripts into a base state: set
 * lines take the source's text and go after the line before them in the source,
 * removed lines go. Every other line of the base stays, so other users' lines
 * survive. Lines in `skip` are left as the base has them.
 *
 * @param base State written into (not changed).
 * @param source State the lines are read from.
 * @param lines Lines to take.
 * @param skip Keys (`modifier:line`) to leave alone.
 * @returns Merged copy, or the base when it has no such list.
 */
export function scriptCollaborationLinesApply(
  base: NodeCollaborationState,
  source: NodeCollaborationState,
  lines: ScriptCollaborationLines,
  skip: ReadonlySet<string> = new Set(),
): NodeCollaborationState {
  const parts = lines.path.split('.');
  const into = fieldCollaborationGet(base, parts);
  const from = fieldCollaborationGet(source, parts);
  if (!Array.isArray(into) || !Array.isArray(from)) return base;
  const list = (into as ScriptCollaborationStep[]).map((step) => {
    const entry = typeof step.id === 'string' ? lines.steps[step.id] : undefined;
    const blocks = scriptCollaborationBlocks(step);
    const other = (from as ScriptCollaborationStep[]).find((candidate) => candidate.id === step.id);
    const theirs = scriptCollaborationBlocks(other);
    if (!entry || blocks === null || theirs === null) return step;
    const id = step.id as string;
    const result = solidScriptLinesApply(blocks, theirs, entry, (line) => !skip.has(`${id}:${line}`));
    const script = step.parameters?.['script'] as Record<string, unknown>;
    return { ...step, parameters: { ...step.parameters, script: { ...script, blocks: result } } };
  });
  return scriptCollaborationStateWith(base, parts, list);
}

/**
 * Returns a copy of a state with one path replaced, copying only along it.
 *
 * @param state State.
 * @param parts Path segments.
 * @param value New value.
 * @returns Copy.
 */
function scriptCollaborationStateWith(
  state: NodeCollaborationState,
  parts: readonly string[],
  value: unknown,
): NodeCollaborationState {
  const write = (node: unknown, index: number): unknown => {
    if (index === parts.length) return value;
    const record = node as Record<string, unknown>;
    const key = parts[index] ?? '';
    return { ...record, [key]: write(record[key], index + 1) };
  };
  return write(state, 0) as NodeCollaborationState;
}
