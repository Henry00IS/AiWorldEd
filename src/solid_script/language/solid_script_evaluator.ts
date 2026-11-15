import * as THREE from 'three';
import type { SolidScriptArgument, SolidScriptExpression, SolidScriptStatement } from './solid_script_ast.js';
import { SolidScriptCallArguments } from './solid_script_call_arguments.js';
import { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { solidScriptExtrude } from './solid_script_extrude.js';
import { solidScriptPolygonHull, type SolidScriptPoint2 } from './solid_script_polygon.js';
import {
  solidScriptCirclePoints,
  solidScriptCubePoints,
  solidScriptCylinderPoints,
  solidScriptPolygonPaths,
  solidScriptPolyhedronPoints,
  solidScriptRadius,
  solidScriptSpherePoints,
  solidScriptSquarePoints,
  type SolidScriptFragmentSettings,
} from './solid_script_primitives.js';
import { solidScriptErrorLine, solidScriptErrorText } from './solid_script_error.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptShapeJoin, solidScriptShapeLeavesPositive, type SolidScriptShape } from './solid_script_shape.js';
import { solidScriptTransformMatrix } from './solid_script_transforms.js';
import {
  solidScriptValueNumber,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Most solids one program may produce. */
const SOLID_SCRIPT_SOLIDS_MAX = 2000;

/**
 * Most steps of work one run may take: statements, loop rounds and function
 * calls. Counting work instead of time keeps the result the same on every
 * machine of a room while no script can freeze the editor.
 */
export const SOLID_SCRIPT_WORK_LIMIT = 1000000;

/** Modules whose lines must hold something before their End. */
const SOLID_SCRIPT_BLOCK_MODULES: ReadonlySet<string> = new Set([
  'union',
  'difference',
  'intersection',
  'hull',
  'linear_extrude',
]);

/** Modules outside the subset, with the suggested alternative. */
const SOLID_SCRIPT_UNSUPPORTED: Readonly<Record<string, string>> = {
  rotate_extrude:
    'use the column modifier generator for turned profiles, or approximate with rotated linear_extrude slices',
  minkowski: 'grow the shapes by hand or hull() copies of them',
  offset: 'draw the grown or shrunk outline with polygon()',
  text: 'text is not supported',
  import: 'files cannot be imported; describe the geometry inline',
  surface: 'height maps are not supported',
  projection: 'projection is not supported',
  resize: 'use scale() with computed factors',
};

/** 3D primitives and the points of their convex solid. */
const SOLID_SCRIPT_SOLID_PRIMITIVES: Readonly<
  Record<string, (args: SolidScriptCallArguments, settings: SolidScriptFragmentSettings) => THREE.Vector3[]>
> = {
  cube: (args) => solidScriptCubePoints(args),
  sphere: solidScriptSpherePoints,
  cylinder: solidScriptCylinderPoints,
  polyhedron: (args) => solidScriptPolyhedronPoints(args),
};

/** Where shapes are being evaluated: inside linear_extrude everything is 2D. */
interface SolidScriptContext {
  matrix: THREE.Matrix4;
  planar: boolean;
}

/** Result of evaluating a program. */
export interface SolidScriptEvaluation {
  shapes: SolidScriptShape[];
  messages: string[];
  /** Source line of every primitive in evaluation order, built or not. */
  steps: number[];
  /** Variables visible at the last built step, with their values as text. */
  variables: SolidScriptVariable[];
}

/** The mistake a run stopped at. */
export interface SolidScriptFailure {
  /** 1-based source line, or null when the problem has no single line. */
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

/** A name defined before the first line, with its parsed value. */
export interface SolidScriptPresetParsed {
  name: string;
  value: SolidScriptExpression;
  origin: string;
  readOnly: boolean;
}

/** One variable and its value as the debugger shows it. */
export interface SolidScriptVariable {
  name: string;
  value: string;
}

/** Evaluates solid script statements into a shape tree. */
export class SolidScriptEvaluator {
  private readonly expressions = new SolidScriptExpressionEvaluator(() => this.workTake());
  private readonly messages: string[] = [];
  private readonly steps: number[] = [];
  private solids = 0;
  private line = 0;
  private watched: SolidScriptScope | null = null;
  private failure: SolidScriptFailure | null = null;
  private readonly readOnly = new Map<string, string>();
  private work = 0;

  /**
   * Creates an evaluator.
   *
   * @param stepLimit Primitives to build; later primitives are only counted.
   */
  constructor(private readonly stepLimit = Number.POSITIVE_INFINITY) {}

  /**
   * Evaluates a program.
   *
   * @param statements Top-level statements.
   * @returns Shapes and echo messages.
   */
  evaluateProgram(
    statements: SolidScriptStatement[],
    presets: readonly SolidScriptPresetParsed[] = [],
  ): SolidScriptRun {
    const root = new SolidScriptScope(null, null, '');
    root.variableSet('$fn', 0);
    root.variableSet('$fa', 12);
    root.variableSet('$fs', 2);
    for (const preset of presets) this.presetApply(preset, root);
    const shapes = this.statementsEvaluate(statements, root, { matrix: new THREE.Matrix4(), planar: false });
    const visible = [...(this.watched?.variablesVisible() ?? [])];
    const variables = visible.map(([name, value]) => ({ name, value: solidScriptValueText(value) }));
    if (!this.failure && this.steps.length === 0)
      this.failure = solidScriptFailure(null, 'the script builds no solids; add a shape such as Cube');
    return { shapes, messages: this.messages, steps: this.steps, variables, error: this.failure };
  }

  /**
   * Defines a preset in the root scope; a mistake in its value stops the run
   * before the first line.
   *
   * @param preset Preset.
   * @param root Root scope.
   */
  private presetApply(preset: SolidScriptPresetParsed, root: SolidScriptScope): void {
    if (this.failure) return;
    try {
      root.variableSet(preset.name, this.expressions.evaluate(preset.value, root));
      if (preset.readOnly) this.readOnly.set(preset.name, preset.origin.toLowerCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure = solidScriptFailure(null, `${preset.origin} "${preset.name}": ${message}`);
    }
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
   * Evaluates statements in a new scope: definitions and assignments first,
   * then shapes, matching the language's per-scope variable rule.
   *
   * @param statements Statements.
   * @param parent Enclosing scope.
   * @param context Transform context.
   * @param scope Scope to evaluate in; a new child of the parent by default.
   * @returns Shapes in statement order.
   */
  private statementsEvaluate(
    statements: SolidScriptStatement[],
    parent: SolidScriptScope,
    context: SolidScriptContext,
    scope = new SolidScriptScope(parent),
  ): SolidScriptShape[] {
    for (const statement of statements) this.guarded(statement.line, () => this.definitionApply(statement, scope));
    return statements.flatMap((statement) => this.statementEvaluate(statement, scope, context));
  }

  /**
   * Registers a definition or assignment in a scope.
   *
   * @param statement Statement.
   * @param scope Scope.
   */
  private definitionApply(statement: SolidScriptStatement, scope: SolidScriptScope): void {
    if (statement.kind === 'module_define')
      scope.moduleSet(statement.name, { params: statement.params, body: statement.body, scope });
    if (statement.kind === 'function_define')
      scope.functionSet(statement.name, { params: statement.params, body: statement.body, scope });
    if (statement.kind === 'assign') this.writableCheck(statement.name);
    if (statement.kind === 'assign')
      scope.variableSet(statement.name, this.expressions.evaluate(statement.value, scope));
  }

  /**
   * Evaluates one shape-producing statement.
   *
   * @param statement Statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private statementEvaluate(
    statement: SolidScriptStatement,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    return this.guarded(statement.line, () => this.statementShapes(statement, scope, context)) ?? [];
  }

  /**
   * Runs one step of the program at a line unless the run already stopped; a
   * mistake stops the run there, keeping everything built before it.
   *
   * @param line Source line.
   * @param run Step to run.
   * @returns Its result, or undefined when the run stopped.
   */
  private guarded<T>(line: number, run: () => T): T | undefined {
    if (this.failure) return undefined;
    this.line = line;
    try {
      this.workTake();
      return run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure ??= solidScriptFailure(solidScriptErrorLine(message) ?? line, message);
      return undefined;
    }
  }

  /**
   * Evaluates the shapes of one statement.
   *
   * @param statement Statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private statementShapes(
    statement: SolidScriptStatement,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    {
      switch (statement.kind) {
        case 'block':
          return this.statementsEvaluate(statement.body, scope, context);
        case 'if':
          return this.ifEvaluate(statement, scope, context);
        case 'for':
          return this.forEvaluate(statement, scope, context);
        case 'module_call':
          return this.callEvaluate(statement, scope, context);
        default:
          return [];
      }
    }
  }

  /**
   * Evaluates the branch an if statement picks.
   *
   * @param statement If statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private ifEvaluate(
    statement: Extract<SolidScriptStatement, { kind: 'if' }>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const truthy = solidScriptValueTruthy(this.expressions.evaluate(statement.condition, scope));
    return this.statementsEvaluate(truthy ? statement.then : statement.otherwise, scope, context);
  }

  /**
   * Evaluates a for statement into one implicit union.
   *
   * @param statement For statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private forEvaluate(
    statement: Extract<SolidScriptStatement, { kind: 'for' }>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    for (const binding of statement.bindings) this.writableCheck(binding.name);
    const shapes = this.expressions.bindingsWalk(statement.bindings, scope, (inner) =>
      this.statementsEvaluate(statement.body, inner, context),
    );
    const joined = solidScriptShapeJoin(shapes, scope.moduleName || 'for');
    return joined ? [joined] : [];
  }

  /**
   * Evaluates a module call: user module, transform, boolean or primitive.
   *
   * @param call Module call.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private callEvaluate(
    call: Extract<SolidScriptStatement, { kind: 'module_call' }>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const user = scope.moduleGet(call.name);
    if (user) return this.userModuleEvaluate(call, user, scope, context);
    if (call.name === 'children') return this.childrenEvaluate(call.args, scope, context);
    const args = this.argumentsResolve(call.name, call.args, scope);
    const inner = this.specialsScope(call.args, args, scope);
    const matrix = solidScriptTransformMatrix(call.name, args);
    if (matrix) args.unusedCheck();
    if ((matrix || SOLID_SCRIPT_BLOCK_MODULES.has(call.name)) && call.children.length === 0)
      throw new Error(`${call.name}() has nothing inside; add a shape before its End`);
    if (matrix)
      return this.statementsEvaluate(call.children, inner, {
        ...context,
        matrix: context.matrix.clone().multiply(matrix),
      });
    return this.builtinEvaluate(call, args, inner, context);
  }

  /**
   * Evaluates built-in modules other than transforms.
   *
   * @param call Module call.
   * @param args Resolved arguments.
   * @param scope Scope holding $ overrides of the call.
   * @param context Transform context.
   * @returns Shapes.
   */
  private builtinEvaluate(
    call: Extract<SolidScriptStatement, { kind: 'module_call' }>,
    args: SolidScriptCallArguments,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const name = call.name;
    if (name === 'color' || name === 'render' || name === 'group')
      return this.statementsEvaluate(call.children, scope, context);
    if (name === 'union' || name === 'difference' || name === 'intersection' || name === 'hull') args.unusedCheck();
    if (name === 'union' || name === 'difference' || name === 'intersection')
      return this.booleanEvaluate(name, call.children, scope, context);
    if (name === 'hull') return this.hullEvaluate(call.children, scope, context);
    if (name === 'linear_extrude') return this.extrudeEvaluate(call.children, args, scope, context);
    if (name === 'echo') return this.echoEvaluate(call.args, scope);
    if (name === 'assert') return this.assertEvaluate(args);
    const hint = SOLID_SCRIPT_UNSUPPORTED[name];
    if (hint) throw new Error(`${name}() is not supported: ${hint}`);
    if (call.children.length > 0) throw new Error(`${name}() takes no children; is a ";" missing after it?`);
    return this.primitiveEvaluate(name, args, scope, context);
  }

  /**
   * Evaluates a primitive shape.
   *
   * @param name Module name.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One shape.
   */
  private primitiveEvaluate(
    name: string,
    args: SolidScriptCallArguments,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const label = scope.moduleName || name;
    const planar = name === 'square' || name === 'circle' || name === 'polygon';
    if (planar !== context.planar) {
      throw new Error(`${name}() is ${planar ? '2D and must be inside' : '3D and cannot be inside'} linear_extrude()`);
    }
    if (!this.stepTake(scope)) return [];
    if (planar) return [this.planarShape(name, args, scope, context, label)];
    const build = SOLID_SCRIPT_SOLID_PRIMITIVES[name];
    if (!build) throw new Error(`unknown module ${name}()`);
    const points = build(args, this.fragmentSettings(scope));
    args.unusedCheck();
    this.solidCount();
    return [{ kind: 'solid', label, points: points.map((point) => point.applyMatrix4(context.matrix)) }];
  }

  /**
   * Builds a 2D primitive; polygon holes become a difference.
   *
   * @param name Module name.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @param label Shape label.
   * @returns Shape.
   */
  private planarShape(
    name: string,
    args: SolidScriptCallArguments,
    scope: SolidScriptScope,
    context: SolidScriptContext,
    label: string,
  ): SolidScriptShape {
    this.solidCount();
    const outlines =
      name === 'square'
        ? [solidScriptSquarePoints(args)]
        : name === 'circle'
          ? [
              solidScriptCirclePoints(
                args.positive('r', solidScriptRadius(args, 'r', 'd', args.number('r', 0, 1))),
                this.fragmentSettings(scope),
              ),
            ]
          : solidScriptPolygonPaths(args);
    args.unusedCheck();
    const shapes: SolidScriptShape[] = outlines.map((outline) => ({
      kind: 'polygon',
      label,
      points: outline.map((point) => this.planarTransform(point, context.matrix)),
    }));
    return shapes.length === 1
      ? (shapes[0] as SolidScriptShape)
      : { kind: 'boolean', operation: 'difference', children: shapes, label };
  }

  /**
   * Applies a matrix to a 2D point in the XY plane.
   *
   * @param point Point.
   * @param matrix Matrix.
   * @returns Transformed point.
   */
  private planarTransform(point: SolidScriptPoint2, matrix: THREE.Matrix4): SolidScriptPoint2 {
    const moved = new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix);
    return [moved.x, moved.y];
  }

  /**
   * Evaluates union, difference or intersection; each child statement is one
   * operand.
   *
   * @param operation Boolean operation.
   * @param children Child statements.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One boolean shape, or nothing when empty.
   */
  private booleanEvaluate(
    operation: 'union' | 'difference' | 'intersection',
    children: SolidScriptStatement[],
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const inner = new SolidScriptScope(scope);
    for (const statement of children) this.definitionApply(statement, inner);
    const label = scope.moduleName || operation;
    const reached = this.steps.length;
    const results = children
      .filter((statement) => statement.kind !== 'assign')
      .map((statement, index) => {
        const joined = solidScriptShapeJoin(this.statementEvaluate(statement, inner, context), label);
        if (index === 0 && operation === 'difference' && this.steps.length === reached && !this.failure)
          throw new Error('difference() has nothing to cut from: its first line builds no shape');
        return joined;
      });
    const operands = results.filter((result): result is SolidScriptShape => result !== null);
    if (operands.length === 0) return [];
    if (operands.length === 1 && operation !== 'difference') return operands;
    return [{ kind: 'boolean', operation, children: operands, label }];
  }

  /**
   * Evaluates hull() into one convex solid or polygon.
   *
   * @param children Child statements.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One shape, or nothing when empty.
   */
  private hullEvaluate(
    children: SolidScriptStatement[],
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const leaves = this.statementsEvaluate(children, scope, context).flatMap(solidScriptShapeLeavesPositive);
    if (leaves.length === 0) return [];
    const label = scope.moduleName || 'hull';
    if (context.planar)
      return [
        {
          kind: 'polygon',
          label,
          points: solidScriptPolygonHull(leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? leaf.points : []))),
        },
      ];
    return [{ kind: 'solid', label, points: leaves.flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : [])) }];
  }

  /**
   * Evaluates linear_extrude() of 2D children.
   *
   * @param children Child statements.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Extruded shapes.
   */
  private extrudeEvaluate(
    children: SolidScriptStatement[],
    args: SolidScriptCallArguments,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    if (context.planar) throw new Error('linear_extrude() cannot be nested');
    const planar = solidScriptShapeJoin(
      this.statementsEvaluate(children, scope, { matrix: new THREE.Matrix4(), planar: true }),
      scope.moduleName || 'linear_extrude',
    );
    if (!planar) return [];
    const extruded = solidScriptExtrude(planar, args, context.matrix);
    args.unusedCheck();
    return [extruded];
  }

  /**
   * Calls a user module with its children.
   *
   * @param call Module call.
   * @param definition Module definition.
   * @param scope Calling scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private userModuleEvaluate(
    call: Extract<SolidScriptStatement, { kind: 'module_call' }>,
    definition: NonNullable<ReturnType<SolidScriptScope['moduleGet']>>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const inner = new SolidScriptScope(definition.scope, { statements: call.children, scope }, call.name);
    this.expressions.argumentsBind(definition.params, call.args, scope, definition.scope, inner);
    const joined = solidScriptShapeJoin(
      this.statementsEvaluate(definition.body, inner, context, new SolidScriptScope(inner)),
      call.name,
    );
    return joined ? [joined] : [];
  }

  /**
   * Evaluates children() or children(index) inside a user module.
   *
   * @param args Call arguments.
   * @param scope Scope inside the module.
   * @param context Transform context.
   * @returns Shapes.
   */
  private childrenEvaluate(
    args: SolidScriptArgument[],
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const children = scope.children;
    if (!children) return [];
    const index = args[0] ? solidScriptValueNumber(this.expressions.evaluate(args[0].value, scope)) : undefined;
    const statements =
      index === undefined
        ? children.statements
        : children.statements.filter((statement) => statement.kind !== 'assign').slice(index, index + 1);
    return this.statementsEvaluate(statements, children.scope, context);
  }

  /**
   * Records an echo() message.
   *
   * @param args Call arguments.
   * @param scope Scope.
   * @returns No shapes.
   */
  private echoEvaluate(args: SolidScriptArgument[], scope: SolidScriptScope): SolidScriptShape[] {
    const parts = args.map((arg) => {
      const value = this.expressions.evaluate(arg.value, scope);
      return arg.name ? `${arg.name} = ${solidScriptValueText(value)}` : solidScriptValueText(value);
    });
    this.messages.push(`ECHO: ${parts.join(', ')}`);
    return [];
  }

  /**
   * Checks an assert() condition.
   *
   * @param args Resolved arguments.
   * @returns No shapes.
   */
  private assertEvaluate(args: SolidScriptCallArguments): SolidScriptShape[] {
    if (!solidScriptValueTruthy(args.value('condition', 0)))
      throw new Error(`assertion failed: ${solidScriptValueText(args.value('message', 1) ?? 'condition is false')}`);
    args.unusedCheck();
    return [];
  }

  /**
   * Evaluates the arguments of a built-in module.
   *
   * @param name Module name.
   * @param args Call arguments.
   * @param scope Scope.
   * @returns Argument view.
   */
  private argumentsResolve(
    name: string,
    args: SolidScriptArgument[],
    scope: SolidScriptScope,
  ): SolidScriptCallArguments {
    const positional: SolidScriptValue[] = [];
    const named = new Map<string, SolidScriptValue>();
    for (const arg of args) {
      const value = this.expressions.evaluate(arg.value, scope);
      if (arg.name) named.set(arg.name, value);
      else positional.push(value);
    }
    return new SolidScriptCallArguments(name, positional, named);
  }

  /**
   * Returns a scope carrying the $ variables a call overrides.
   *
   * @param raw Call arguments.
   * @param args Resolved arguments.
   * @param scope Calling scope.
   * @returns Scope.
   */
  private specialsScope(
    raw: SolidScriptArgument[],
    args: SolidScriptCallArguments,
    scope: SolidScriptScope,
  ): SolidScriptScope {
    const specials = raw.filter((arg) => arg.name?.startsWith('$'));
    if (specials.length === 0) return scope;
    const inner = new SolidScriptScope(scope);
    for (const arg of specials) inner.variableSet(arg.name as string, args.value(arg.name as string));
    return inner;
  }

  /**
   * Reads $fn, $fa and $fs.
   *
   * @param scope Scope.
   * @returns Resolution settings.
   */
  private fragmentSettings(scope: SolidScriptScope): SolidScriptFragmentSettings {
    return {
      fn: solidScriptValueNumber(scope.variableGet('$fn')) ?? 0,
      fa: Math.max(0.01, solidScriptValueNumber(scope.variableGet('$fa')) ?? 12),
      fs: Math.max(0.01, solidScriptValueNumber(scope.variableGet('$fs')) ?? 2),
    };
  }

  /**
   * Records one primitive step at the current line.
   *
   * @param scope Scope of the primitive, watched while the step gets built.
   * @returns True while the step is within the step limit and gets built.
   */
  private stepTake(scope: SolidScriptScope): boolean {
    this.steps.push(this.line);
    if (this.steps.length > this.stepLimit) return false;
    this.watched = scope;
    return true;
  }

  /** Counts one step of work and stops runaway programs. */
  private workTake(): void {
    this.work += 1;
    if (this.work > SOLID_SCRIPT_WORK_LIMIT)
      throw new Error(
        `the script needs too much work: more than ${SOLID_SCRIPT_WORK_LIMIT.toLocaleString('en-US')} steps. Lower a Repeat count`,
      );
  }

  /** Counts one more solid and stops runaway programs. */
  private solidCount(): void {
    this.solids += 1;
    if (this.solids > SOLID_SCRIPT_SOLIDS_MAX)
      throw new Error(`more than ${SOLID_SCRIPT_SOLIDS_MAX} solids; simplify the model`);
  }
}

/**
 * Describes the mistake a run stopped at.
 *
 * @param line 1-based line, or null.
 * @param thrown Message as thrown, with or without its line.
 * @returns Failure.
 */
function solidScriptFailure(line: number | null, thrown: string): SolidScriptFailure {
  const bare = thrown.replace(/^line \d+: /i, '');
  const message = line === null ? bare : `line ${line}: ${bare}`;
  return { line, message, text: solidScriptErrorText(message) };
}
