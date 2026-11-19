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
import { SOLID_SCRIPT_PART_DEPTH_MAX, solidScriptLimitCount } from './solid_script_limits.js';
import { SolidScriptMachineWrites } from './solid_script_machine_writes.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptGeometryLeaves, type SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { SolidScriptToolCopy } from './solid_script_tool_copy.js';
import { solidScriptKindOf } from './solid_script_kinds.js';
import { type SolidScriptGroupMode } from './solid_script_mode.js';
import { solidScriptShapeTransform } from './solid_script_reshape.js';
import { solidScriptShapeClone } from './solid_script_shape_clone.js';
import {
  solidScriptShapeGrouped,
  solidScriptShapeJoin,
  solidScriptShapeMapLeaves,
  type SolidScriptShape,
  type SolidScriptShapeGroup,
} from './solid_script_shape.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';
import * as THREE from 'three';

/** Command ids of the blocks that run when an inspector event happens. */
export const SOLID_SCRIPT_HANDLERS = {
  input: 'when_input_changes',
  button: 'when_button_pressed',
  bake: 'when_baked',
} as const;

/**
 * Blocks that only define something: the script skips from them to their End,
 * and their lines run only when they are called or their event happens.
 */
export const SOLID_SCRIPT_DEFINITIONS: ReadonlySet<string> = new Set([
  'function',
  SOLID_SCRIPT_HANDLERS.input,
  SOLID_SCRIPT_HANDLERS.button,
  SOLID_SCRIPT_HANDLERS.bake,
]);

/** Most parts that may be in use inside each other at once. */
export { SOLID_SCRIPT_PART_DEPTH_MAX } from './solid_script_limits.js';

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
  /** CSG groups built by each Part, by name key, so Output can stamp Mode. */
  protected readonly partsHeld = new Map<string, SolidScriptShapeGroup>();
  protected readonly toolCopy = new SolidScriptToolCopy();
  /** Part group each stored brush belongs to. */
  protected readonly partsByBrush = new Map<number, SolidScriptShapeGroup>();
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
    if (solidScriptBuiltinFind(name)) throw new Error(`${name}() is a built-in function; pick another name`);
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
        `this line ran functions or parts more than ${solidScriptLimitCount(SOLID_SCRIPT_PART_DEPTH_MAX)} levels deep. A function or part that uses itself needs an If that stops it.`,
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
   * Wraps built shapes in a CSG group with Mode, or warns when the block is
   * empty.
   *
   * @param built Shapes inside the group.
   * @param label Name of the group.
   * @param mode How the group combines with the shapes before it.
   * @param node Group line.
   * @returns The group, or nothing when empty.
   */
  protected grouped(
    built: readonly SolidScriptShape[],
    label: string,
    mode: SolidScriptGroupMode,
    node: SolidScriptBlockNode<Command>,
  ): SolidScriptShape[] {
    if (built.length === 0) {
      this.emptyWarn(node);
      return [];
    }
    const group = solidScriptShapeGrouped(built, label, mode);
    return group ? [group] : [];
  }

  /**
   * Builds a Part into a variable of the same name, as a CSG group, and outputs
   * nothing. Return inside the part stops only the part.
   *
   * @param node Define Part line.
   * @param name Part name, which is also the variable.
   * @param mode How the stored group combines when it is placed.
   * @param scope Scope of the Part line.
   * @param build Runs the part's lines in a scope named after the part.
   * @returns Nothing; the part is stored in the variable.
   */
  protected partKeep(
    node: SolidScriptBlockNode<Command>,
    name: string,
    mode: SolidScriptGroupMode,
    scope: SolidScriptScope,
    build: (inner: SolidScriptScope) => SolidScriptShape[],
  ): SolidScriptShape[] {
    if (this.stack.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `this line ran functions or parts more than ${solidScriptLimitCount(SOLID_SCRIPT_PART_DEPTH_MAX)} levels deep. A function or part that uses itself needs an If that stops it.`,
      );
    this.stack.push({ kind: 'part', name, line: this.line, locals: null, returned: null });
    try {
      const inner = new SolidScriptScope(scope, name);
      const built = node.children.length === 0 ? [] : build(inner);
      this.leaving = false;
      if (built.length === 0) this.emptyWarn(node);
      const group = solidScriptShapeGrouped(built, name, mode);
      const brushes = solidScriptGeometryLeaves(group ? [group] : []).map((leaf) => this.elements.brush(leaf));
      if (group) {
        this.partsHeld.set(this.nameKey(name), group);
        for (const brush of brushes) this.partsByBrush.set(brush.id, group);
      }
      this.variableSet(scope, name, brushes);
      return [];
    } finally {
      this.stack.pop();
    }
  }

  /**
   * Stamps a snapshot of a Part or of brushes at this line, including the
   * Part's CSG group and Mode. Later changes to the Part do not reach this
   * copy.
   *
   * @param value Part name, or the brushes or meshes to stamp.
   * @param scope Scope of the Output line.
   * @param context Matrix and flatness.
   * @returns The stamped shapes.
   */
  protected outputStamp(
    value: SolidScriptValue,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const source = this.outputSource(value, scope);
    const group = this.outputGroupOf(source);
    const shapes = group ? [group] : this.outputLeavesOf(source);
    if (shapes.length === 0) throw new Error('Output has nothing to stamp; give a part or brushes such as [Wall]');
    return shapes.map((shape) =>
      solidScriptShapeTransform(
        solidScriptShapeClone(
          solidScriptShapeMapLeaves(shape, (leaf) => (leaf.kind === 'polygon' ? leaf : this.leafLatestOf(leaf))),
        ),
        context.matrix,
      ),
    );
  }

  /**
   * Resolves an Output value: a name looks up the variable, or the stored Part.
   *
   * @param value Field value.
   * @param scope Scope of the Output line.
   * @returns Value to stamp.
   */
  protected outputSource(value: SolidScriptValue, scope: SolidScriptScope): SolidScriptValue {
    if (typeof value !== 'string') return value;
    const name = value
      .trim()
      .replace(/^\[(.*)\]$/s, '$1')
      .trim();
    if (name === '') throw new Error('Output needs a part or brushes, such as [Wall]');
    const key = this.nameKey(name);
    if (scope.variableHas(key)) return scope.variableGet(key);
    const held = this.partsHeld.get(key);
    if (held) return name;
    const known = [...this.partsHeld.keys()].map(this.nameShown).sort();
    throw new Error(
      `no part or brushes are named "${name}". ${known.length > 0 ? `Parts: ${known.join(', ')}` : 'Define one with Define Part'}`,
    );
  }

  /**
   * Finds the Part group a value should stamp, when it is the whole part.
   *
   * @param value Resolved Output value.
   * @returns Group, or undefined when the value is not a whole Part.
   */
  protected outputGroupOf(value: SolidScriptValue): SolidScriptShapeGroup | undefined {
    if (typeof value === 'string')
      return this.partsHeld.get(
        this.nameKey(
          value
            .trim()
            .replace(/^\[(.*)\]$/s, '$1')
            .trim(),
        ),
      );
    const brushes = this.outputBrushes(value);
    const first = brushes?.[0];
    if (!brushes || first === undefined) return undefined;
    const group = this.partsByBrush.get(first.id);
    if (!group) return undefined;
    const ids = new Set(brushes.map((brush) => brush.id));
    const leaves = solidScriptGeometryLeaves([group]);
    if (leaves.length !== ids.size) return undefined;
    if (!leaves.every((leaf) => ids.has(this.elements.brush(leaf).id))) return undefined;
    return group;
  }

  /**
   * Reads a value as the brushes or meshes to stamp.
   *
   * @param value Resolved Output value.
   * @returns Elements, or undefined when the value is another kind.
   */
  protected outputBrushes(value: SolidScriptValue): SolidScriptElement[] | undefined {
    const list = Array.isArray(value) ? value : [value];
    const brushes: SolidScriptElement[] = [];
    for (const entry of list) {
      if (!(entry instanceof SolidScriptElement) || entry.kind !== 'brush') return undefined;
      brushes.push(entry);
    }
    return brushes;
  }

  /**
   * Turns brush or mesh elements into their latest shapes.
   *
   * @param value Resolved Output value.
   * @returns Leaves.
   */
  protected outputLeavesOf(value: SolidScriptValue): SolidScriptShape[] {
    const brushes = this.outputBrushes(value);
    if (!brushes) {
      const kind = solidScriptKindOf(value);
      throw new Error(`Output needs a part, a brush or a mesh, not a ${kind}`);
    }
    return brushes.map((brush) => this.elements.leaf(brush));
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

  /** Starts a copy session so an Into tool leaves the original alone. */
  protected toolCopyStart(): void {
    this.toolCopy.start();
  }

  /** Ends a copy session. */
  protected toolCopyEnd(): void {
    this.toolCopy.end();
  }

  /** Edited copies the current Into session has written. */
  protected toolCopyResults(): SolidScriptGeometryLeaf[] {
    return this.toolCopy.results();
  }

  /**
   * Adds new shapes to the Part group of a memory target, and to that Part's
   * variable, so Output still stamps the whole group.
   *
   * @param leaves Targets the tool worked on.
   * @param shapes New shapes to keep with them.
   */
  protected partAdopt(leaves: readonly SolidScriptGeometryLeaf[], shapes: readonly SolidScriptShape[]): boolean {
    const first = leaves[0];
    if (!first || shapes.length === 0) return false;
    const group = this.partsByBrush.get(this.elements.brush(first).id);
    if (!group) return false;
    group.children.push(...shapes);
    for (const leaf of solidScriptGeometryLeaves(shapes)) this.partsByBrush.set(this.elements.brush(leaf).id, group);
    this.partLeavesWrite(group);
    return true;
  }

  /**
   * Replaces a leaf inside every stored Part group.
   *
   * @param leaf Leaf to replace.
   * @param by Replacement.
   */
  protected partLeavesRewrite(leaf: SolidScriptGeometryLeaf, by: SolidScriptGeometryLeaf): void {
    for (const [key, group] of this.partsHeld) {
      const next = solidScriptShapeMapLeaves(group, (entry) => (entry === leaf ? by : entry));
      if (next !== group && next.kind === 'group') this.partsHeld.set(key, next);
    }
  }

  /**
   * Writes a stored Part group back to its variable, including later additions.
   *
   * @param group Stored group.
   */
  private partLeavesWrite(group: SolidScriptShapeGroup): void {
    const name = [...this.partsHeld.entries()].find(([, held]) => held === group)?.[0];
    if (!name) return;
    const brushes = solidScriptGeometryLeaves([group]).map((leaf) => this.elements.brush(leaf));
    this.variableSet(this.root, this.nameShown(name), brushes);
  }
}
