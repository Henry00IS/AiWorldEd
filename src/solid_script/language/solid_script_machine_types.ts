import type { SolidScriptCommandAccepts } from '@/solid_script/commands/solid_script_command.js';
import type * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptTreeCommand } from './solid_script_block_tree.js';
import type { SolidScriptFieldKind } from './solid_script_field.js';
import type { SolidScriptElements } from './solid_script_elements.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import type { SolidScriptSelectedKind } from './solid_script_machine_variables.js';
import type { SOLID_SCRIPT_HANDLERS } from './solid_script_machine_calls.js';
import type { SolidScriptShapeMesh, SolidScriptUv } from './solid_script_mesh.js';
import type { SolidScriptPoint2 } from './solid_script_polygon.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import type { SolidScriptShape, SolidScriptShapeLeaf } from './solid_script_shape.js';
import type { SolidScriptUseFacts } from './solid_script_system.js';
import type { SolidScriptValue } from './solid_script_value.js';

/** One field of a command, as the machine reads it. */
export interface SolidScriptMachineField {
  key: string;
  label: string;
  type: SolidScriptFieldKind;
  /** Kinds of value the field accepts; a running line stops on any other. */
  accepts: SolidScriptCommandAccepts;
  /**
   * Set when the field names a variable or another name the line writes or
   * defines: only such a field is used as typed; every other field reads its
   * [names] and [=formulas].
   */
  writes?: object;
}

/** What the machine needs from a command: its structure and its own run step. */
export interface SolidScriptMachineCommand extends SolidScriptTreeCommand {
  /** Stable id; also names the brushes it builds outside a part. */
  readonly id: string;
  /** Fields of the line. */
  readonly parameters: readonly SolidScriptMachineField[];
  /**
   * True for blocks that build brushes or meshes and write them Into a
   * variable.
   */
  readonly builds?: boolean;
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

/**
 * Which block gathers: corner points only, a mesh's vertices and faces, or a
 * Hull that also wraps brushes.
 */
export type SolidScriptGatherKind = 'points' | 'mesh' | 'hull';

/** What the Point, Vertex and Face lines inside a block added. */
export interface SolidScriptGathered {
  points: THREE.Vector3[];
  /** Texture coordinate per point, or null when the Vertex has none. */
  uvs: (SolidScriptUv | null)[];
  faces: number[][];
}

/** A block gathering lines, innermost last. */
export interface SolidScriptGathering extends SolidScriptGathered {
  kind: SolidScriptGatherKind;
}

/** The Key variable of a For Each round: its name and the key of every round. */
export interface SolidScriptRoundKey {
  name: string;
  keys: readonly SolidScriptValue[];
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
  /**
   * Reads a field the way Set does: commas typed outside brackets make a list
   * of the items, each read on its own; one item stays one value.
   */
  valueItems(key: string): SolidScriptValue;
  /**
   * Reads a list field: only the commas typed in the field separate items, so
   * [Text], 23 is two items whatever Text holds.
   */
  list(key: string): SolidScriptValue[];
  /** Works out a field of values separated by commas, such as [i], 0.2. */
  values(key: string): SolidScriptValue[];
  /** Sets a variable, where it already exists or else in the current block. */
  variableSet(name: string, value: SolidScriptValue): void;
  /**
   * Writes a Set value, evaluating a Vertex.Position formula once per corner
   * with $Vertex and $Index.
   */
  variableWrite(name: string, key: string): void;
  /** Builds one convex solid from its corner points. */
  solid(points: THREE.Vector3[]): SolidScriptShape[];
  /** Draws one flat outline for Linear Extrude. */
  outline(points: SolidScriptPoint2[]): SolidScriptShape[];
  /** Runs the lines inside, moved by a matrix. */
  transformed(matrix: THREE.Matrix4): SolidScriptShape[];
  /**
   * Runs the lines inside and wraps their results and extra corners in one
   * convex shape.
   */
  hulled(extra?: readonly THREE.Vector3[]): SolidScriptShape[];
  /** Runs the flat lines inside and pulls them up into solids. */
  extruded(fields: SolidScriptBlockArguments): SolidScriptShape[];
  /** Runs the lines inside once per value, with the counter set to it. */
  repeated(counter: string, values: readonly SolidScriptValue[], key?: SolidScriptRoundKey): SolidScriptShape[];
  /** Runs the lines inside, or the lines after Else, depending on a condition. */
  branched(holds: boolean): SolidScriptShape[];
  /**
   * Runs the lines inside as if they stood in place of the block, sharing its
   * variables, so names they define are read after its End.
   */
  inPlace(): SolidScriptShape[];
  /** Stamps a snapshot of a Part or of brushes at this line. */
  outputStamp(value: SolidScriptValue): SolidScriptShape[];
  /** Runs the lines inside and wraps them in a CSG group with Mode. */
  grouped(): SolidScriptShape[];
  /**
   * Builds the lines inside into a variable of the part's name, as a CSG group,
   * and outputs nothing.
   */
  partKeep(): SolidScriptShape[];
  /**
   * Runs the lines inside and returns what their Point, Vertex and Face lines
   * add, moved by the blocks between.
   */
  gathered(what: SolidScriptGatherKind): SolidScriptGathered;
  /**
   * Adds a point to the Polyhedron, Polygon, Hull or Mesh around this line,
   * with its texture coordinate in a Mesh.
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
   * lines after its Call carry on.
   */
  leave(value: SolidScriptValue | undefined): SolidScriptShape[];
  /** Ends the whole run after this line, keeping what was built. */
  stop(): SolidScriptShape[];
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
  /**
   * Brushes, faces, edges and corners of the run, read from the latest
   * geometry.
   */
  readonly elements: SolidScriptElements;
  /** Reads a [$Selected.*] list. */
  selectedGet(kind: SolidScriptSelectedKind): SolidScriptValue[];
  /** Sets a [$Selected.*] list for the rest of the round. */
  selectedSet(kind: SolidScriptSelectedKind, values: readonly SolidScriptValue[]): void;
  /**
   * The values of the line's Of field as one flat list, with Name tags read as
   * the brushes that have them; null when Of is empty.
   */
  ofValues(): SolidScriptValue[] | null;
  /** Remembers the brushes an Input Brushes line built, as [$Input.Brushes]. */
  inputsBuilt(shapes: readonly SolidScriptShape[]): void;
  /** Latest received solids or meshes, after Clip and other writes. */
  receivedLatest(): SolidScriptGeometryLeaf[];
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
  /** Where the script is used, and what a modifier receives. */
  use(): SolidScriptUseFacts;
  /** The move of the Translate, Rotate and other blocks around this line. */
  matrix(): THREE.Matrix4;
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
   * Empties a variable with the empty value of the kind it holds: a list keeps
   * no items, a number becomes 0, a Yes/No No and anything else empty text.
   */
  variableClear(name: string): void;
  /** Writes a line to the output. */
  print(text: string): SolidScriptShape[];
}

/** A warning of a run: the script still runs. */
export interface SolidScriptWarning {
  /** 1-based line, or null for the whole script. */
  line: number | null;
  /** What is wrong. */
  text: string;
}

/** Result of a run. */
export interface SolidScriptEvaluation {
  shapes: SolidScriptShape[];
  messages: string[];
  /** Warnings by line in line order, such as a block with nothing inside. */
  warnings: SolidScriptWarning[];
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
   * System lists such as [$Selected.Faces] where the run paused or reached its
   * step limit, or else where it ended.
   */
  system: SolidScriptVariable[];
  /**
   * 1-based lines that ran up to the last step within the step limit, or else
   * up to where the run paused or ended; empty unless the run was asked to
   * profile.
   */
  passed: number[];
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
  /** 1-based line of the Call that started it. */
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

/**
 * Where lines run: the matrix of the blocks around them, and whether they are
 * flat.
 */
export interface SolidScriptContext {
  matrix: THREE.Matrix4;
  planar: boolean;
}

/** One Function or part running, innermost last on the stack. */
export interface SolidScriptFrame {
  kind: 'function' | 'part';
  name: string;
  /** Line of the Call or formula that started it. */
  line: number;
  /** The Function's own variables, or null for a part. */
  locals: SolidScriptScope | null;
  /** What Return handed back, or null before a Return with a value. */
  returned: { value: SolidScriptValue } | null;
}
