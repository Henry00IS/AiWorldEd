import type { SolidScriptBlockNode } from './solid_script_block_tree.js';
import {
  solidScriptFieldAsTyped,
  solidScriptFieldCompiled,
  solidScriptFieldLone,
  solidScriptFieldTemplate,
  type SolidScriptFieldCompiled,
} from './solid_script_field.js';
import { solidScriptKindAccepted, solidScriptKindMismatch, solidScriptKindOf } from './solid_script_kinds.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import type { SolidScriptMachine } from './solid_script_machine.js';
import { SOLID_SCRIPT_DEFINITIONS, SOLID_SCRIPT_FORMULA_CONTEXT } from './solid_script_machine_calls.js';
import type {
  SolidScriptBlockRun,
  SolidScriptContext,
  SolidScriptMachineCommand,
  SolidScriptMachineField,
} from './solid_script_machine_types.js';
import type { SolidScriptScope } from './solid_script_scope.js';

/** Builds what a running line can read and do, once per line. */
export type SolidScriptRunBuild = (
  node: SolidScriptBlockNode<SolidScriptMachineCommand>,
  state: SolidScriptLineState,
) => SolidScriptBlockRun;

/** Scope and context a line runs in this time. */
export interface SolidScriptLineState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- run views are shared by machines of any command type.
  machine: SolidScriptMachine<any>;
  scope: SolidScriptScope;
  context: SolidScriptContext;
}

/**
 * The run view of a line, made once per line and reused, by every machine that
 * runs the line, while the line is not running.
 */
export interface SolidScriptLineRun {
  run: SolidScriptBlockRun;
  state: SolidScriptLineState;
  /** True while the line runs, so a Function calling itself gets its own view. */
  busy: boolean;
  /** True for a definition line, which is skipped where it stands. */
  definition: boolean;
}

/** A field of a line, read once per run. */
export interface SolidScriptLineField {
  /** Field text, or its default. */
  text: string;
  /** Caption, for messages. */
  label: string;
  /** Closure that reads its value. */
  compiled: SolidScriptFieldCompiled;
  /** True when its text holds commas outside brackets, worked out on first use. */
  listed?: boolean;
}

/**
 * Run views by line, kept across runs: building one costs about fifty closures,
 * so a script rebuilt with new inputs reuses those of the last run.
 */
const SOLID_SCRIPT_LINE_RUNS = new WeakMap<object, SolidScriptLineRun>();

/** The kept run views of the lines of a block. */
export interface SolidScriptBlockRuns {
  /** Run views in line order. */
  runs: readonly SolidScriptLineRun[];
  /** True when a line defines a part, Function or event handler. */
  defines: boolean;
}

/** Run views of the lines of a block, by block, kept across runs. */
const SOLID_SCRIPT_LINES_RUNS = new WeakMap<object, SolidScriptBlockRuns>();

/**
 * Returns the kept run view of a line, making it the first time.
 *
 * @param node Line.
 * @param build Builds the run view of a line.
 * @returns Run view.
 */
export function solidScriptRunKnown<Command extends SolidScriptMachineCommand>(
  node: SolidScriptBlockNode<Command>,
  build: SolidScriptRunBuild,
): SolidScriptLineRun {
  let known = SOLID_SCRIPT_LINE_RUNS.get(node);
  if (!known) SOLID_SCRIPT_LINE_RUNS.set(node, (known = solidScriptRunMake(node, build)));
  return known;
}

/**
 * Returns the kept run views of the lines of a block, in line order, and
 * whether any of them defines something.
 *
 * @param lines Lines.
 * @param build Builds the run view of a line.
 * @returns Run views.
 */
export function solidScriptRunsKnown<Command extends SolidScriptMachineCommand>(
  lines: readonly SolidScriptBlockNode<Command>[],
  build: SolidScriptRunBuild,
): SolidScriptBlockRuns {
  let known = SOLID_SCRIPT_LINES_RUNS.get(lines);
  if (!known) {
    const runs = lines.map((node) => solidScriptRunKnown(node, build));
    known = { runs, defines: runs.some((run) => run.definition) };
    SOLID_SCRIPT_LINES_RUNS.set(lines, known);
  }
  return known;
}

/**
 * Makes a run view of a line, not yet tied to a run.
 *
 * @param node Line.
 * @param build Builds the run view of a line.
 * @returns Run view.
 */
export function solidScriptRunMake<Command extends SolidScriptMachineCommand>(
  node: SolidScriptBlockNode<Command>,
  build: SolidScriptRunBuild,
): SolidScriptLineRun {
  const made: SolidScriptLineRun = {
    run: null as unknown as SolidScriptBlockRun,
    state: {
      machine: null as unknown as SolidScriptLineState['machine'],
      scope: null as unknown as SolidScriptScope,
      context: SOLID_SCRIPT_FORMULA_CONTEXT,
    },
    busy: false,
    definition: SOLID_SCRIPT_DEFINITIONS.has(node.command.id),
  };
  made.run = build(node, made.state);
  return made;
}

/**
 * Returns whether lines output the brushes a modifier receives.
 *
 * @param lines Lines.
 * @returns True when an Input Brushes line is among them.
 */
export function solidScriptLinesPassInput(lines: readonly SolidScriptBlockNode<SolidScriptMachineCommand>[]): boolean {
  return lines.some(
    (node) =>
      node.command.id === 'input_brushes' ||
      solidScriptLinesPassInput(node.children) ||
      solidScriptLinesPassInput(node.otherwise ?? []),
  );
}

/**
 * Makes the reader of one field of a line, the one path every field is read
 * through: a field that names what the line writes or defines is used as typed;
 * every other field reads its [names] and [=formulas] and stops on a kind it
 * does not accept, such as a Brush in a Name.
 *
 * @param field The field as its command declares it.
 * @param text Field text, or its default.
 * @returns Field.
 */
export function solidScriptLineFieldMake(field: SolidScriptMachineField, text: string): SolidScriptLineField {
  if (solidScriptFieldAsTyped(field)) return { text, label: field.label, compiled: () => text };
  const compiled = solidScriptFieldCompiled(field.type, text);
  if (field.accepts === 'Any') return { text, label: field.label, compiled };
  const check = solidScriptLineFieldKind(field.label, field.accepts);
  if (!SOLID_SCRIPT_FIELD_KINDS_CONVERTED.has(field.type) || !solidScriptFieldLone(text))
    return { text, label: field.label, compiled: (context) => check(compiled(context)) };
  // A lone [value] is checked as it is, before the field kind turns it into text or points.
  const whole = solidScriptFieldTemplate(text);
  const message = field.type === 'message';
  return {
    text,
    label: field.label,
    compiled: (context) => {
      const value = check(whole(context));
      return message ? solidScriptValueText(value) : compiled(context);
    },
  };
}

/** Field kinds that turn a value into text or points as they read it. */
const SOLID_SCRIPT_FIELD_KINDS_CONVERTED: ReadonlySet<string> = new Set(['message', 'points2', 'points3']);

/**
 * Makes the check that a field got a kind of value it accepts.
 *
 * @param label Field caption.
 * @param accepts Kinds it accepts.
 * @returns Check that gives the value back or stops with a plain message.
 */
function solidScriptLineFieldKind(
  label: string,
  accepts: Exclude<SolidScriptMachineField['accepts'], 'Any'>,
): (value: SolidScriptValue) => SolidScriptValue {
  return (value) => {
    const kind = solidScriptKindOf(value);
    if (solidScriptKindAccepted(accepts, kind)) return value;
    throw new Error(`${solidScriptKindMismatch(label, accepts, kind)}: ${solidScriptValueText(value)}`);
  };
}

/**
 * Returns a line's field reader, made once per run view of the line.
 *
 * @param fields Fields of the line read so far, by key.
 * @param node Line.
 * @param key Field key.
 * @returns Field.
 */
export function solidScriptLineFieldOf<Command extends SolidScriptMachineCommand>(
  fields: Map<string, SolidScriptLineField>,
  node: SolidScriptBlockNode<Command>,
  key: string,
): SolidScriptLineField {
  let field = fields.get(key);
  if (!field) {
    const parameter = node.command.parameters.find((entry) => entry.key === key);
    const declared = parameter ?? { key, label: key, type: 'value' as const, accepts: 'Any' as const };
    field = solidScriptLineFieldMake(declared, node.command.valueText(node.values, key));
    fields.set(key, field);
  }
  return field;
}
