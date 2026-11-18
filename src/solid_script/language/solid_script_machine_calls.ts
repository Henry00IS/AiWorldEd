import type { SolidScriptBlockNode } from './solid_script_block_tree.js';
import { solidScriptBuiltinFind } from './solid_script_expression_compile.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import type {
  SolidScriptBreak,
  SolidScriptContext,
  SolidScriptFailure,
  SolidScriptFrame,
  SolidScriptMachineCommand,
} from './solid_script_machine_types.js';
import { SOLID_SCRIPT_NAME } from './solid_script_machine_variables.js';
import { SolidScriptMachineWrites } from './solid_script_machine_writes.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptShapeJoin, type SolidScriptShape } from './solid_script_shape.js';
import type { SolidScriptValue } from './solid_script_value.js';
import * as THREE from 'three';

/** Command ids of the blocks that run when an inspector event happens. */
export const SOLID_SCRIPT_HANDLERS = {
  input: 'when_input_changes',
  button: 'when_button_pressed',
  bake: 'when_baked',
} as const;

/**
 * Blocks that only define something: the script skips from them to their End,
 * and their lines run only when they are used, called or their event happens.
 */
export const SOLID_SCRIPT_DEFINITIONS: ReadonlySet<string> = new Set([
  'part',
  'function',
  SOLID_SCRIPT_HANDLERS.input,
  SOLID_SCRIPT_HANDLERS.button,
  SOLID_SCRIPT_HANDLERS.bake,
]);

/** Most parts that may be in use inside each other at once. */
export const SOLID_SCRIPT_PART_DEPTH_MAX = 64;

/**
 * Reads the input names of a Define Function line, such as "width, depth".
 *
 * @param text Field text.
 * @returns Names in order.
 */
export function solidScriptFunctionParameters(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** A Define Part block and the scope it was defined in. */
export interface SolidScriptPart<Command extends SolidScriptMachineCommand> {
  node: SolidScriptBlockNode<Command>;
}

/**
 * Matrix and flatness of a Function run inside a formula; shared, since such a
 * run builds no shapes and every block copies a matrix before changing it.
 */
export const SOLID_SCRIPT_FORMULA_CONTEXT: SolidScriptContext = { matrix: new THREE.Matrix4(), planar: false };

/** Thrown through a formula when a Function inside it reached the pause. */
class SolidScriptPause extends Error {}

/**
 * What a script machine knows about the blocks that define something: parts,
 * Functions and event handlers, and how a Function or part runs when it is
 * used. The machine that runs lines builds on it.
 */
export abstract class SolidScriptMachineCalls<
  Command extends SolidScriptMachineCommand,
> extends SolidScriptMachineWrites {
  protected readonly steps: number[] = [];
  /** Warnings of the run by 1-based line, such as a block with nothing inside. */
  protected readonly warnings = new Map<number, string>();

  /**
   * Uses 1, or 1, 1, 1 for a size, for a Box value outside a generator, and
   * warns on the line, so the script still runs.
   *
   * @param name Value name as taught, such as Box.Width.
   * @returns Stand-in value.
   */
  protected systemMissing(name: string): SolidScriptValue {
    this.warnings.set(this.line, `[$${name}] is only known in a generator, where there is a box; 1 is used here.`);
    return /\.Size$/i.test(name) ? [1, 1, 1] : 1;
  }
  protected readonly parts = new Map<string, SolidScriptPart<Command>>();
  /** Function blocks by name. */
  protected readonly functions = new Map<string, SolidScriptBlockNode<Command>>();
  /** Input names of each Function block. */
  protected readonly functionParameters = new Map<SolidScriptBlockNode<Command>, readonly string[]>();
  /** When Input Changes and When Button Pressed blocks, in line order. */
  protected readonly handlers: SolidScriptBlockNode<Command>[] = [];
  protected line = 0;
  /** Shapes built by each running block so far, innermost last. */
  protected readonly builtStack: SolidScriptShape[][] = [];
  /**
   * Line lists whose definitions are registered, so a Function called often
   * registers once.
   */
  protected readonly registered = new WeakSet<readonly SolidScriptBlockNode<Command>[]>();
  /** True from a Return line until the part it leaves has stopped. */
  protected leaving = false;
  protected failure: SolidScriptFailure | null = null;
  protected paused: SolidScriptBreak | null = null;

  /**
   * Runs lines one after the other in a new scope.
   *
   * @param lines Lines.
   * @param parent Enclosing scope.
   * @param context Matrix and flatness.
   * @param scope Scope to run in; a new child of the parent by default.
   * @returns Shapes in line order.
   */
  protected abstract linesRun(
    lines: readonly SolidScriptBlockNode<Command>[],
    parent: SolidScriptScope,
    context: SolidScriptContext,
    scope?: SolidScriptScope,
  ): SolidScriptShape[];

  /**
   * Runs one step at a line unless the run already stopped.
   *
   * @param line Line number.
   * @param step Step to run.
   * @returns Its result, or undefined when the run stopped.
   */
  protected abstract guarded<T>(line: number, step: () => T): T | undefined;

  /**
   * Registers the parts, functions and event handler blocks among lines, so
   * they are known before the lines run.
   *
   * @param lines Lines.
   */
  protected definitionsRegister(lines: readonly SolidScriptBlockNode<Command>[]): void {
    if (this.registered.has(lines)) return;
    this.registered.add(lines);
    for (const node of lines) {
      if (node.command.id === 'part') this.guarded(node.line, () => this.partDefine(node));
      if (node.command.id === 'function') this.guarded(node.line, () => this.functionDefine(node));
      if (Object.values(SOLID_SCRIPT_HANDLERS).includes(node.command.id as never) && !this.handlers.includes(node))
        this.handlers.push(node);
    }
  }

  /**
   * Registers a Define Function line under its name.
   *
   * @param node Define Function line.
   */
  protected functionDefine(node: SolidScriptBlockNode<Command>): void {
    const name = node.command.valueText(node.values, 'name');
    this.nameCheck(name, 'a function');
    if (solidScriptBuiltinFind(name) || this.nameKey(name) === 'pi')
      throw new Error(`${name}() is a built-in function; pick another name`);
    const known = this.functions.get(this.nameKey(name));
    if (known && known !== node) throw new Error(`a function named "${name}" is already defined on line ${known.line}`);
    for (const parameter of solidScriptFunctionParameters(node.command.valueText(node.values, 'parameters')))
      this.nameCheck(parameter, 'a function input');
    this.functions.set(this.nameKey(name), node);
  }

  /**
   * Runs a Function block in a new frame: its inputs become its own variables,
   * written [local.name], and its lines run with plain names meaning the
   * script's variables. Its shapes are built where it is called.
   *
   * @param name Function name.
   * @param values Values passed, one per input.
   * @param context Matrix and flatness of the call.
   * @returns Shapes and the returned value, or null when no such function is
   *   defined.
   */
  protected functionRun(
    name: string,
    values: readonly SolidScriptValue[],
    context: SolidScriptContext,
  ): { shapes: SolidScriptShape[]; value: SolidScriptValue } | null {
    const node = this.functions.get(solidScriptNameKey(name));
    if (!node) return null;
    let parameters = this.functionParameters.get(node);
    if (!parameters) {
      parameters = solidScriptFunctionParameters(node.command.valueText(node.values, 'parameters')).map((parameter) =>
        this.nameKey(parameter),
      );
      this.functionParameters.set(node, parameters);
    }
    if (values.length !== parameters.length)
      throw new Error(
        `${this.nameShown(solidScriptNameKey(name))}() takes ${parameters.length} value(s) (${parameters.map(this.nameShown).join(', ') || 'none'}), not ${values.length}`,
      );
    if (this.stack.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `functions and parts run inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep. A function that calls itself needs an If that stops it`,
      );
    const locals = new SolidScriptScope(null);
    for (let index = 0; index < parameters.length; index++) locals.variableDefine(parameters[index]!, values[index]);
    const frame: SolidScriptFrame = { kind: 'function', name, line: this.line, locals, returned: null };
    this.stack.push(frame);
    try {
      const scope = new SolidScriptScope(this.root, name);
      const shapes = node.children.length > 0 ? this.linesRun(node.children, scope, context, scope) : [];
      this.leaving = false;
      return { shapes, value: frame.returned?.value };
    } finally {
      this.stack.pop();
    }
  }

  /**
   * Works out a Function used in a formula, such as area(2, 3). It may not
   * build shapes there; a Call line builds them.
   *
   * @param name Function name.
   * @param values Values passed.
   * @returns Result, or null when no such function is defined.
   */
  protected functionCall(name: string, values: readonly SolidScriptValue[]): { value: SolidScriptValue } | null {
    const before = this.steps.length;
    const run = this.functionRun(name, values, SOLID_SCRIPT_FORMULA_CONTEXT);
    if (!run) return null;
    if (this.paused) throw new SolidScriptPause();
    if (this.failure) throw new Error(this.failure.message);
    if (this.steps.length > before)
      throw new Error(
        `${this.nameShown(name)}() builds brushes or meshes, so use it with a Call line, not inside a formula`,
      );
    if (run.value === undefined)
      throw new Error(`${this.nameShown(name)}() gives no value; end it with a Return that has a Value`);
    return { value: run.value };
  }

  /**
   * Runs a Function from a Call line and stores what it returns.
   *
   * @param name Function name.
   * @param values Values passed.
   * @param result Variable to store the returned value in, or null.
   * @param scope Scope of the Call line.
   * @param context Matrix and flatness of the Call line.
   * @returns Shapes the Function built, as one shape named after it.
   */
  protected functionCallLine(
    name: string,
    values: readonly SolidScriptValue[],
    result: string | null,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const run = this.functionRun(name, values, context);
    if (!run) {
      const known = [...this.functions.keys()].map(this.nameShown).sort();
      throw new Error(
        `no Function is named "${name}". ${known.length > 0 ? `Functions: ${known.join(', ')}` : 'Add one with a Function block'}`,
      );
    }
    if (this.failure || this.paused) return run.shapes;
    if (result !== null) {
      if (run.value === undefined)
        throw new Error(`${name}() gives no value to store in ${result}; end it with a Return that has a Value`);
      this.variableSet(scope, result, run.value);
    }
    const joined = solidScriptShapeJoin(run.shapes, name);
    return joined ? [joined] : [];
  }

  /**
   * Registers a part under its name.
   *
   * @param node Define Part line.
   */
  protected partDefine(node: SolidScriptBlockNode<Command>): void {
    const name = node.command.valueText(node.values, 'name');
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot name a part; use letters, digits and _, not starting with a digit`);
    const known = this.parts.get(this.nameKey(name));
    if (known && known.node !== node)
      throw new Error(`a part named "${name}" is already defined on line ${known.node.line}`);
    this.parts.set(this.nameKey(name), { node });
  }

  /**
   * Builds the lines of a part where Use Part asks for it.
   *
   * @param name Part name.
   * @param scope Calling scope.
   * @param context Matrix and flatness.
   * @returns The part as one shape.
   */
  protected partUse(name: string, scope: SolidScriptScope, context: SolidScriptContext): SolidScriptShape[] {
    const part = this.parts.get(this.nameKey(name));
    if (!part) {
      const known = [...this.parts.keys()].map(this.nameShown).sort();
      throw new Error(
        `no part is named "${name}". ${known.length > 0 ? `Parts: ${known.join(', ')}` : 'Define one with Define Part'}`,
      );
    }
    if (this.stack.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `functions and parts run inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep. A part that uses itself needs an If that stops it`,
      );
    if (part.node.children.length === 0) {
      this.emptyWarn(part.node);
      return [];
    }
    this.stack.push({ kind: 'part', name, line: this.line, locals: null, returned: null });
    try {
      const inner = new SolidScriptScope(scope, name);
      const built = this.linesRun(part.node.children, inner, context, inner);
      this.leaving = false;
      const joined = solidScriptShapeJoin(built, name);
      return joined ? [joined] : [];
    } finally {
      this.stack.pop();
    }
  }

  /**
   * Notes that a block has nothing inside: it runs as nothing, which is no
   * mistake but likely unfinished.
   *
   * @param node Block line.
   */
  protected emptyWarn(node: SolidScriptBlockNode<Command>): void {
    this.warnings.set(node.line, `${node.command.label} has nothing inside, so it does nothing.`);
  }
}
