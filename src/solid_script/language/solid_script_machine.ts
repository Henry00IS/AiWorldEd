import { SOLID_SCRIPT_SYSTEM_GLOBALS, type SolidScriptSystemReader } from './solid_script_system.js';
import { solidScriptGeometryLookup } from './solid_script_geometry_lookup.js';
import * as THREE from 'three';
import type { SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptBlockNode, SolidScriptTreeCommand } from './solid_script_block_tree.js';
import { solidScriptErrorLine, solidScriptErrorText } from './solid_script_error.js';
import { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { solidScriptExpressionParse } from './solid_script_expression_parse.js';
import {
  solidScriptFieldCompiled,
  solidScriptFieldResolve,
  type SolidScriptFieldCompiled,
  type SolidScriptFieldContext,
  type SolidScriptFieldKind,
} from './solid_script_field.js';
import { solidScriptExtrude } from './solid_script_extrude.js';
import { solidScriptPolygonHull, type SolidScriptPoint2 } from './solid_script_polygon.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRead,
  solidScriptListItemRemove,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from './solid_script_functions_builtin.js';
import { solidScriptShapeTransform } from './solid_script_reshape.js';
import {
  solidScriptMeshChecked,
  solidScriptMeshTransform,
  solidScriptShapeHasMesh,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from './solid_script_mesh.js';
import { SolidScriptScope } from './solid_script_scope.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeLeavesPositive,
  solidScriptShapeMapLeaves,
  type SolidScriptShape,
  type SolidScriptShapeLeaf,
} from './solid_script_shape.js';
import { solidScriptValueText, solidScriptValueType, type SolidScriptValue } from './solid_script_value.js';

/** Most solids one run may produce. */
const SOLID_SCRIPT_SOLIDS_MAX = 2000;

/** Most parts that may be in use inside each other at once. */
export const SOLID_SCRIPT_PART_DEPTH_MAX = 64;

/**
 * Most steps of work one run may take: lines, loop rounds and function calls.
 * Counting work instead of time keeps the result the same on every machine of a
 * room while no script can freeze the editor.
 */
export const SOLID_SCRIPT_WORK_LIMIT = 10_000_000;

/** Field types whose stored text is used as typed instead of evaluated. */
const SOLID_SCRIPT_TEXT_FIELDS: ReadonlySet<string> = new Set(['name', 'target', 'text']);

/** Pattern of a variable or part name. */
const SOLID_SCRIPT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Command ids of the blocks that run when an inspector event happens. */
export const SOLID_SCRIPT_HANDLERS = { input: 'when_input_changes', button: 'when_button_pressed' } as const;

/**
 * Blocks that only define something: the script skips from them to their End,
 * and their lines run only when they are used, called or their event happens.
 */
const SOLID_SCRIPT_DEFINITIONS: ReadonlySet<string> = new Set([
  'part',
  'function',
  SOLID_SCRIPT_HANDLERS.input,
  SOLID_SCRIPT_HANDLERS.button,
]);

/** Prefix of a variable that belongs to the Function it is used in. */
export const SOLID_SCRIPT_LOCAL_PREFIX = 'local.';

/**
 * Start of a variable kept with the generator between runs, such as
 * [persistent.presses]. Its value is stored, saved and shared like an input
 * that has no row in the inspector.
 */
export const SOLID_SCRIPT_PERSISTENT_PREFIX = 'persistent.';

/**
 * Reads the persistent values stored among a generator's input values.
 *
 * @param inputs Stored input values by name.
 * @returns Persistent values by bare name.
 */
export function solidScriptPersistentRead(inputs: Readonly<Record<string, string>>): Map<string, SolidScriptValue> {
  const values = new Map<string, SolidScriptValue>();
  for (const [key, text] of Object.entries(inputs)) {
    if (!key.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) continue;
    let value: SolidScriptValue = text;
    try {
      value = JSON.parse(text) as SolidScriptValue;
    } catch {
      value = text;
    }
    values.set(key.slice(SOLID_SCRIPT_PERSISTENT_PREFIX.length), value);
  }
  return values;
}

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

/** Which block gathers: corner points only, or a mesh's vertices and faces. */
export type SolidScriptGatherKind = 'points' | 'mesh';

/** What the Point, Vertex and Face lines inside a block added. */
export interface SolidScriptGathered {
  points: THREE.Vector3[];
  /** Texture coordinate per point, or null when the Vertex has none. */
  uvs: (SolidScriptUv | null)[];
  faces: number[][];
}

/** A block gathering lines, innermost last. */
interface SolidScriptGathering extends SolidScriptGathered {
  kind: SolidScriptGatherKind;
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
  /** Works out a field of values separated by commas, such as [i], 0.2. */
  values(key: string): SolidScriptValue[];
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
   * Runs the lines inside and returns what their Point, Vertex and Face lines
   * add, moved by the blocks between.
   */
  gathered(what: SolidScriptGatherKind): SolidScriptGathered;
  /**
   * Adds a point to the Polyhedron, Polygon or Mesh around this line, with its
   * texture coordinate in a Mesh.
   */
  point(position: THREE.Vector3, uv: SolidScriptUv | null): SolidScriptShape[];
  /** Adds a face to the Mesh around this line. */
  face(corners: readonly number[]): SolidScriptShape[];
  /** Places a mesh built in the block's own frame, as one shape step. */
  mesh(mesh: SolidScriptShapeMesh): SolidScriptShapeMesh[];
  /**
   * Evaluates a field with extra variables, such as the point a Displace is
   * moving.
   */
  valueWith(key: string, variables: Readonly<Record<string, SolidScriptValue>>): SolidScriptValue;
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
  /**
   * Leaves the Function or part being run; a Function hands back the value. The
   * lines after its Call or Use Part carry on.
   */
  leave(value: SolidScriptValue | undefined): SolidScriptShape[];
  /**
   * Runs a Function block with arguments, building its shapes here, and stores
   * what it returns in a variable when one is named.
   */
  call(name: string, values: readonly SolidScriptValue[], result: string | null): SolidScriptShape[];
  /** True while an inspector event runs its handler instead of the script. */
  readonly handling: boolean;
  /**
   * Every shape built so far by the lines above this one, in this block and the
   * blocks around it, in build order.
   */
  built(): SolidScriptShape[];
  /** The faces picked by the last Select Faces line. */
  selection(): SolidScriptFaceFacts[];
  /** Remembers the faces Select Faces picked. */
  selectionSet(faces: readonly SolidScriptFaceFacts[]): void;
  /** The face of the For Each Selected Face round running, or null outside one. */
  faceCurrent(): SolidScriptFaceFacts | null;
  /**
   * Runs the lines inside once per round, with read-only system variables such
   * as Face.Center set for that round, and the face of the round as the current
   * face.
   */
  looped(
    rounds: readonly { variables: Readonly<Record<string, SolidScriptValue>>; face: SolidScriptFaceFacts | null }[],
  ): SolidScriptShape[];
  /**
   * Runs the lines inside placed by a matrix, ignoring the blocks around this
   * line.
   */
  framed(matrix: THREE.Matrix4): SolidScriptShape[];
  /** Swaps a built solid or mesh for another, wherever it was built. */
  leafReplace(leaf: SolidScriptGeometryLeaf, by: SolidScriptGeometryLeaf): void;
  /** Returns what a solid or mesh became after the swaps since it was read. */
  leafLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf;
  /** Adds shapes as built by this line, each a step for the debugger. */
  adopted(shapes: readonly SolidScriptShapeLeaf[]): SolidScriptShape[];
  /** Changes the inspector value of an input, while handling an event. */
  inputSet(name: string, value: SolidScriptValue): void;
  /** Shows a message in the inspector, while handling an event. */
  notice(text: string): void;
  /** The inspector value of a script input, or undefined when none is set. */
  inputValue(name: string): string | undefined;
  /** Defines a script input: a variable lines may only read. */
  inputDefine(name: string, value: SolidScriptValue): void;
  /** Removes one item of a list, or its last item for list(). */
  itemRemove(target: string): void;
  /**
   * Changes a whole list in place. With create, a missing name starts as an
   * empty list.
   */
  listUpdate(name: string, change: (items: readonly SolidScriptValue[]) => SolidScriptValue[], create: boolean): void;
  /** Reads a list, failing with a plain message when the name is not a list. */
  listRead(name: string): readonly SolidScriptValue[];
  /** Forgets a variable. */
  variableDelete(name: string): void;
  /**
   * Empties a variable: a list keeps no items, anything else becomes empty
   * text.
   */
  variableClear(name: string): void;
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
  /**
   * Functions and parts running at the last built step or where the run paused,
   * outermost first, with each Function's own variables.
   */
  stack: SolidScriptFrameView[];
  /**
   * How often each line ran and how long it took with the lines inside it, by
   * 1-based line; empty unless the run was asked to profile.
   */
  profile: ReadonlyMap<number, SolidScriptLineProfile>;
}

/** How often one line ran and its time in milliseconds, inner lines included. */
export interface SolidScriptLineProfile {
  count: number;
  ms: number;
}

/** One Function or part on the call stack, as the debugger shows it. */
export interface SolidScriptFrameView {
  /** "area()" for a Function, "part column" for a part. */
  name: string;
  /** 1-based line of the Call or Use Part that started it. */
  line: number;
  /** Its own variables, written [local.name]; empty for a part. */
  locals: SolidScriptVariable[];
}

/** An inspector event a handler block answers. */
export interface SolidScriptEvent {
  /** An input's value changed, or a button input was pressed. */
  kind: keyof typeof SOLID_SCRIPT_HANDLERS;
  /** Name of the input. */
  name: string;
}

/** What the handlers of an inspector event did. */
export interface SolidScriptHandled {
  /**
   * Input values the handlers changed with Set Input, and persistent values
   * they set (as persistent.name with JSON text), by name.
   */
  inputs: Record<string, string>;
  /** Stored names to forget: persistent values the handlers deleted. */
  removed: string[];
  /** Show Message texts, in order. */
  notices: string[];
  /** Echo lines, in order. */
  messages: string[];
  /** The mistake the handler stopped at, or null. */
  error: SolidScriptFailure | null;
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

/** One variable and its value as the debugger shows it. */
export interface SolidScriptVariable {
  /** Name as fields read it, such as width, local.n or points(2). */
  name: string;
  /** Value as text. */
  value: string;
  /** Friendly type, such as Number, Text, Yes/No or List of Numbers. */
  type: string;
  /** Items of a list, each named like points(0); empty for other values. */
  items: SolidScriptVariable[];
}

/** Most list items the variable explorer lists under one list. */
export const SOLID_SCRIPT_VARIABLE_ITEMS_MAX = 256;

/**
 * Describes a variable for the debugger and the variable explorer: its value as
 * text, its friendly type and, for a list, its items by number.
 *
 * @param name Name.
 * @param value Value.
 * @returns View.
 */
export function solidScriptVariableView(name: string, value: SolidScriptValue): SolidScriptVariable {
  const items = Array.isArray(value)
    ? value
        .slice(0, SOLID_SCRIPT_VARIABLE_ITEMS_MAX)
        .map((item, index) => solidScriptVariableView(`${name}(${index})`, item))
    : [];
  return { name, value: solidScriptValueText(value), type: solidScriptValueType(value), items };
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

/** One Function or part running, innermost last on the stack. */
interface SolidScriptFrame {
  kind: 'function' | 'part';
  name: string;
  /** Line of the Call, Use Part or formula that started it. */
  line: number;
  /** The Function's own variables, or null for a part. */
  locals: SolidScriptScope | null;
  /** What Return handed back, or null before a Return with a value. */
  returned: { value: SolidScriptValue } | null;
}

/** Scope and context a line runs in this time. */
interface SolidScriptLineState {
  scope: SolidScriptScope;
  context: SolidScriptContext;
}

/** The run view of a line, made once and reused while the line is not running. */
interface SolidScriptLineRun {
  run: SolidScriptBlockRun;
  state: SolidScriptLineState;
  /** True while the line runs, so a Function calling itself gets its own view. */
  busy: boolean;
}

/** One part of a vector variable, such as pos.x. */
interface SolidScriptVectorPart {
  /** Vector variable. */
  name: string;
  /** Part letter. */
  axis: 'x' | 'y' | 'z';
  /** Position in the vector. */
  index: number;
}

/**
 * Reads a name such as pos.x as a part of the vector pos.
 *
 * @param name Variable name.
 * @returns Part, or null for other names.
 */
function solidScriptVectorComponent(name: string): SolidScriptVectorPart | null {
  const known = SOLID_SCRIPT_VECTOR_PARTS.get(name);
  if (known !== undefined) return known;
  const part = solidScriptVectorComponentParse(name);
  if (SOLID_SCRIPT_VECTOR_PARTS.size >= 20000) SOLID_SCRIPT_VECTOR_PARTS.clear();
  SOLID_SCRIPT_VECTOR_PARTS.set(name, part);
  return part;
}

/** First names of the built-in values, such as Time. */
const SOLID_SCRIPT_SYSTEM_GROUPS: ReadonlySet<string> = new Set(
  SOLID_SCRIPT_SYSTEM_GLOBALS.map((entry) => entry.name.slice(0, entry.name.indexOf('.'))),
);

/** Names of the built-in values every script can read. */
const SOLID_SCRIPT_SYSTEM_NAMES: ReadonlySet<string> = new Set(SOLID_SCRIPT_SYSTEM_GLOBALS.map((entry) => entry.name));

/**
 * Names already checked to be plain names, so setting them again skips the
 * checks.
 */
const SOLID_SCRIPT_NAMES_PLAIN = new Set<string>();

/** Vector parts by name, read once. */
const SOLID_SCRIPT_VECTOR_PARTS = new Map<string, SolidScriptVectorPart | null>();

/**
 * Reads a name such as pos.x without the cache.
 *
 * @param name Variable name.
 * @returns Part, or null for other names.
 */
function solidScriptVectorComponentParse(name: string): SolidScriptVectorPart | null {
  const match = /^(.+)\.([xyzXYZ])$/.exec(name);
  if (!match) return null;
  const axis = match[2]!.toLowerCase() as 'x' | 'y' | 'z';
  return { name: match[1]!, axis, index: 'xyz'.indexOf(axis) };
}

/**
 * Reads one part of a vector.
 *
 * @param part Part.
 * @param vector Vector value.
 * @returns Number.
 */
function solidScriptVectorComponentRead(part: SolidScriptVectorPart, vector: SolidScriptValue): SolidScriptValue {
  if (!Array.isArray(vector) || vector[part.index] === undefined)
    throw new Error(`[${part.name}] is ${solidScriptValueType(vector)}, not a vector with a .${part.axis}`);
  return vector[part.index];
}

/**
 * Changes one part of a vector, keeping the others.
 *
 * @param part Part.
 * @param vector Vector value.
 * @param value New number.
 * @returns New vector.
 */
function solidScriptVectorComponentWrite(
  part: SolidScriptVectorPart,
  vector: SolidScriptValue,
  value: SolidScriptValue,
): SolidScriptValue {
  if (!Array.isArray(vector) || vector.length < 2 || vector.length > 3 || part.index >= vector.length)
    throw new Error(`[${part.name}] is ${solidScriptValueType(vector)}, not a vector with a .${part.axis}`);
  const changed = [...vector];
  changed[part.index] = value;
  return changed;
}

/** A field of a line, read once per run. */
interface SolidScriptLineField {
  /** Field text, or its default. */
  text: string;
  /** Caption, for messages. */
  label: string;
  /** Closure that reads its value. */
  compiled: SolidScriptFieldCompiled;
}

/**
 * Matrix and flatness of a Function run inside a formula; shared, since such a
 * run builds no shapes and every block copies a matrix before changing it.
 */
const SOLID_SCRIPT_FORMULA_CONTEXT: SolidScriptContext = { matrix: new THREE.Matrix4(), planar: false };

/**
 * Field text and compiled closures of each line, kept across runs: a line's
 * values never change (an edit makes new lines), and the closures, with the
 * formulas they parse on first use, read nothing of a run but its context.
 */
const SOLID_SCRIPT_LINE_FIELDS = new WeakMap<object, Map<string, SolidScriptLineField>>();

/** Thrown through a formula when a Function inside it reached the pause. */
class SolidScriptPause extends Error {}

/**
 * Runs the lines of a script directly, one block after the other. A machine
 * runs one script once: every run makes a new machine, so no variable, counter,
 * part or mistake carries over to the next run or another generator.
 */
export class SolidScriptMachine<Command extends SolidScriptMachineCommand> {
  private readonly expressions = new SolidScriptExpressionEvaluator(
    () => this.workTake(),
    (name, values) => this.functionCall(name, values),
    (name) => this.systemRead(name),
  );
  private readonly messages: string[] = [];
  private readonly steps: number[] = [];
  private readonly readOnly = new Map<string, string>();
  private readonly parts = new Map<string, SolidScriptPart<Command>>();
  /** Function blocks by name. */
  private readonly functions = new Map<string, SolidScriptBlockNode<Command>>();
  /** Input names of each Function block. */
  private readonly functionParameters = new Map<SolidScriptBlockNode<Command>, readonly string[]>();
  /** Functions and parts running inside each other, innermost last. */
  private readonly stack: SolidScriptFrame[] = [];
  /** The stack as it was at the watched step. */
  private stackSeen: SolidScriptFrameView[] = [];
  /** When Input Changes and When Button Pressed blocks, in line order. */
  private readonly handlers: SolidScriptBlockNode<Command>[] = [];
  /** True while an inspector event runs its handlers. */
  private handling = false;
  private readonly inputsChanged: Record<string, string> = {};
  /** Stored persistent names the handlers deleted. */
  private readonly inputsRemoved = new Set<string>();
  /** Variables kept with the generator between runs, by bare name. */
  private readonly persistent = new SolidScriptScope(null);
  private readonly notices: string[] = [];
  private root = new SolidScriptScope(null);
  private solids = 0;
  private line = 0;
  private work = 0;
  private used = false;
  private readonly breaks: SolidScriptBreak[] = [];
  /** Shapes built by each running block so far, innermost last. */
  private readonly builtStack: SolidScriptShape[][] = [];
  /** Faces the last Select Faces line picked. */
  private faceSelection: SolidScriptFaceFacts[] = [];
  /** Faces of the For Each Selected Face rounds running, innermost last. */
  private readonly faceRounds: (SolidScriptFaceFacts | null)[] = [];
  /** Run views of lines, made once per line. */
  private readonly lineRuns = new Map<SolidScriptBlockNode<Command>, SolidScriptLineRun>();
  /** Field text and compiled closures of each line, by field key. */
  /**
   * Line lists whose definitions are registered, so a Function called often
   * registers once.
   */
  private readonly registered = new WeakSet<readonly SolidScriptBlockNode<Command>[]>();
  /** What each swapped solid or mesh became. */
  private readonly leafSwaps = new Map<SolidScriptGeometryLeaf, SolidScriptGeometryLeaf>();
  /**
   * Points being gathered by the Polyhedron or Polygon blocks around the
   * running line, innermost last.
   */
  private readonly gathering: SolidScriptGathering[] = [];
  /** True from a Return line until the part it leaves has stopped. */
  private leaving = false;
  private watched: SolidScriptScope | null = null;
  private failure: SolidScriptFailure | null = null;
  private paused: SolidScriptBreak | null = null;
  /** Count and time of each line, when profiling. */
  private readonly profile = new Map<number, SolidScriptLineProfile>();
  /** Lines being timed now, so a line that calls itself is timed once. */
  private readonly profiled = new Set<number>();

  /**
   * Creates a machine.
   *
   * @param stepLimit Shapes to build; later shapes are only counted.
   * @param breakpoints Lines to record or pause at, or null.
   * @param inputs Inspector values of the script's Input lines, by name.
   * @param system Built-in values.
   * @param profiling True to count and time every line.
   */
  constructor(
    private readonly stepLimit = Number.POSITIVE_INFINITY,
    private readonly breakpoints: SolidScriptBreakpoints | null = null,
    private readonly inputs: Readonly<Record<string, string>> = {},
    private readonly system: SolidScriptSystemReader = { get: () => undefined },
    private readonly profiling = false,
  ) {}

  /**
   * Runs a script once, from the top. Function, part and event handler blocks
   * are skipped to their End; their lines run when they are called.
   *
   * @param lines Top-level lines.
   * @returns Shapes, output, steps and the first mistake.
   */
  run(lines: SolidScriptBlockNode<Command>[]): SolidScriptRun {
    this.useOnce();
    const context = { matrix: new THREE.Matrix4(), planar: false };
    const shapes = this.linesRun(lines, this.root, context, this.root);
    const variables = [...(this.watched?.variablesVisible() ?? [])].map(([name, value]) =>
      solidScriptVariableView(name, value),
    );
    if (!this.failure && !this.paused && this.steps.length === 0)
      this.failure = solidScriptFailure(null, 'the script builds no shapes; add a shape such as Cube');
    return {
      shapes,
      messages: this.messages,
      steps: this.steps,
      variables,
      breaks: this.breaks,
      paused: this.paused,
      stack: this.stackSeen,
      profile: this.profile,
      error: this.failure,
    };
  }

  /**
   * Runs the handler blocks of an inspector event instead of the script: a
   * fresh run where only the Input lines and the matching When Input Changes or
   * When Button Pressed blocks run, so values can be checked, clamped with Set
   * Input and explained with Show Message without building anything.
   *
   * @param lines Top-level lines.
   * @param event Event that happened.
   * @returns Changed inputs, messages and the first mistake.
   */
  handle(lines: SolidScriptBlockNode<Command>[], event: SolidScriptEvent): SolidScriptHandled {
    this.useOnce();
    this.handling = true;
    const context = { matrix: new THREE.Matrix4(), planar: false };
    this.definitionsRegister(lines);
    for (const node of lines) if (node.command.id === 'input') this.lineRun(node, this.root, context);
    const id = SOLID_SCRIPT_HANDLERS[event.kind];
    for (const handler of this.handlers) {
      if (handler.command.id !== id || handler.command.valueText(handler.values, 'name').trim() !== event.name)
        continue;
      if (handler.children.length > 0) this.linesRun(handler.children, this.root, context);
      if (this.steps.length > 0 && !this.failure)
        this.failure = solidScriptFailure(
          this.steps[0] ?? handler.line,
          `line ${this.steps[0] ?? handler.line}: ${handler.command.label} blocks only check and change inputs; shapes are built by the script from the top`,
        );
    }
    return {
      inputs: this.inputsChanged,
      removed: [...this.inputsRemoved],
      notices: this.notices,
      messages: this.messages,
      error: this.failure,
    };
  }

  /** Marks the machine used; a machine runs once. */
  private useOnce(): void {
    if (this.used) throw new Error('a script machine runs once; make a new one for every run');
    this.used = true;
    for (const [name, value] of solidScriptPersistentRead(this.inputs)) this.persistent.variableDefine(name, value);
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
    this.definitionsRegister(lines);
    const built: SolidScriptShape[] = [];
    this.builtStack.push(built);
    try {
      for (const node of lines) built.push(...this.lineRun(node, scope, context));
    } finally {
      this.builtStack.pop();
    }
    return built;
  }

  /**
   * Registers the parts, functions and event handler blocks among lines, so
   * they are known before the lines run.
   *
   * @param lines Lines.
   */
  private definitionsRegister(lines: readonly SolidScriptBlockNode<Command>[]): void {
    if (this.registered.has(lines)) return;
    this.registered.add(lines);
    for (const node of lines) {
      if (node.command.id === 'part') this.guarded(node.line, () => this.partDefine(node));
      if (node.command.id === 'function') this.guarded(node.line, () => this.functionDefine(node));
      if (
        (node.command.id === SOLID_SCRIPT_HANDLERS.input || node.command.id === SOLID_SCRIPT_HANDLERS.button) &&
        !this.handlers.includes(node)
      )
        this.handlers.push(node);
    }
  }

  /**
   * Registers a Define Function line under its name.
   *
   * @param node Define Function line.
   */
  private functionDefine(node: SolidScriptBlockNode<Command>): void {
    const name = node.command.valueText(node.values, 'name');
    this.nameCheck(name, 'a function');
    if (SOLID_SCRIPT_FUNCTIONS_BUILTIN[name] || name === 'PI')
      throw new Error(`${name}() is a built-in function; pick another name`);
    const known = this.functions.get(name);
    if (known && known !== node) throw new Error(`a function named "${name}" is already defined on line ${known.line}`);
    for (const parameter of solidScriptFunctionParameters(node.command.valueText(node.values, 'parameters')))
      this.nameCheck(parameter, 'a function input');
    this.functions.set(name, node);
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
  private functionRun(
    name: string,
    values: readonly SolidScriptValue[],
    context: SolidScriptContext,
  ): { shapes: SolidScriptShape[]; value: SolidScriptValue } | null {
    const node = this.functions.get(name);
    if (!node) return null;
    let parameters = this.functionParameters.get(node);
    if (!parameters) {
      parameters = solidScriptFunctionParameters(node.command.valueText(node.values, 'parameters'));
      this.functionParameters.set(node, parameters);
    }
    if (values.length !== parameters.length)
      throw new Error(
        `${name}() takes ${parameters.length} value(s) (${parameters.join(', ') || 'none'}), not ${values.length}`,
      );
    if (this.stack.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `functions and parts run inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep. A function that calls itself needs an If that stops it`,
      );
    const locals = new SolidScriptScope(null);
    parameters.forEach((parameter, index) => locals.variableDefine(parameter, values[index]));
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
  private functionCall(name: string, values: readonly SolidScriptValue[]): { value: SolidScriptValue } | null {
    const before = this.steps.length;
    const run = this.functionRun(name, values, SOLID_SCRIPT_FORMULA_CONTEXT);
    if (!run) {
      const looked = solidScriptGeometryLookup(name, values, () => this.builtStack.flat());
      return looked === undefined ? null : { value: looked };
    }
    if (this.paused) throw new SolidScriptPause();
    if (this.failure) throw new Error(this.failure.message);
    if (this.steps.length > before)
      throw new Error(`${name}() builds shapes, so use it with a Call line, not inside a formula`);
    if (run.value === undefined) throw new Error(`${name}() gives no value; end it with a Return that has a Value`);
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
  private functionCallLine(
    name: string,
    values: readonly SolidScriptValue[],
    result: string | null,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    const run = this.functionRun(name, values, context);
    if (!run) {
      const known = [...this.functions.keys()].sort();
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
   * Returns the innermost Function running.
   *
   * @returns Frame, or undefined outside every Function.
   */
  private frameFunction(): SolidScriptFrame | undefined {
    for (let index = this.stack.length - 1; index >= 0; index--)
      if (this.stack[index]?.kind === 'function') return this.stack[index];
    return undefined;
  }

  /**
   * Finds where a variable name lives: [local.x] in the innermost Function's
   * own variables, any other name in the scopes of the running line.
   *
   * @param name Name as written.
   * @param scope Scope of the running line.
   * @returns Scope and the name without the prefix.
   */
  private variableWhere(
    name: string,
    scope: SolidScriptScope,
  ): { scope: SolidScriptScope; name: string; local: boolean; persistent: boolean } {
    if (name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX))
      return {
        scope: this.persistent,
        name: name.slice(SOLID_SCRIPT_PERSISTENT_PREFIX.length),
        local: false,
        persistent: true,
      };
    if (!name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX)) return { scope, name, local: false, persistent: false };
    const bare = name.slice(SOLID_SCRIPT_LOCAL_PREFIX.length);
    const frame = this.frameFunction();
    if (!frame?.locals)
      throw new Error(
        `[${name}] is a local variable, and local. only works inside a Function; outside one, write [${bare}]`,
      );
    return { scope: frame.locals, name: bare, local: true, persistent: false };
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
    if (SOLID_SCRIPT_DEFINITIONS.has(node.command.id) || this.breakReached(node.line, scope)) return [];
    if (this.profiling) return this.lineProfiled(node, scope, context);
    return this.lineExecute(node, scope, context);
  }

  /**
   * Runs one line that is not a definition and not paused at.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @returns Shapes.
   */
  private lineExecute(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    return (
      this.guarded(node.line, () => {
        const line = this.runOf(node, scope, context);
        line.busy = true;
        try {
          return node.command.execute(line.run);
        } finally {
          line.busy = false;
        }
      }) ?? []
    );
  }

  /**
   * Runs one line and adds its count and time to the profile; a line that calls
   * itself is timed once, by its outermost run.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @returns Shapes.
   */
  private lineProfiled(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
  ): SolidScriptShape[] {
    if (this.failure || this.paused || this.leaving) return [];
    let entry = this.profile.get(node.line);
    if (!entry) this.profile.set(node.line, (entry = { count: 0, ms: 0 }));
    entry.count += 1;
    if (this.profiled.has(node.line)) return this.lineExecute(node, scope, context);
    this.profiled.add(node.line);
    const started = performance.now();
    try {
      return this.lineExecute(node, scope, context);
    } finally {
      this.profiled.delete(node.line);
      entry.ms += performance.now() - started;
    }
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
    this.watch(scope);
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
      if (this.paused) return undefined;
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
  ): SolidScriptLineRun {
    const known = this.lineRuns.get(node);
    if (known && !known.busy) {
      known.state.scope = scope;
      known.state.context = context;
      return known;
    }
    const made: SolidScriptLineRun = {
      run: null as unknown as SolidScriptBlockRun,
      state: { scope, context },
      busy: false,
    };
    made.run = this.runBuild(node, made.state);
    if (!known) this.lineRuns.set(node, made);
    return made;
  }

  /**
   * Builds what a running line can read and do, once per line: its closures
   * read the scope and context of the current run of the line from state.
   *
   * @param node Line.
   * @param state Scope and context of the run, changed before every run.
   * @returns Run view of the line.
   */
  private runBuild(node: SolidScriptBlockNode<Command>, state: SolidScriptLineState): SolidScriptBlockRun {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getters below need the machine.
    const machine = this;
    const labelOf = (): string => state.scope.partName || node.command.id;
    const inside = (into: SolidScriptContext, lines = node.children): SolidScriptShape[] => {
      if (lines.length === 0) throw new Error(`${node.command.label} has nothing inside; add a shape before its End`);
      return this.linesRun(lines, state.scope, into);
    };
    const value = (key: string): SolidScriptValue => this.fieldValue(node, key, state.scope);
    return {
      values: (key) =>
        solidScriptArgumentsSplit(node.command.valueText(node.values, key)).map((piece, index) => {
          try {
            return solidScriptFieldResolve('value', piece, this.fieldContext(state.scope));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`value ${index + 1}: ${message}`);
          }
        }),
      get planar() {
        return state.context.planar;
      },
      fields: () => {
        const values = new Map<string, SolidScriptValue>();
        const labels = new Map<string, string>();
        for (const field of node.command.parameters) {
          labels.set(field.key, field.label);
          if (!SOLID_SCRIPT_TEXT_FIELDS.has(field.type)) values.set(field.key, value(field.key));
        }
        return new SolidScriptBlockArguments(values, labels);
      },
      text: (key) => this.fieldOf(node, key).text,
      value,
      variableSet: (name, assigned) => this.variableSet(state.scope, name, assigned),
      solid: (points) => {
        this.gatherCheck(node);
        this.flatCheck(node, state.context, false);
        if (!this.stepTake(state.scope)) return [];
        return [
          { kind: 'solid', label: labelOf(), points: points.map((point) => point.applyMatrix4(state.context.matrix)) },
        ];
      },
      outline: (points) => {
        this.gatherCheck(node);
        this.flatCheck(node, state.context, true);
        if (!this.stepTake(state.scope)) return [];
        const moved = points.map(([x, y]): SolidScriptPoint2 => {
          const point = new THREE.Vector3(x, y, 0).applyMatrix4(state.context.matrix);
          return [point.x, point.y];
        });
        return [{ kind: 'polygon', label: labelOf(), points: moved }];
      },
      transformed: (matrix) => inside({ ...state.context, matrix: state.context.matrix.clone().multiply(matrix) }),
      combined: (operation) => this.combine(node, operation, state.scope, state.context, labelOf()),
      hulled: () => {
        const leaves = inside(state.context).flatMap(solidScriptShapeLeavesPositive);
        if (leaves.length === 0) return [];
        if (state.context.planar)
          return [
            {
              kind: 'polygon',
              label: labelOf(),
              points: solidScriptPolygonHull(leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? leaf.points : []))),
            },
          ];
        return [
          {
            kind: 'solid',
            label: labelOf(),
            points: leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? [] : leaf.points)),
          },
        ];
      },
      extruded: (fields) => {
        if (state.context.planar) throw new Error('Linear Extrude cannot be inside another Linear Extrude');
        const flat = solidScriptShapeJoin(inside({ matrix: new THREE.Matrix4(), planar: true }), labelOf());
        return flat ? [solidScriptExtrude(flat, fields, state.context.matrix)] : [];
      },
      repeated: (counter, values) => {
        this.nameCheck(counter, 'a counter');
        this.writableCheck(counter);
        const shapes = values.flatMap((round) => {
          this.workTake();
          const inner = new SolidScriptScope(state.scope);
          inner.variableDefine(counter, round);
          return node.children.length === 0 ? [] : this.linesRun(node.children, inner, state.context, inner);
        });
        const joined = solidScriptShapeJoin(shapes, labelOf());
        return joined ? [joined] : [];
      },
      branched: (holds) => {
        const lines = holds ? node.children : (node.otherwise ?? []);
        return lines.length === 0 ? [] : this.linesRun(lines, state.scope, state.context);
      },
      partUse: (name) => this.partUse(name, state.scope, state.context),
      built: () => this.builtStack.flat(),
      selection: () => [...this.faceSelection],
      selectionSet: (faces) => {
        this.faceSelection = [...faces];
      },
      faceCurrent: () => this.faceRounds.at(-1) ?? null,
      looped: (rounds) => {
        const shapes = rounds.flatMap((round) => {
          this.workTake();
          const inner = new SolidScriptScope(state.scope);
          for (const [name, value] of Object.entries(round.variables)) inner.variableDefine(name, value);
          this.faceRounds.push(round.face);
          try {
            return node.children.length === 0 ? [] : this.linesRun(node.children, inner, state.context, inner);
          } finally {
            this.faceRounds.pop();
          }
        });
        const joined = solidScriptShapeJoin(shapes, labelOf());
        return joined ? [joined] : [];
      },
      framed: (matrix) => inside({ ...state.context, matrix }),
      leafLatest: (leaf) => {
        let latest = leaf;
        for (let next = this.leafSwaps.get(latest); next; next = this.leafSwaps.get(latest)) latest = next;
        return latest;
      },
      leafReplace: (leaf, by) => {
        this.leafSwaps.set(leaf, by);
        for (const built of this.builtStack)
          built.forEach((shape, index) => {
            built[index] = solidScriptShapeMapLeaves(shape, (found) => (found === leaf ? by : found));
          });
      },
      adopted: (shapes) => shapes.filter(() => this.stepTake(state.scope)),
      gathered: (what) => {
        const into: SolidScriptGathering = { kind: what, points: [], uvs: [], faces: [] };
        this.gathering.push(into);
        try {
          if (node.children.length > 0)
            this.linesRun(node.children, state.scope, { matrix: new THREE.Matrix4(), planar: state.context.planar });
        } finally {
          this.gathering.pop();
        }
        return into;
      },
      local: (planar) => inside({ matrix: new THREE.Matrix4(), planar }),
      placed: (shapes) => shapes.map((shape) => solidScriptShapeTransform(shape, state.context.matrix)),
      leave: (returned) => {
        const frame = this.stack[this.stack.length - 1];
        if (!frame) throw new Error('Return leaves a Function or a part, so it only works inside one of them');
        if (returned !== undefined) {
          if (frame.kind !== 'function')
            throw new Error('a Return with a Value only works in a Function; a part hands back results in variables');
          frame.returned = { value: returned };
        }
        this.leaving = true;
        return [];
      },
      call: (name, values, result) => this.functionCallLine(name, values, result, state.scope, state.context),
      get handling() {
        return machine.handling;
      },
      inputSet: (name, assigned) => {
        if (!this.handling)
          throw new Error(
            'Set Input only works in When Input Changes or When Button Pressed; the inspector sets inputs',
          );
        if (this.readOnly.get(name) !== 'input')
          throw new Error(`there is no input "${name}"; add an Input line for it`);
        this.root.variableSet(name, assigned);
        this.inputsChanged[name] = solidScriptValueText(assigned);
      },
      notice: (text) => {
        if (!this.handling)
          throw new Error('Show Message only works in When Input Changes or When Button Pressed; use Echo here');
        this.notices.push(text);
      },
      point: (position, uv) => {
        const into = this.gathering[this.gathering.length - 1];
        if (!into)
          throw new Error(`a ${node.command.label} belongs between a Polyhedron, Polygon or Mesh line and its End`);
        if (node.command.id === 'vertex' && into.kind !== 'mesh')
          throw new Error('a Vertex belongs in a Mesh; use Point lines in a Polyhedron or Polygon');
        if (node.command.id !== 'vertex' && into.kind === 'mesh')
          throw new Error('a Mesh takes Vertex lines; Point lines belong in a Polyhedron or Polygon');
        into.points.push(position.clone().applyMatrix4(state.context.matrix));
        into.uvs.push(uv);
        return [];
      },
      face: (corners) => {
        const into = this.gathering[this.gathering.length - 1];
        if (into?.kind !== 'mesh') throw new Error('a Face belongs between a Mesh line and its End');
        into.faces.push([...corners]);
        return [];
      },
      mesh: (mesh) => {
        this.gatherCheck(node);
        this.flatCheck(node, state.context, false);
        if (!this.stepTake(state.scope)) return [];
        return [solidScriptMeshChecked(solidScriptMeshTransform({ ...mesh, label: labelOf() }, state.context.matrix))];
      },
      valueWith: (key, variables) => {
        const inner = new SolidScriptScope(state.scope);
        for (const [name, assigned] of Object.entries(variables)) inner.variableDefine(name, assigned);
        return this.fieldValue(node, key, inner);
      },
      print: (text) => {
        this.messages.push(text);
        return [];
      },
      inputValue: (name) => this.inputs[name],
      inputDefine: (name, value) => {
        this.nameCheck(name, 'an input');
        if (this.readOnly.has(name)) throw new Error(`an input named "${name}" is already defined`);
        if (state.scope.variableHas(name))
          throw new Error(`"${name}" is already a variable; inputs come before the lines that use them`);
        state.scope.variableDefine(name, value);
        this.readOnly.set(name, 'input');
      },
      listRead: (name) => this.listRead(state.scope, name),
      listUpdate: (name, change, create) => {
        const where = this.variableWhere(name, state.scope);
        if (!create || where.scope.variableHas(where.name)) {
          this.variableSet(state.scope, name, change(this.listRead(state.scope, name)));
          return;
        }
        this.variableSet(state.scope, name, change([]));
      },
      variableDelete: (name) => {
        const where = this.variableWhere(name, state.scope);
        if (!where.local) this.writableCheck(where.name);
        if (!where.scope.variableDelete(where.name))
          throw new Error(`there is no variable [${name}] to delete; set it on a line above this one`);
        if (where.persistent) this.persistentKeep(where.name);
      },
      variableClear: (name) => {
        const where = this.variableWhere(name, state.scope);
        // A name not set yet becomes an empty list, ready for Add Item.
        const old = where.scope.variableHas(where.name) ? where.scope.variableGet(where.name) : [];
        this.variableSet(state.scope, name, Array.isArray(old) ? [] : '');
      },
      itemRemove: (target) => {
        const where = this.variableWhere(target, state.scope);
        const item = solidScriptListItemParse(where.name);
        if (!item || item.method)
          throw new Error(`"${target}" is not a list item; write list(2), or list() for the last item`);
        if (!where.local) this.writableCheck(item.name);
        if (!where.scope.variableHas(item.name))
          throw new Error(`there is no variable [${target.replace(/\(.*$/, '')}]; set it on a line above this one`);
        const index = item.index === '' ? null : this.indexValue(item.index, state.scope);
        where.scope.variableSet(
          item.name,
          solidScriptListItemRemove(item.name, where.scope.variableGet(item.name), index),
        );
        if (where.persistent) this.persistentKeep(item.name);
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
    const field = this.fieldOf(node, key);
    try {
      return field.compiled(this.fieldContext(scope));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${field.label}: ${message}`);
    }
  }

  /**
   * Returns a line's field text and compiled closure, worked out once per line.
   *
   * @param node Line.
   * @param key Field key.
   * @returns Field.
   */
  private fieldOf(node: SolidScriptBlockNode<Command>, key: string): SolidScriptLineField {
    let fields = SOLID_SCRIPT_LINE_FIELDS.get(node);
    if (!fields) {
      fields = new Map();
      SOLID_SCRIPT_LINE_FIELDS.set(node, fields);
    }
    let field = fields.get(key);
    if (!field) {
      const parameter = node.command.parameters.find((entry) => entry.key === key);
      const text = node.command.valueText(node.values, key);
      field = {
        text,
        label: parameter?.label ?? key,
        compiled: solidScriptFieldCompiled(parameter?.type ?? 'value', text),
      };
      fields.set(key, field);
    }
    return field;
  }

  /**
   * Gives field text access to the variables of a scope and to formulas.
   *
   * @param scope Scope.
   * @returns Context.
   */
  private fieldContext(scope: SolidScriptScope): SolidScriptFieldContext {
    return (scope.fieldContext ??= this.fieldContextBuild(scope));
  }

  /**
   * Builds what field text reads in a scope.
   *
   * @param scope Scope.
   * @returns Context.
   */
  private fieldContextBuild(scope: SolidScriptScope): SolidScriptFieldContext {
    return {
      variable: (name) => {
        // Plain names, the most common read, take one walk out.
        if (!name.includes('.') && !name.includes('(')) {
          const home = scope.variableHome(name);
          if (home) return home.variableOwn(name);
        } else if (name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX)) {
          // A Function's own input or variable, the common read inside one.
          const locals = this.frameFunction()?.locals;
          const bare = name.slice(SOLID_SCRIPT_LOCAL_PREFIX.length);
          if (locals?.variableHas(bare)) return locals.variableOwn(bare);
        } else {
          const builtIn = this.systemRead(name);
          if (builtIn !== undefined) return builtIn;
        }
        const where = this.variableWhere(name, scope);
        const item = solidScriptListItemParse(where.name);
        const base = item?.name ?? where.name;
        if (!item && !where.scope.variableHas(base)) {
          const component = solidScriptVectorComponent(base);
          if (component && where.scope.variableHas(component.name))
            return solidScriptVectorComponentRead(component, where.scope.variableGet(component.name));
        }
        if (!where.scope.variableHas(base)) {
          if (where.persistent && !item) return undefined;
          const written = where.local ? `${SOLID_SCRIPT_LOCAL_PREFIX}${base}` : base;
          throw new Error(
            where.local
              ? `there is no local variable [${written}]; it is an input of the Function or set with Set ${written}`
              : `there is no variable [${written}]; set it on a line above this one`,
          );
        }
        if (!item) return where.scope.variableGet(base);
        const index = item.index === '' ? null : this.indexValue(item.index, scope);
        return solidScriptListItemRead(base, where.scope.variableGet(base), index, item.method);
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
      formulaParse: (text) => {
        try {
          return solidScriptExpressionParse(text);
        } catch {
          return null;
        }
      },
      formulaRun: (expression, slots) => this.expressions.evaluateSlots(expression, slots, scope),
    };
  }

  /**
   * Notes a changed persistent value so the inspector stores it. Only When
   * Button Pressed and When Input Changes blocks store values; the normal build
   * may change them for its own run, so every rebuild gives the same shape.
   *
   * @param name Bare name.
   */
  private persistentKeep(name: string): void {
    if (!this.handling) return;
    const key = `${SOLID_SCRIPT_PERSISTENT_PREFIX}${name}`;
    if (!this.persistent.variableHas(name)) {
      delete this.inputsChanged[key];
      this.inputsRemoved.add(key);
      return;
    }
    this.inputsRemoved.delete(key);
    this.inputsChanged[key] = JSON.stringify(this.persistent.variableGet(name));
  }

  /**
   * Reads a list variable.
   *
   * @param scope Scope of the line.
   * @param name Name.
   * @returns Items.
   */
  private listRead(scope: SolidScriptScope, name: string): readonly SolidScriptValue[] {
    const where = this.variableWhere(name, scope);
    if (!where.scope.variableHas(where.name))
      throw new Error(`there is no list [${name}]; make one with Add Item or Set ${name}()`);
    const value = where.scope.variableGet(where.name);
    if (!Array.isArray(value)) throw new Error(`[${name}] is ${solidScriptValueType(value)}, not a list`);
    return value;
  }

  /**
   * Reads a built-in value such as Time.Year, or a part of one such as
   * Box.Size.x.
   *
   * @param name Name as written.
   * @returns Value, or undefined when the name is not a built-in value.
   */
  private systemRead(name: string): SolidScriptValue {
    const dot = name.indexOf('.');
    const first = name.charCodeAt(0);
    if (first < 65 || first > 90 || dot < 0 || !SOLID_SCRIPT_SYSTEM_GROUPS.has(name.slice(0, dot))) return undefined;
    const value = this.system.get(name);
    if (value !== undefined) return value;
    const part = solidScriptVectorComponent(name);
    const whole = part ? this.system.get(part.name) : undefined;
    if (part && whole !== undefined) return solidScriptVectorComponentRead(part, whole);
    const base = part && SOLID_SCRIPT_SYSTEM_NAMES.has(part.name) ? part.name : name;
    if (SOLID_SCRIPT_SYSTEM_NAMES.has(base))
      throw new Error(`[${base}] is only known when the script runs in a generator, where there is a box`);
    return undefined;
  }

  /**
   * Sets a variable after checking its name and that lines may change it.
   *
   * @param scope Scope of the line.
   * @param name Name.
   * @param value Value.
   */
  private variableSet(scope: SolidScriptScope, name: string, value: SolidScriptValue): void {
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) {
      this.writableCheck(name);
      const home = this.frameFunction() && !scope.variableHas(name) ? this.root : scope;
      home.variableSet(name, value);
      return;
    }
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? name.slice(SOLID_SCRIPT_LOCAL_PREFIX.length) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) {
      locals.variableSet(bare, value);
      return;
    }
    const where = this.variableWhere(name, scope);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name)) {
      if (!where.scope.variableHas(component.name))
        throw new Error(
          `there is no vector [${component.name}] to change; set it first, such as Set ${component.name} to 0, 0, 0`,
        );
      const vector = where.scope.variableGet(component.name);
      if (!where.local && !where.persistent) this.writableCheck(component.name);
      where.scope.variableSet(component.name, solidScriptVectorComponentWrite(component, vector, value));
      if (where.persistent) this.persistentKeep(component.name);
      return;
    }
    const item = solidScriptListItemParse(where.name);
    if (item?.method) throw new Error(`${item.name}().${item.method} can only be read`);
    const base = item?.name ?? where.name;
    this.nameCheck(base, 'a variable');
    if (!where.local) this.writableCheck(base);
    const home =
      !where.local && !where.persistent && this.frameFunction() && !scope.variableHas(base) ? this.root : where.scope;
    if (!item) home.variableSet(base, value);
    else {
      const index = item.index === '' ? null : this.indexValue(item.index, scope);
      home.variableSet(base, solidScriptListItemWrite(base, home.variableGet(base), index, value));
    }
    if (where.persistent) this.persistentKeep(base);
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
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) return;
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot name ${what}; use letters, digits and _, not starting with a digit`);
    if (SOLID_SCRIPT_NAMES_PLAIN.size < 20000) SOLID_SCRIPT_NAMES_PLAIN.add(name);
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
    if (operation !== 'union' && operands.some(solidScriptShapeHasMesh))
      throw new Error(
        `${node.command.label} cuts brushes, and a mesh cannot be cut; keep meshes outside it, or build the cut from brushes and wrap it in Mesh From Shapes`,
      );
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
    if (this.stack.length >= SOLID_SCRIPT_PART_DEPTH_MAX)
      throw new Error(
        `functions and parts run inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep. A part that uses itself needs an If that stops it`,
      );
    if (part.node.children.length === 0) throw new Error(`part "${name}" has nothing inside`);
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
   * Records one shape step at the current line.
   *
   * @param scope Scope of the shape, watched while the step gets built.
   * @returns True while the step is within the step limit and gets built.
   */
  private stepTake(scope: SolidScriptScope): boolean {
    this.steps.push(this.line);
    if (this.steps.length > this.stepLimit) return false;
    this.watch(scope);
    this.solids += 1;
    if (this.solids > SOLID_SCRIPT_SOLIDS_MAX)
      throw new Error(`the script builds more than ${SOLID_SCRIPT_SOLIDS_MAX} shapes`);
    return true;
  }

  /**
   * Remembers the scope and the call stack of a step, for the debugger.
   *
   * @param scope Scope of the running line.
   */
  private watch(scope: SolidScriptScope): void {
    this.watched = scope;
    this.stackSeen = this.stack.map((frame) => ({
      name: frame.kind === 'function' ? `${frame.name}()` : `part ${frame.name}`,
      line: frame.line,
      locals: [...(frame.locals?.variablesVisible() ?? [])].map(([name, value]) =>
        solidScriptVariableView(`${SOLID_SCRIPT_LOCAL_PREFIX}${name}`, value),
      ),
    }));
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
 * Splits a field of values at the commas outside brackets and parentheses, so
 * [=max(1, 2)], 3 is two values.
 *
 * @param text Field text.
 * @returns Trimmed pieces; none for an empty field.
 */
export function solidScriptArgumentsSplit(text: string): string[] {
  if (text.trim() === '') return [];
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '$') index++;
    else if (character === '[' || character === '(') depth++;
    else if (character === ']' || character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      pieces.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  pieces.push(text.slice(start).trim());
  return pieces;
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
