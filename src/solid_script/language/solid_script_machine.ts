import * as THREE from 'three';
import type { SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptBlockNode, SolidScriptTreeCommand } from './solid_script_block_tree.js';
import { solidScriptErrorLine, solidScriptErrorText } from './solid_script_error.js';
import { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { solidScriptExpressionParse } from './solid_script_expression_parse.js';
import {
  solidScriptFieldResolve,
  type SolidScriptFieldContext,
  type SolidScriptFieldKind,
} from './solid_script_field.js';
import { solidScriptExtrude } from './solid_script_extrude.js';
import { solidScriptPolygonHull, type SolidScriptPoint2 } from './solid_script_polygon.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRead,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { solidScriptShapeTransform } from './solid_script_reshape.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptShapeJoin, solidScriptShapeLeavesPositive, type SolidScriptShape } from './solid_script_shape.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/** Most solids one run may produce. */
const SOLID_SCRIPT_SOLIDS_MAX = 2000;

/** Most parts that may be in use inside each other at once. */
export const SOLID_SCRIPT_PART_DEPTH_MAX = 64;

/**
 * Most steps of work one run may take: lines, loop rounds and function calls.
 * Counting work instead of time keeps the result the same on every machine of a
 * room while no script can freeze the editor.
 */
export const SOLID_SCRIPT_WORK_LIMIT = 1000000;

/** Field types whose stored text is used as typed instead of evaluated. */
const SOLID_SCRIPT_TEXT_FIELDS: ReadonlySet<string> = new Set(['name', 'target', 'text']);

/** Pattern of a variable or part name. */
const SOLID_SCRIPT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One field of a command, as the machine reads it. */
export interface SolidScriptMachineField {
  key: string;
  label: string;
  type: SolidScriptFieldKind;
}

/** What the machine needs from a command: its structure and its own run step. */
export interface SolidScriptMachineCommand extends SolidScriptTreeCommand {
  /** Stable id; also names the brushes it builds outside a part. */
  readonly id: string;
  /** Fields of the line. */
  readonly parameters: readonly SolidScriptMachineField[];
  /**
   * Returns the stored text of a field, or its default when empty.
   *
   * @param values Stored values.
   * @param key Field key.
   */
  valueText(values: Readonly<Record<string, string>>, key: string): string;
  /**
   * Runs the line.
   *
   * @param run What the line can do to the machine.
   * @returns Shapes the line builds.
   */
  execute(run: SolidScriptBlockRun): SolidScriptShape[];
}

/** What a running line can read and do. */
export interface SolidScriptBlockRun {
  /** True inside Linear Extrude, where only flat shapes may be drawn. */
  readonly planar: boolean;
  /** Every evaluated field of the line, read strictly. */
  fields(): SolidScriptBlockArguments;
  /** The stored text of a field, such as a name. */
  text(key: string): string;
  /** Evaluates one field. */
  value(key: string): SolidScriptValue;
  /** Sets a variable, where it already exists or else in the current block. */
  variableSet(name: string, value: SolidScriptValue): void;
  /** Builds one convex solid from its corner points. */
  solid(points: THREE.Vector3[]): SolidScriptShape[];
  /** Draws one flat outline for Linear Extrude. */
  outline(points: SolidScriptPoint2[]): SolidScriptShape[];
  /** Runs the lines inside, moved by a matrix. */
  transformed(matrix: THREE.Matrix4): SolidScriptShape[];
  /** Runs the lines inside and combines their results. */
  combined(operation: 'union' | 'difference' | 'intersection'): SolidScriptShape[];
  /** Runs the lines inside and wraps their results in one convex shape. */
  hulled(): SolidScriptShape[];
  /** Runs the flat lines inside and pulls them up into solids. */
  extruded(fields: SolidScriptBlockArguments): SolidScriptShape[];
  /** Runs the lines inside once per value, with the counter set to it. */
  repeated(counter: string, values: readonly SolidScriptValue[]): SolidScriptShape[];
  /** Runs the lines inside, or the lines after Else, depending on a condition. */
  branched(holds: boolean): SolidScriptShape[];
  /** Builds the lines of a part defined in the script. */
  partUse(name: string): SolidScriptShape[];
  /**
   * Runs the lines inside and returns the points their Point lines add, moved
   * by the blocks between.
   */
  pointsGathered(): THREE.Vector3[];
  /** Adds a point to the Polyhedron or Polygon around this line. */
  point(position: THREE.Vector3): SolidScriptShape[];
  /**
   * Runs the lines inside in the block's own frame, flat or solid, and returns
   * their shapes unplaced.
   */
  local(planar: boolean): SolidScriptShape[];
  /**
   * Places shapes built in the block's own frame where the blocks around it put
   * them.
   */
  placed(shapes: readonly SolidScriptShape[]): SolidScriptShape[];
  /** Leaves the part being built; the lines after its Use Part carry on. */
  leave(): SolidScriptShape[];
  /** Writes a line to the output. */
  print(text: string): SolidScriptShape[];
}

/** Result of a run. */
export interface SolidScriptEvaluation {
  shapes: SolidScriptShape[];
  messages: string[];
  /** Line of every shape in run order, built or not. */
  steps: number[];
  /**
   * Variables visible at the last built step, or where the run paused, with
   * their values as text.
   */
  variables: SolidScriptVariable[];
  /**
   * Every time the run reached a breakpoint line, in run order, up to where it
   * paused.
   */
  breaks: SolidScriptBreak[];
  /** Where the run paused, or null when it did not. */
  paused: SolidScriptBreak | null;
}

/** One time a run reached a breakpoint line, before that line ran. */
export interface SolidScriptBreak {
  /** 1-based line. */
  line: number;
  /** Shape steps made before it. */
  steps: number;
}

/** Breakpoints of a run. */
export interface SolidScriptBreakpoints {
  /** 1-based lines that have a breakpoint. */
  lines: ReadonlySet<number>;
  /**
   * Pause at this hit of any breakpoint, counting from 1; 0 or less to only
   * record the hits.
   */
  pauseAt: number;
}

/** The mistake a run stopped at. */
export interface SolidScriptFailure {
  /** 1-based line, or null when the problem has no single line. */
  line: number | null;
  /** Message as thrown, starting with "line N:" when it has a line. */
  message: string;
  /** Message for people: capitalised and ending with a full stop. */
  text: string;
}

/** Result of a run: everything built before the first mistake, and the mistake. */
export interface SolidScriptRun extends SolidScriptEvaluation {
  /** The mistake the run stopped at, or null when it ran to the end. */
  error: SolidScriptFailure | null;
}

/** A value defined before the first line, such as an inspector input. */
export interface SolidScriptPreset {
  name: string;
  /** Value as typed, such as "2" or "[1, 2, 3]". */
  code: string;
  /** What defines it, for messages, such as "Input". */
  origin: string;
  /** True when lines may only read it. */
  readOnly: boolean;
}

/** One variable and its value as the debugger shows it. */
export interface SolidScriptVariable {
  name: string;
  value: string;
}

/**
 * Where lines run: the matrix of the blocks around them, and whether they are
 * flat.
 */
interface SolidScriptContext {
  matrix: THREE.Matrix4;
  planar: boolean;
}

/** A Define Part block and the scope it was defined in. */
interface SolidScriptPart<Command extends SolidScriptMachineCommand> {
  node: SolidScriptBlockNode<Command>;
}

/**
 * Runs the lines of a script directly, one block after the other. A machine
 * runs one script once: every run makes a new machine, so no variable, counter,
 * part or mistake carries over to the next run or another generator.
 */
export class SolidScriptMachine<Command extends SolidScriptMachineCommand> {
  private readonly expressions = new SolidScriptExpressionEvaluator(() => this.workTake());
  private readonly messages: string[] = [];
  private readonly steps: number[] = [];
  private readonly readOnly = new Map<string, string>();
  private readonly parts = new Map<string, SolidScriptPart<Command>>();
  private readonly partsActive: string[] = [];
  private solids = 0;
  private line = 0;
  private work = 0;
  private used = false;
  private readonly breaks: SolidScriptBreak[] = [];
  /**
   * Points being gathered by the Polyhedron or Polygon blocks around the
   * running line, innermost last.
   */
  private readonly gathering: THREE.Vector3[][] = [];
  /** True from a Return line until the part it leaves has stopped. */
  private leaving = false;
  private watched: SolidScriptScope | null = null;
  private failure: SolidScriptFailure | null = null;
  private paused: SolidScriptBreak | null = null;

  /**
   * Creates a machine.
   *
   * @param stepLimit Shapes to build; later shapes are only counted.
   * @param breakpoints Lines to record or pause at, or null.
   */
  constructor(
    private readonly stepLimit = Number.POSITIVE_INFINITY,
    private readonly breakpoints: SolidScriptBreakpoints | null = null,
  ) {}

  /**
   * Runs a script once.
   *
   * @param lines Top-level lines.
   * @param presets Values defined before the first line.
   * @returns Shapes, output, steps and the first mistake.
   */
  run(lines: SolidScriptBlockNode<Command>[], presets: readonly SolidScriptPreset[] = []): SolidScriptRun {
    if (this.used) throw new Error('a script machine runs once; make a new one for every run');
    this.used = true;
    const root = new SolidScriptScope(null);
    for (const preset of presets) this.presetApply(preset, root);
    const shapes = this.failure ? [] : this.linesRun(lines, root, { matrix: new THREE.Matrix4(), planar: false });
    const variables = [...(this.watched?.variablesVisible() ?? [])].map(([name, value]) => ({
      name,
      value: solidScriptValueText(value),
    }));
    if (!this.failure && !this.paused && this.steps.length === 0)
      this.failure = solidScriptFailure(null, 'the script builds no shapes; add a shape such as Cube');
    return {
      shapes,
      messages: this.messages,
      steps: this.steps,
      variables,
      breaks: this.breaks,
      paused: this.paused,
      error: this.failure,
    };
  }

  /**
   * Defines a preset in the root scope; a mistake in its value stops the run
   * before the first line.
   *
   * @param preset Preset.
   * @param root Root scope.
   */
  private presetApply(preset: SolidScriptPreset, root: SolidScriptScope): void {
    if (this.failure) return;
    try {
      root.variableDefine(preset.name, solidScriptFieldResolve('value', preset.code, this.fieldContext(root)));
      if (preset.readOnly) this.readOnly.set(preset.name, preset.origin.toLowerCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure = solidScriptFailure(null, `${preset.origin} "${preset.name}": ${message}`);
    }
  }

  /**
   * Runs lines one after the other in a new scope. Parts defined among them are
   * known to all of them, so Use Part may come before Define Part.
   *
   * @param lines Lines.
   * @param parent Enclosing scope.
   * @param context Matrix and flatness.
   * @param scope Scope to run in; a new child of the parent by default.
   * @returns Shapes in line order.
   */
  private linesRun(
    lines: readonly SolidScriptBlockNode<Command>[],
    parent: SolidScriptScope,
    context: SolidScriptContext,
    scope = new SolidScriptScope(parent),
  ): SolidScriptShape[] {
    for (const node of lines) if (node.command.id === 'part') this.guarded(node.line, () => this.partDefine(node));
    return lines.flatMap((node) => this.lineRun(node, scope, context));
  }

  /**
   * Registers a part under its name.
   *
   * @param node Define Part line.
   */
  private partDefine(node: SolidScriptBlockNode<Command>): void {
    const name = node.command.valueText(node.values, 'name');
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot name a part; use letters, digits and _, not starting with a digit`);
    const known = this.parts.get(name);
    if (known && known.node !== node)
      throw new Error(`a part named "${name}" is already defined on line ${known.node.line}`);
    this.parts.set(name, { node });
  }

  /**
   * Runs one line unless the run already stopped.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @returns Shapes.
   */
  private lineRun(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    if (node.command.id === 'part' || this.breakReached(node.line, scope)) return [];
    return this.guarded(node.line, () => node.command.execute(this.runOf(node, scope, context))) ?? [];
  }

  /**
   * Records a breakpoint line about to run, and pauses the run when it is the
   * hit to pause at: nothing after it runs, and the variables are the ones the
   * line would see.
   *
   * @param line Line about to run.
   * @param scope Scope it runs in.
   * @returns True when the run paused here.
   */
  private breakReached(line: number, scope: SolidScriptScope): boolean {
    if (!this.breakpoints?.lines.has(line) || this.failure || this.paused) return false;
    const reached = { line, steps: this.steps.length };
    this.breaks.push(reached);
    if (this.breaks.length !== this.breakpoints.pauseAt) return false;
    this.paused = reached;
    this.watched = scope;
    return true;
  }

  /**
   * Runs one step at a line unless the run already stopped; a mistake stops the
   * run there, keeping everything built before it.
   *
   * @param line Line number.
   * @param step Step to run.
   * @returns Its result, or undefined when the run stopped.
   */
  private guarded<T>(line: number, step: () => T): T | undefined {
    if (this.failure || this.paused || this.leaving) return undefined;
    const outer = this.line;
    this.line = line;
    try {
      this.workTake();
      return step();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure ??= solidScriptFailure(solidScriptErrorLine(message) ?? line, message);
      return undefined;
    } finally {
      this.line = outer;
    }
  }

  /**
   * Builds what a running line can read and do.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @returns Run view of the line.
   */
  private runOf(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptBlockRun {
    const label = scope.partName || node.command.id;
    const inside = (into: SolidScriptContext, lines = node.children): SolidScriptShape[] => {
      if (lines.length === 0) throw new Error(`${node.command.label} has nothing inside; add a shape before its End`);
      return this.linesRun(lines, scope, into);
    };
    const value = (key: string): SolidScriptValue => this.fieldValue(node, key, scope);
    return {
      planar: context.planar,
      fields: () => {
        const values = new Map<string, SolidScriptValue>();
        const labels = new Map<string, string>();
        for (const field of node.command.parameters) {
          labels.set(field.key, field.label);
          if (!SOLID_SCRIPT_TEXT_FIELDS.has(field.type)) values.set(field.key, value(field.key));
        }
        return new SolidScriptBlockArguments(values, labels);
      },
      text: (key) => node.command.valueText(node.values, key),
      value,
      variableSet: (name, assigned) => this.variableSet(scope, name, assigned),
      solid: (points) => {
        this.gatherCheck(node);
        this.flatCheck(node, context, false);
        if (!this.stepTake(scope)) return [];
        return [{ kind: 'solid', label, points: points.map((point) => point.applyMatrix4(context.matrix)) }];
      },
      outline: (points) => {
        this.gatherCheck(node);
        this.flatCheck(node, context, true);
        if (!this.stepTake(scope)) return [];
        const moved = points.map(([x, y]): SolidScriptPoint2 => {
          const point = new THREE.Vector3(x, y, 0).applyMatrix4(context.matrix);
          return [point.x, point.y];
        });
        return [{ kind: 'polygon', label, points: moved }];
      },
      transformed: (matrix) => inside({ ...context, matrix: context.matrix.clone().multiply(matrix) }),
      combined: (operation) => this.combine(node, operation, scope, context, label),
      hulled: () => {
        const leaves = inside(context).flatMap(solidScriptShapeLeavesPositive);
        if (leaves.length === 0) return [];
        if (context.planar)
          return [
            {
              kind: 'polygon',
              label,
              points: solidScriptPolygonHull(leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? leaf.points : []))),
            },
          ];
        return [{ kind: 'solid', label, points: leaves.flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : [])) }];
      },
      extruded: (fields) => {
        if (context.planar) throw new Error('Linear Extrude cannot be inside another Linear Extrude');
        const flat = solidScriptShapeJoin(inside({ matrix: new THREE.Matrix4(), planar: true }), label);
        return flat ? [solidScriptExtrude(flat, fields, context.matrix)] : [];
      },
      repeated: (counter, values) => {
        this.nameCheck(counter, 'a counter');
        this.writableCheck(counter);
        const shapes = values.flatMap((round) => {
          this.workTake();
          const inner = new SolidScriptScope(scope);
          inner.variableDefine(counter, round);
          return node.children.length === 0 ? [] : this.linesRun(node.children, inner, context, inner);
        });
        const joined = solidScriptShapeJoin(shapes, label);
        return joined ? [joined] : [];
      },
      branched: (holds) => {
        const lines = holds ? node.children : (node.otherwise ?? []);
        return lines.length === 0 ? [] : this.linesRun(lines, scope, context);
      },
      partUse: (name) => this.partUse(name, scope, context),
      pointsGathered: () => {
        const points: THREE.Vector3[] = [];
        this.gathering.push(points);
        try {
          if (node.children.length > 0)
            this.linesRun(node.children, scope, { matrix: new THREE.Matrix4(), planar: context.planar });
        } finally {
          this.gathering.pop();
        }
        return points;
      },
      local: (planar) => inside({ matrix: new THREE.Matrix4(), planar }),
      placed: (shapes) => shapes.map((shape) => solidScriptShapeTransform(shape, context.matrix)),
      leave: () => {
        if (this.partsActive.length === 0)
          throw new Error('Return leaves a part, so it only works between Define Part and its End');
        this.leaving = true;
        return [];
      },
      point: (position) => {
        const into = this.gathering[this.gathering.length - 1];
        if (!into) throw new Error('a Point belongs between a Polyhedron or Polygon line and its End');
        into.push(position.clone().applyMatrix4(context.matrix));
        return [];
      },
      print: (text) => {
        this.messages.push(text);
        return [];
      },
    };
  }

  /**
   * Evaluates one field of a line.
   *
   * @param node Line.
   * @param key Field key.
   * @param scope Scope.
   * @returns Value.
   */
  private fieldValue(node: SolidScriptBlockNode<Command>, key: string, scope: SolidScriptScope): SolidScriptValue {
    const field = node.command.parameters.find((parameter) => parameter.key === key);
    const text = node.command.valueText(node.values, key);
    try {
      return solidScriptFieldResolve(field?.type ?? 'value', text, this.fieldContext(scope));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${field?.label ?? key}: ${message}`);
    }
  }

  /**
   * Gives field text access to the variables of a scope and to formulas.
   *
   * @param scope Scope.
   * @returns Context.
   */
  private fieldContext(scope: SolidScriptScope): SolidScriptFieldContext {
    return {
      variable: (name) => {
        const item = solidScriptListItemParse(name);
        const base = item?.name ?? name;
        if (!scope.variableHas(base))
          throw new Error(`there is no variable [${base}]; set it on a line above this one`);
        if (!item) return scope.variableGet(base);
        const index = item.index === '' ? null : this.indexValue(item.index, scope);
        return solidScriptListItemRead(base, scope.variableGet(base), index, item.method);
      },
      formula: (text) => {
        let expression: SolidScriptExpression;
        try {
          expression = solidScriptExpressionParse(text);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`the formula "${text}" cannot be read: ${message}`);
        }
        return this.expressions.evaluate(expression, scope);
      },
    };
  }

  /**
   * Sets a variable after checking its name and that lines may change it.
   *
   * @param scope Scope of the line.
   * @param name Name.
   * @param value Value.
   */
  private variableSet(scope: SolidScriptScope, name: string, value: SolidScriptValue): void {
    const item = solidScriptListItemParse(name);
    if (item?.method) throw new Error(`${item.name}().${item.method} can only be read`);
    const base = item?.name ?? name;
    this.nameCheck(base, 'a variable');
    this.writableCheck(base);
    if (!item) return scope.variableSet(base, value);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    scope.variableSet(base, solidScriptListItemWrite(base, scope.variableGet(base), index, value));
  }

  /**
   * Reads the item number of a list reference, which may use variables and
   * formulas such as points([i]).
   *
   * @param text Index text.
   * @param scope Scope.
   * @returns Index value.
   */
  private indexValue(text: string, scope: SolidScriptScope): SolidScriptValue {
    return solidScriptFieldResolve('number', text, this.fieldContext(scope));
  }

  /**
   * Fails on a name that cannot be used for a variable or counter.
   *
   * @param name Name.
   * @param what What it names, for the message.
   */
  private nameCheck(name: string, what: string): void {
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot name ${what}; use letters, digits and _, not starting with a digit`);
  }

  /**
   * Fails when a line sets a name that may only be read.
   *
   * @param name Name being set.
   */
  private writableCheck(name: string): void {
    const origin = this.readOnly.get(name);
    if (origin !== undefined)
      throw new Error(
        `"${name}" is an ${origin} of this script and can only be read; change its value in the inspector`,
      );
  }

  /**
   * Fails when a shape is built among the Point lines of a Polyhedron or
   * Polygon.
   *
   * @param node Line.
   */
  private gatherCheck(node: SolidScriptBlockNode<Command>): void {
    if (this.gathering.length > 0)
      throw new Error(
        `${node.command.label} cannot be inside a Polyhedron or Polygon; only Point lines, logic and moves go there`,
      );
  }

  /**
   * Fails when a shape is drawn where it cannot be: flat shapes only inside
   * Linear Extrude, solids only outside it.
   *
   * @param node Line.
   * @param context Matrix and flatness.
   * @param flat True for a flat shape.
   */
  private flatCheck(node: SolidScriptBlockNode<Command>, context: SolidScriptContext, flat: boolean): void {
    if (flat && !context.planar)
      throw new Error(`${node.command.label} is a flat outline; place it inside a Linear Extrude`);
    if (!flat && context.planar)
      throw new Error(`${node.command.label} is a solid and cannot be inside Linear Extrude`);
  }

  /**
   * Runs Union, Difference or Intersection: each line inside is one operand.
   *
   * @param node Line.
   * @param operation Operation.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @param label Shape label.
   * @returns One combined shape, or nothing when empty.
   */
  private combine(
    node: SolidScriptBlockNode<Command>,
    operation: 'union' | 'difference' | 'intersection',
    scope: SolidScriptScope,
    context: SolidScriptContext,
    label: string,
  ): SolidScriptShape[] {
    if (node.children.length === 0)
      throw new Error(`${node.command.label} has nothing inside; add a shape before its End`);
    const inner = new SolidScriptScope(scope);
    for (const child of node.children)
      if (child.command.id === 'part') this.guarded(child.line, () => this.partDefine(child));
    const reached = this.steps.length;
    const operands: SolidScriptShape[] = [];
    node.children.forEach((child, index) => {
      const joined = solidScriptShapeJoin(this.lineRun(child, inner, context), label);
      if (
        index === 0 &&
        operation === 'difference' &&
        this.steps.length === reached &&
        !this.failure &&
        !this.paused &&
        !this.leaving
      )
        throw new Error('Difference has nothing to cut from: its first line builds no shape');
      if (joined) operands.push(joined);
    });
    if (operands.length === 0) return [];
    if (operands.length === 1 && operation !== 'difference') return operands;
    return [{ kind: 'boolean', operation, children: operands, label }];
  }

  /**
   * Builds the lines of a part where Use Part asks for it.
   *
   * @param name Part name.
   * @param scope Calling scope.
   * @param context Matrix and flatness.
   * @returns The part as one shape.
   */
  private partUse(name: string, scope: SolidScriptScope, context: SolidScriptContext): SolidScriptShape[] {
    const part = this.parts.get(name);
    if (!part) {
      const known = [...this.parts.keys()].sort();
      throw new Error(
        `no part is named "${name}". ${known.length > 0 ? `Parts: ${known.join(', ')}` : 'Define one with Define Part'}`,
      );
    }
    if (this.partsActive.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `parts are used inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} deep; a part that uses itself needs an If that stops it`,
      );
    if (part.node.children.length === 0) throw new Error(`part "${name}" has nothing inside`);
    this.partsActive.push(name);
    try {
      const inner = new SolidScriptScope(scope, name);
      const built = this.linesRun(part.node.children, inner, context, inner);
      this.leaving = false;
      const joined = solidScriptShapeJoin(built, name);
      return joined ? [joined] : [];
    } finally {
      this.partsActive.pop();
    }
  }

  /**
   * Records one shape step at the current line.
   *
   * @param scope Scope of the shape, watched while the step gets built.
   * @returns True while the step is within the step limit and gets built.
   */
  private stepTake(scope: SolidScriptScope): boolean {
    this.steps.push(this.line);
    if (this.steps.length > this.stepLimit) return false;
    this.watched = scope;
    this.solids += 1;
    if (this.solids > SOLID_SCRIPT_SOLIDS_MAX)
      throw new Error(`the script builds more than ${SOLID_SCRIPT_SOLIDS_MAX} shapes`);
    return true;
  }

  /** Counts one step of work and stops a run that never ends. */
  private workTake(): void {
    this.work += 1;
    if (this.work > SOLID_SCRIPT_WORK_LIMIT)
      throw new Error(
        `the script stopped after ${SOLID_SCRIPT_WORK_LIMIT.toLocaleString('en-US')} steps of work; check Repeat ranges and parts that use each other`,
      );
  }
}

/**
 * Describes a mistake for every place that shows it.
 *
 * @param line 1-based line, or null.
 * @param message Message as thrown.
 * @returns Failure.
 */
export function solidScriptFailure(line: number | null, message: string): SolidScriptFailure {
  const bare = message.replace(/^line \d+: /i, '');
  const lined = line === null ? bare : `line ${line}: ${bare}`;
  return { line, message: lined, text: solidScriptErrorText(lined) };
}
