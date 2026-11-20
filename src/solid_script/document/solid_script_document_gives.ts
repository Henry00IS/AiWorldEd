import type { SolidScriptBlock } from './solid_script_document.js';
import type {
  SolidScriptCommandFlow,
  SolidScriptCommandGives,
  SolidScriptCommandParameter,
} from '@/solid_script/commands/solid_script_command.js';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

/** A field of a line that names a variable the line writes, with what it gives. */
export interface SolidScriptGiven {
  /** The field. */
  readonly parameter: SolidScriptCommandParameter;
  /** What it gives the variable. */
  readonly gives: SolidScriptCommandGives;
  /** Variable name as written, without brackets; never empty. */
  readonly name: string;
}

/**
 * Reads what a line means for the order lines run in, from its command.
 *
 * @param block Line.
 * @returns Flow, or nothing for a plain line.
 */
export function solidScriptGivenFlow(block: SolidScriptBlock): SolidScriptCommandFlow | undefined {
  return solidScriptCommandFind(block.command)?.flow;
}

/**
 * Reads the name a flow line names, such as the Function a Call runs.
 *
 * @param block Line.
 * @returns Name as written, trimmed; empty when its flow names none.
 */
export function solidScriptGivenFlowName(block: SolidScriptBlock): string {
  const flow = solidScriptGivenFlow(block);
  const key = flow && 'name' in flow ? flow.name : undefined;
  return key === undefined ? '' : solidScriptGivenText(block, key).trim();
}

/**
 * Lists the fields of a line that name a variable it writes, as its command
 * declares them, each with the name typed in it.
 *
 * @param block Line.
 * @returns Fields with a name typed, in field order.
 */
export function solidScriptGivenFields(block: SolidScriptBlock): SolidScriptGiven[] {
  const command = solidScriptCommandFind(block.command);
  return (command?.parameters ?? []).flatMap((parameter) => {
    const name = solidScriptGivenText(block, parameter.key)
      .trim()
      .replace(/^\[(.*)\]$/s, '$1')
      .trim();
    return parameter.writes && name !== '' ? [{ parameter, gives: parameter.writes.gives, name }] : [];
  });
}

/**
 * Reads the text of a field of a line, or the field's default when the line has
 * none.
 *
 * @param block Line.
 * @param key Field key.
 * @returns Text as typed.
 */
export function solidScriptGivenText(block: SolidScriptBlock, key: string): string {
  const typed = block.values[key];
  if (typed !== undefined && typed.trim() !== '') return typed;
  return solidScriptCommandFind(block.command)?.parameters.find((parameter) => parameter.key === key)?.default ?? '';
}

/**
 * Reads the kind the word typed in a field stands for, such as Number for an
 * Input of Type Count.
 *
 * @param block Line.
 * @param key Field key.
 * @returns Kind, or nothing when the word gives none.
 */
export function solidScriptGivenWordKind(block: SolidScriptBlock, key: string): string | undefined {
  const typed = solidScriptGivenText(block, key).trim().toLowerCase();
  const parameter = solidScriptCommandFind(block.command)?.parameters.find((entry) => entry.key === key);
  return parameter?.words?.find((word) => word.word.toLowerCase() === typed)?.gives;
}

/**
 * Describes the variable a field gives, from its declared description: {key} is
 * the text of another field and {command} the line's block.
 *
 * @param block Line.
 * @param what Description.
 * @returns Description filled in.
 */
export function solidScriptGivenDetail(block: SolidScriptBlock, what: string): string {
  const command = solidScriptCommandFind(block.command);
  return what.replace(/\{(\w+)\}/g, (_, key: string) =>
    key === 'command' ? (command?.label ?? block.command) : solidScriptGivenText(block, key).trim(),
  );
}

/**
 * Finds the command whose lines have a flow of a kind, such as the Function
 * command, for descriptions that name it.
 *
 * @param kind Flow kind.
 * @returns Its label, or the kind when none has it.
 */
export function solidScriptGivenFlowLabel(kind: SolidScriptCommandFlow['kind']): string {
  return solidScriptCommands.find((command) => command.flow?.kind === kind)?.label ?? kind;
}
