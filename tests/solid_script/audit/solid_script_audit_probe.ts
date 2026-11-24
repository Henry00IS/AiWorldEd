import { solidScriptKindBroader } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentFlowAt } from '@/solid_script/document/solid_script_document_flow.js';
import { SOLID_SCRIPT_FLOW_UNKNOWN } from '@/solid_script/document/solid_script_document_flow_kinds.js';
import { solidScriptKindOf } from '@/solid_script/language/solid_script_kinds.js';
import { SolidScriptMachine } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptScope } from '@/solid_script/language/solid_script_scope.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';

/** The kinds the variables held when a line started, as a run saw them. */
export interface SolidScriptAuditSeen {
  /** 0-based line. */
  line: number;
  /** Kind of every visible variable, by name key. */
  kinds: Map<string, string>;
}

/** Lines seen by the probe while a run is going, or null when no probe runs. */
let seen: SolidScriptAuditSeen[] | null = null;

type LineStep = (this: unknown, node: { line: number }, scope: SolidScriptScope, ...rest: unknown[]) => unknown;
const prototype = SolidScriptMachine.prototype as unknown as { lineExecute: LineStep };
const step = prototype.lineExecute;
prototype.lineExecute = function (this: unknown, node, scope, ...rest) {
  // A line after a mistake, a pause, a Return or Stop Script does not run; the machine skips it inside.
  const machine = this as { failure?: unknown; paused?: unknown; leaving?: unknown; stopping?: unknown };
  if (seen && !machine.failure && !machine.paused && !machine.leaving && !machine.stopping) {
    const kinds = new Map([...scope.variablesVisible()].map(([name, value]) => [name, solidScriptKindOf(value)]));
    seen.push({ line: node.line - 1, kinds });
  }
  return step.call(this, node, scope, ...rest);
};

/**
 * Runs a script and records the kind of every variable at the start of every
 * line it ran.
 *
 * @param lines Lines.
 * @returns Run and what it saw.
 */
export function solidScriptAuditRun(lines: readonly SolidScriptLine[]): {
  run: SolidScriptRun;
  seen: SolidScriptAuditSeen[];
} {
  seen = [];
  try {
    const run = solidScriptProgramRun(solidScriptDocumentCreate([...lines]));
    return { run, seen };
  } finally {
    seen = null;
  }
}

/**
 * Tells whether kinds the editor predicts cover a kind a run gave: the kind
 * itself, the unknown kind, List for any list, any list for an empty one, a
 * Vector and a Number List for each other, and Text for a Number, as text may
 * read as one.
 *
 * @param predicted Kinds the editor predicts.
 * @param kind Kind a run gave.
 * @returns True when covered.
 */
export function solidScriptAuditCovers(predicted: readonly string[], kind: string): boolean {
  if (predicted.includes(kind) || predicted.includes(SOLID_SCRIPT_FLOW_UNKNOWN)) return true;
  if (kind.endsWith('List') && predicted.includes('List')) return true;
  // An empty list is a List, whatever kind of items it was meant to hold.
  if (kind === 'List' && predicted.some((each) => each.endsWith('List') || each === 'Vector')) return true;
  if (kind === 'Vector' && (predicted.includes('Number List') || predicted.includes('List'))) return true;
  if (kind === 'Number List' && predicted.includes('Vector')) return true;
  const broader = solidScriptKindBroader(kind);
  if (broader && predicted.includes(broader)) return true;
  return kind === 'Number' && predicted.includes('Text');
}

/**
 * Finds every variable whose kind at a line the editor's flow analysis did not
 * predict: names a run holds that the editor thinks no line set, or kinds it
 * rules out. System and $Persistent. values are left out.
 *
 * @param lines Lines.
 * @returns Problems in plain words, empty when the analysis was sound.
 */
export function solidScriptAuditUnsound(lines: readonly SolidScriptLine[]): string[] {
  const { seen: lines_seen } = solidScriptAuditRun(lines);
  const document = solidScriptDocumentCreate([...lines]);
  const problems: string[] = [];
  for (const { line, kinds } of lines_seen) {
    const state = solidScriptDocumentFlowAt(document, line);
    for (const [name, kind] of kinds) {
      if (name.startsWith('$') || name.startsWith('persistent.')) continue;
      const held = state.get(name);
      const predicted = held ? [...held.kinds] : undefined;
      if (!predicted || !solidScriptAuditCovers(predicted, kind))
        problems.push(
          `line ${line + 1}: ${name} holds a ${kind}, predicted ${predicted ? predicted.join(' or ') || 'unknown' : 'nothing'}`,
        );
    }
  }
  return [...new Set(problems)];
}
