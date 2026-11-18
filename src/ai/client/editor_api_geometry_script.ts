import { solidScriptInputValue } from '@/solid_script/language/solid_script_input.js';
import type * as THREE from 'three';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptBlockCreate,
  solidScriptDocumentNormalize,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramEvaluate, solidScriptProgramHandle } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_PERSISTENT_PREFIX } from '@/solid_script/language/solid_script_machine_variables.js';
import type { SolidScriptEvent } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import {
  solidScriptDocumentInputLayout,
  solidScriptInputRulesHold,
} from '@/solid_script/document/solid_script_document_inputs.js';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';
import { solidScriptInspectorInputValues } from '@/solid_script/ui/solid_script_inspector_inputs.js';
import type { EditorApiHost } from './editor_api_host.js';
import { modifierObjectFind } from './modifier/editor_api_modifier_lookup.js';
import { failResult, okResult } from './editor_api_result.js';

/** One line as the tools write it: a command with the values it changes. */
export interface GeometryScriptLineArgs {
  command: string;
  values?: Record<string, string>;
}

/** Arguments of geometry_script_generator_set. */
export interface GeometryScriptGeneratorSetArgs {
  objectId: string;
  name?: string;
  lines?: GeometryScriptLineArgs[];
  placement?: string;
  inputs?: Record<string, unknown>;
  press?: string;
}

/** What the inspector event handlers of one set answered. */
interface GeometryScriptHandled {
  inputs: Record<string, string>;
  notices: string[];
  errors: string[];
}

/** Box mappings a SolidScript generator offers. */
const GEOMETRY_SCRIPT_PLACEMENTS = ['origin', 'fit', 'stretch'];

/** A SolidScript generator found by id. */
interface GeometryScriptGenerator {
  node: THREE.Object3D;
  stepId: string;
  parameters: Record<string, unknown>;
}

/**
 * Reads and writes the script of SolidScript generators, with the same command
 * lines the script editor offers.
 */
export class EditorApiGeometryScript {
  /**
   * Creates the part.
   *
   * @param host Injected editor systems.
   */
  constructor(private readonly host: EditorApiHost) {}

  /**
   * Returns the full SolidScript reference.
   *
   * @returns The reference as Markdown text.
   */
  reference(): McpToolResult {
    return okResult('SolidScript reference', { reference: solidScriptReference() });
  }

  /**
   * Lists the commands of the script editor.
   *
   * @returns Commands with their values, help and an example line.
   */
  commandList(): McpToolResult {
    const commands = solidScriptCommands.map((command) => ({
      id: command.id,
      label: command.label,
      category: command.category,
      description: command.description,
      nesting: command.nesting,
      inPalette: command.inPalette,
      parameters: command.parameters.map(({ key, label, type, default: fallback, hint }) => ({
        key,
        label,
        type,
        default: fallback,
        hint,
      })),
      manual: command.manual,
      stops: command.stops,
      example: {
        command: command.id,
        values: command.valuesDefault(),
        listed: command.listingText(command.valuesDefault()),
      },
    }));
    return okResult(`${commands.length} commands`, { commands });
  }

  /**
   * Reads a generator's script.
   *
   * @param objectId Generator node id.
   * @returns Name, lines, placement, solid count and the first error.
   */
  generatorGet(objectId: string): McpToolResult {
    const generator = this.generatorFind(objectId);
    if (typeof generator === 'string') return failResult(generator);
    const document = solidScriptDocumentNormalize(generator.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    return okResult(`${document.blocks.length} lines`, this.describe(generator, document));
  }

  /**
   * Replaces a generator's script name, lines, placement and input values as
   * one undo step.
   *
   * @param args Generator, new name, new command lines, placement and input
   *   values.
   * @returns The stored script.
   */
  generatorSet(args: GeometryScriptGeneratorSetArgs): McpToolResult {
    const generator = this.generatorFind(args.objectId);
    if (typeof generator === 'string') return failResult(generator);
    if (args.placement !== undefined && !GEOMETRY_SCRIPT_PLACEMENTS.includes(args.placement))
      return failResult(`placement must be one of ${GEOMETRY_SCRIPT_PLACEMENTS.join(', ')}`);
    const document = this.documentFrom(args, generator);
    if (typeof document === 'string') return failResult(document);
    const typed = geometryScriptInputsRead(args.inputs, document, generator.parameters);
    if (typeof typed === 'string') return failResult(typed);
    const events = geometryScriptEvents(args, document);
    if (typeof events === 'string') return failResult(events);
    const handled = geometryScriptHandle(document, events, typed);
    const before = ModifierVolume.read(generator.node);
    const patch = {
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: document,
      [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: handled.inputs,
      ...(args.placement ? { placement: args.placement } : {}),
    };
    const after = modifierStackPatch(before, generator.stepId, { parameters: { ...generator.parameters, ...patch } });
    this.host.commandStack.push(new CommandModifierStackSet(generator.node, before, after));
    this.host.refreshAfterWorldMutation();
    this.host.showStatus(`Edited the script of ${generator.node.name}`);
    const result = this.generatorGet(args.objectId);
    if (events.length === 0) return result;
    return { ...result, data: { ...(result.data as object), notices: handled.notices, handlerErrors: handled.errors } };
  }

  /**
   * Builds the new script from the current one, a new name and new lines.
   *
   * @param args Set arguments.
   * @param generator Generator, for the current script.
   * @returns Script, or an error.
   */
  private documentFrom(
    args: GeometryScriptGeneratorSetArgs,
    generator: GeometryScriptGenerator,
  ): SolidScriptDocument | string {
    const current = solidScriptDocumentNormalize(generator.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    const name = args.name ?? current.name;
    if (args.lines === undefined) return { ...current, name };
    const blocks = geometryScriptLinesRead(args.lines);
    if (typeof blocks === 'string') return blocks;
    return { ...current, name, blocks };
  }

  /**
   * Describes a generator's script.
   *
   * @param generator Generator.
   * @param document Script.
   * @returns Tool data.
   */
  private describe(generator: GeometryScriptGenerator, document: SolidScriptDocument): Record<string, unknown> {
    const values = solidScriptInspectorInputValues(generator.parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]);
    const { solids, error } = geometryScriptRun(document, values);
    const layout = solidScriptDocumentInputLayout(document);
    const fallbacks = new Map(
      layout.flatMap((item) => (item.kind === 'input' ? [[item.input.name, item.input.fallback] as const] : [])),
    );
    const valueOf = (name: string): string | undefined => values[name] ?? fallbacks.get(name);
    const inputs = layout.flatMap((item) => {
      if (item.kind !== 'input') return [];
      const { fallback, ...input } = item.input;
      return [
        {
          ...input,
          default: fallback,
          value: values[input.name] ?? fallback,
          group: item.group,
          shown: solidScriptInputRulesHold(item.when, valueOf),
        },
      ];
    });
    const notes = layout.flatMap((item) => (item.kind === 'note' ? [item.text] : []));
    const listed = solidScriptDocumentListing(document);
    const lines = document.blocks.map((block, index) => ({
      line: index + 1,
      command: block.command,
      values: block.values,
      listed: listed[index] ?? '',
    }));
    return {
      objectId: generator.node.uuid,
      name: document.name,
      placement: generator.parameters['placement'],
      lines,
      inputs,
      notes,
      solids,
      error,
    };
  }

  /**
   * Finds a SolidScript generator.
   *
   * @param objectId Generator node id.
   * @returns Generator, or an error.
   */
  private generatorFind(objectId: string): GeometryScriptGenerator | string {
    const node = modifierObjectFind(this.host.worldObject, objectId);
    if (!node || !ModifierVolume.isGenerator(node)) return `No generator ${objectId}`;
    const entry = ModifierVolume.read(node).modifiers[0];
    if (entry?.kind !== MODIFIER_STACK_SOLID_SCRIPT_KIND)
      return `${node.name || objectId} is no SolidScript generator; create one with modifier_generator_create kind ${MODIFIER_STACK_SOLID_SCRIPT_KIND}`;
    return { node, stepId: entry.id, parameters: entry.parameters };
  }
}

/**
 * Turns the lines the tools write into script lines.
 *
 * @param lines Tool lines.
 * @returns Script lines, or an error naming the line.
 */
export function geometryScriptLinesRead(lines: unknown): SolidScriptBlock[] | string {
  if (!Array.isArray(lines)) return 'lines must be a list of {command, values} lines';
  const blocks: SolidScriptBlock[] = [];
  for (const [index, line] of lines.entries()) {
    const block = geometryScriptLineRead(line as GeometryScriptLineArgs);
    if (typeof block === 'string') return `Line ${index + 1}: ${block}`;
    blocks.push(block);
  }
  return blocks;
}

/**
 * Turns one tool line into a script line.
 *
 * @param line Tool line.
 * @returns Script line, or an error.
 */
function geometryScriptLineRead(line: GeometryScriptLineArgs): SolidScriptBlock | string {
  const command = typeof line?.command === 'string' ? solidScriptCommandFind(line.command) : undefined;
  if (!command) return `unknown command ${String(line?.command)}; see geometry_script_command_list`;
  const known = new Set(command.parameters.map((parameter) => parameter.key));
  const unknown = Object.keys(line.values ?? {}).filter((key) => !known.has(key));
  if (unknown.length > 0) return `${command.id} has no value ${unknown.join(', ')}`;
  return solidScriptBlockCreate(
    command.id,
    Object.fromEntries(Object.entries(line.values ?? {}).map(([key, value]) => [key, String(value)])),
  );
}

/**
 * Merges the input values the tools write into the stored ones, keeping only
 * inputs the script has and the persistent values its handlers stored.
 *
 * @param given Input values by name, or undefined to keep the stored ones.
 * @param document New script.
 * @param parameters Current generator parameters.
 * @returns Input values as text by name, or an error.
 */
function geometryScriptInputsRead(
  given: Record<string, unknown> | undefined,
  document: SolidScriptDocument,
  parameters: Record<string, unknown>,
): Record<string, string> | string {
  const inputs = solidScriptInputsList(document.blocks);
  const names = new Set(inputs.map((input) => input.name));
  const stored = solidScriptInspectorInputValues(parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]);
  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries(stored))
    if (names.has(name) || name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) merged[name] = value;
  if (given === undefined) return merged;
  if (!given || typeof given !== 'object' || Array.isArray(given))
    return 'inputs must be an object of values by input name';
  for (const [name, value] of Object.entries(given)) {
    if (!names.has(name))
      return `the script has no Input ${name}; inputs: ${[...names].join(', ') || 'none, add an Input line first'}`;
    if (!['string', 'number', 'boolean'].includes(typeof value))
      return `input ${name} must be a number, text or true/false`;
    merged[name] = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
    // A run falls back to the Default for a value it does not take, so a set value is checked here.
    try {
      solidScriptInputValue(
        inputs.find((input) => input.name === name)!,
        merged[name],
      );
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return merged;
}

/**
 * Lists the inspector events a set causes: a change of each given input, then
 * the press of a button input.
 *
 * @param args Set arguments.
 * @param document New script.
 * @returns Events in order, or an error.
 */
function geometryScriptEvents(
  args: GeometryScriptGeneratorSetArgs,
  document: SolidScriptDocument,
): SolidScriptEvent[] | string {
  const events: SolidScriptEvent[] = Object.keys(args.inputs ?? {}).map((name) => ({ kind: 'input', name }));
  if (args.press === undefined) return events;
  const buttons = solidScriptInputsList(document.blocks)
    .filter((input) => input.type === 'Button')
    .map((input) => input.name);
  if (!buttons.includes(args.press))
    return `${args.press} is not a button input; buttons: ${buttons.join(', ') || 'none, add an Input of type button'}`;
  return [...events, { kind: 'button', name: args.press }];
}

/**
 * Runs the When Input Changes and When Button Pressed blocks of each event,
 * like the inspector: each may change inputs and show messages.
 *
 * @param document Script.
 * @param events Events in order.
 * @param typed Input values with the new ones.
 * @returns Final values, messages and handler mistakes.
 */
function geometryScriptHandle(
  document: SolidScriptDocument,
  events: readonly SolidScriptEvent[],
  typed: Readonly<Record<string, string>>,
): GeometryScriptHandled {
  const result: GeometryScriptHandled = { inputs: { ...typed }, notices: [], errors: [] };
  for (const event of events) {
    const handled = solidScriptProgramHandle(document, event, result.inputs);
    Object.assign(result.inputs, handled.inputs);
    for (const key of handled.removed) delete result.inputs[key];
    result.notices.push(...handled.notices);
    if (handled.error) result.errors.push(handled.error.message);
  }
  return result;
}

/**
 * Runs a script to count its solids and find its first error.
 *
 * @param document Script.
 * @param inputs Values of its Input lines.
 * @returns Solid count and error text, empty without an error.
 */
function geometryScriptRun(
  document: SolidScriptDocument,
  inputs: Readonly<Record<string, string>>,
): { solids: number; error: string } {
  try {
    return { solids: solidScriptProgramEvaluate(document, { inputs, context: 'assistant' }).steps.length, error: '' };
  } catch (thrown) {
    return { solids: 0, error: solidScriptErrorText(thrown) };
  }
}
