import type * as THREE from 'three';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptBlockCodeCreate,
  solidScriptBlockCommandCreate,
  solidScriptDocumentNormalize,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptBlockSource,
  solidScriptDocumentFromSource,
  solidScriptDocumentSource,
} from '@/solid_script/document/solid_script_document_source.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import type { EditorApiHost } from './editor_api_host.js';
import { modifierObjectFind } from './modifier/editor_api_modifier_lookup.js';
import { failResult, okResult } from './editor_api_result.js';

/** One line as the tools write it: code text, or a command with values. */
export interface GeometryScriptLineArgs {
  code?: string;
  command?: string;
  values?: Record<string, string>;
}

/** Arguments of geometry_script_generator_set. */
export interface GeometryScriptGeneratorSetArgs {
  objectId: string;
  source?: string;
  lines?: GeometryScriptLineArgs[];
  placement?: string;
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
   * Lists the commands of the script editor.
   *
   * @returns Commands with their values and an example line.
   */
  commandList(): McpToolResult {
    const commands = solidScriptCommands.map((command) => ({
      id: command.id,
      label: command.label,
      category: command.category,
      description: command.description,
      opensBlock: command.opensBlock,
      inPalette: command.inPalette,
      parameters: command.parameters.map(({ key, label, type, default: fallback, hint }) => ({
        key,
        label,
        type,
        default: fallback,
        hint,
      })),
      example: command.code(command.valuesDefault()),
    }));
    return okResult(`${commands.length} commands`, { commands });
  }

  /**
   * Reads a generator's script.
   *
   * @param objectId Generator node id.
   * @returns Lines, source, placement and the first error.
   */
  generatorGet(objectId: string): McpToolResult {
    const generator = this.generatorFind(objectId);
    if (typeof generator === 'string') return failResult(generator);
    const document = solidScriptDocumentNormalize(generator.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    return okResult(`${document.blocks.length} lines`, this.describe(generator, document));
  }

  /**
   * Replaces a generator's script and placement as one undo step.
   *
   * @param args Generator, new script as source or lines, and placement.
   * @returns The stored script.
   */
  generatorSet(args: GeometryScriptGeneratorSetArgs): McpToolResult {
    const generator = this.generatorFind(args.objectId);
    if (typeof generator === 'string') return failResult(generator);
    if (args.placement !== undefined && !GEOMETRY_SCRIPT_PLACEMENTS.includes(args.placement))
      return failResult(`placement must be one of ${GEOMETRY_SCRIPT_PLACEMENTS.join(', ')}`);
    const document = this.documentFrom(args, generator);
    if (typeof document === 'string') return failResult(document);
    const before = ModifierVolume.read(generator.node);
    const patch = {
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: document,
      ...(args.placement ? { placement: args.placement } : {}),
    };
    const after = modifierStackPatch(before, generator.stepId, { parameters: { ...generator.parameters, ...patch } });
    this.host.commandStack.push(new CommandModifierStackSet(generator.node, before, after));
    this.host.refreshAfterWorldMutation();
    this.host.showStatus(`Edited the script of ${generator.node.name}`);
    return this.generatorGet(args.objectId);
  }

  /**
   * Builds the new script from source or lines.
   *
   * @param args Set arguments.
   * @param generator Generator, for the current script.
   * @returns Script, or an error.
   */
  private documentFrom(
    args: GeometryScriptGeneratorSetArgs,
    generator: GeometryScriptGenerator,
  ): SolidScriptDocument | string {
    if (args.source !== undefined && args.lines !== undefined) return 'Give source or lines, not both';
    if (args.source !== undefined) return solidScriptDocumentFromSource(args.source);
    if (args.lines === undefined)
      return solidScriptDocumentNormalize(generator.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    const blocks: SolidScriptBlock[] = [];
    for (const [index, line] of args.lines.entries()) {
      const block = this.lineBlock(line);
      if (typeof block === 'string') return `Line ${index + 1}: ${block}`;
      blocks.push(block);
    }
    return solidScriptDocumentNormalize({ blocks });
  }

  /**
   * Turns one tool line into a script line.
   *
   * @param line Tool line.
   * @returns Script line, or an error.
   */
  private lineBlock(line: GeometryScriptLineArgs): SolidScriptBlock | string {
    if (line.command === undefined) return solidScriptBlockCodeCreate(line.code ?? '');
    const command = solidScriptCommandFind(line.command);
    if (!command) return `unknown command ${line.command}; see geometry_script_command_list`;
    const known = new Set(command.parameters.map((parameter) => parameter.key));
    const unknown = Object.keys(line.values ?? {}).filter((key) => !known.has(key));
    if (unknown.length > 0) return `${command.id} has no value ${unknown.join(', ')}`;
    return solidScriptBlockCommandCreate(
      command.id,
      Object.fromEntries(Object.entries(line.values ?? {}).map(([key, value]) => [key, String(value)])),
    );
  }

  /**
   * Describes a generator's script.
   *
   * @param generator Generator.
   * @param document Script.
   * @returns Tool data.
   */
  private describe(generator: GeometryScriptGenerator, document: SolidScriptDocument): Record<string, unknown> {
    const source = solidScriptDocumentSource(document);
    const { solids, error } = geometryScriptRun(source);
    const lines = document.blocks.map((block, index) => ({
      line: index + 1,
      code: solidScriptBlockSource(block),
      ...(block.type === 'command' ? { command: block.command, values: block.values } : {}),
    }));
    return {
      objectId: generator.node.uuid,
      placement: generator.parameters['placement'],
      source,
      lines,
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
 * Runs a script to count its solids and find its first error.
 *
 * @param source Script source.
 * @returns Solid count and error text, empty without an error.
 */
function geometryScriptRun(source: string): { solids: number; error: string } {
  try {
    return { solids: solidScriptProgramEvaluate(source).steps.length, error: '' };
  } catch (thrown) {
    return { solids: 0, error: solidScriptErrorText(thrown) };
  }
}
