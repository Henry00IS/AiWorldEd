import { solidScriptFunctionInputs } from '../language/solid_script_function_inputs.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';
import {
  solidScriptFlowChanged,
  solidScriptFlowUnique,
  solidScriptFlowItemKinds,
  solidScriptFlowKeyKinds,
  solidScriptFlowValueKinds,
  solidScriptFlowDataWrite,
  solidScriptFlowTypedKeys,
  solidScriptFlowValueKeys,
  SOLID_SCRIPT_FLOW_UNKNOWN,
  type SolidScriptFlowHead,
} from './solid_script_document_flow_kinds.js';
import {
  solidScriptFlowDelete,
  solidScriptFlowEqual,
  solidScriptFlowJoin,
  solidScriptFlowKeysAdd,
  solidScriptFlowLocalsBack,
  solidScriptFlowVariableJoin,
  type SolidScriptFlowVariable,
  solidScriptFlowWrite,
  type SolidScriptFlowState,
} from './solid_script_document_flow_state.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';
import { solidScriptFlowNarrow, solidScriptNarrowJoin } from './solid_script_document_flow_narrow.js';
import { solidScriptFlowTree, type SolidScriptFlowNode } from './solid_script_document_flow_tree.js';
import {
  solidScriptGivenFields,
  solidScriptGivenFlow,
  solidScriptGivenFlowName,
  solidScriptGivenWordKind,
  type SolidScriptGiven,
} from './solid_script_document_gives.js';
import type { SolidScriptCommandFlow, SolidScriptCommandGives } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptFieldSplit } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFunctionKey, solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';

/** Most rounds a loop is followed until what it leaves stops changing. */
const SOLID_SCRIPT_FLOW_ROUNDS = 4;

/** Most Functions and parts deep a call is followed. */
const SOLID_SCRIPT_FLOW_DEPTH = 16;

/** The Function or part a line runs in while it is followed. */
interface SolidScriptFlowFrame {
  /** Kinds its Return lines give. */
  readonly returns: Set<string>;
  /** How many calls deep it is. */
  readonly depth: number;
  /** Variables where its Return lines leave it; null while none did. */
  exits: SolidScriptFlowState | null;
}

/** Variables at a point of the script; null where no run gets. */
type SolidScriptFlowMaybe = SolidScriptFlowState | null;

/**
 * Follows a script without running it, from top to bottom through its blocks,
 * and keeps for every line the kinds each variable may hold when it is reached:
 * a write replaces them, both sides of an If join at its End, a loop joins what
 * it leaves after any number of rounds, and a Function's lines see the kinds
 * every Call gives its inputs.
 */
class SolidScriptFlowAnalysis {
  /** Variables when each line is reached, by 0-based line. */
  private readonly before = new Map<number, SolidScriptFlowState>();
  /** Function lines by name key. */
  private readonly functions = new Map<string, SolidScriptFlowNode>();
  /** Define Part lines by name key. */
  private readonly parts = new Map<string, SolidScriptFlowNode>();
  /** When lines. */
  private readonly handlers: SolidScriptFlowNode[] = [];
  /**
   * Function calls being followed, by Function line and kinds of values, with
   * what they give so far.
   */
  private readonly running = new Map<string, Set<string>>();
  /**
   * What each Function gives, by Function line, kinds of values and the
   * variables it starts with.
   */
  private readonly summaries = new Map<string, SolidScriptFlowCalled>();
  /**
   * What each Function gives while built on what a Function still being
   * followed gives so far.
   */
  private readonly guessed = new Map<string, SolidScriptFlowCalled>();
  /**
   * Functions, by line and kinds of values, a call used while they were still
   * being followed.
   */
  private readonly guessedOn = new Set<string>();
  /**
   * How many times a call used what a Function still being followed gives so
   * far.
   */
  private guesses = 0;
  /** Name keys of the script's Inputs, which no line can change. */
  private readonly inputNames = new Set<string>();
  /** Kinds each Function gave back, joined over every way it was followed. */
  private readonly gave = new Map<SolidScriptFlowNode, Set<string>>();
  /** What each Function gives once asked, by Function line. */
  private readonly given = new Map<SolidScriptFlowNode, string[]>();
  /** Function and part lines some line ran. */
  private readonly ran = new Set<SolidScriptFlowNode>();
  /**
   * Counters of the loops being followed, each with the variable of the same
   * name outside the loop: a counter lives in its loop, so a Function, which
   * sees only the script's own variables, still sees the one outside.
   */
  private readonly counters: { key: string; outer: SolidScriptFlowVariable | undefined }[] = [];
  /** 0-based line of each line of the script. */
  private readonly lineOf: ReadonlyMap<SolidScriptBlock, number>;
  /** 0-based line being followed, which passes the values of a Call it makes. */
  private current = -1;
  /** Variables when the script's own lines are done. */
  readonly end: SolidScriptFlowState;

  /**
   * Follows the script.
   *
   * @param blocks Lines of the script.
   */
  constructor(private readonly blocks: readonly SolidScriptBlock[]) {
    this.lineOf = new Map(blocks.map((block, line) => [block, line]));
    const top = solidScriptFlowTree(blocks);
    this.register(top);
    const frame: SolidScriptFlowFrame = { returns: new Set(), depth: 0, exits: null };
    this.end = solidScriptNarrowJoin(this.sequence(top, new Map(), frame), frame.exits) ?? new Map();
    this.unreached();
  }

  /**
   * Gives the variables a line sees: those when it is reached, or for a line
   * that is off or after the last, those of the next line that is on.
   *
   * @param position 0-based line, or where a new line goes.
   * @returns Variables.
   */
  at(position: number): SolidScriptFlowState {
    for (let line = Math.max(0, position); line < this.blocks.length; line++) {
      const known = this.before.get(line);
      if (known) return known;
    }
    return this.end;
  }

  /**
   * Finds the Functions, parts and When lines among lines and their blocks.
   *
   * @param nodes Lines.
   */
  private register(nodes: readonly SolidScriptFlowNode[]): void {
    for (const node of nodes) {
      const kind = solidScriptGivenFlow(node.block)?.kind;
      const name = solidScriptGivenFlowName(node.block);
      if (kind === 'function') this.functions.set(solidScriptFunctionKey(name), node);
      if (kind === 'part') this.parts.set(solidScriptNameKey(name), node);
      if (kind === 'handler') this.handlers.push(node);
      this.register(node.children);
      this.register(node.otherwise ?? []);
    }
  }

  /**
   * Follows the Functions and parts no line ran, and the When lines, from the
   * variables the script leaves, so their lines get kinds too.
   */
  private unreached(): void {
    const frame = (): SolidScriptFlowFrame => ({ returns: new Set(), depth: 1, exits: null });
    for (const node of [...this.functions.values(), ...this.parts.values()])
      if (!this.ran.has(node)) {
        this.current = node.line;
        const unreached = frame();
        this.body(node, this.inputs(node, this.end, []), unreached);
        this.gaveAdd(node, unreached.returns);
      }
    for (const node of this.handlers) this.body(node, this.end, frame());
  }

  /**
   * Keeps what a line sees, joined with what it saw on other ways to it.
   *
   * @param line 0-based line.
   * @param state Variables.
   */
  private record(line: number, state: SolidScriptFlowState): void {
    const known = this.before.get(line);
    this.before.set(line, known ? solidScriptFlowJoin(known, state) : state);
  }

  /**
   * Follows lines one after another. Lines after a Return no run reaches; they
   * still get the variables the Return saw, so they can be edited.
   *
   * @param nodes Lines.
   * @param state Variables before the first.
   * @param frame Function or part they run in.
   * @returns Variables after the last; null when every way ended in a Return.
   */
  private sequence(
    nodes: readonly SolidScriptFlowNode[],
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowMaybe {
    let current: SolidScriptFlowMaybe = state;
    let last = state;
    for (const node of nodes) {
      if (current === null) {
        this.record(node.line, last);
        this.step(node, last, this.dead(frame));
        continue;
      }
      this.record(node.line, current);
      this.current = node.line;
      last = current;
      current = this.step(node, current, frame);
    }
    return current;
  }

  /**
   * Gives lines no run reaches a frame of their own, so what they give changes
   * nothing.
   *
   * @param frame Frame of the lines around them.
   * @returns Frame that keeps nothing.
   */
  private dead(frame: SolidScriptFlowFrame): SolidScriptFlowFrame {
    return { returns: new Set(), depth: frame.depth, exits: null };
  }

  /**
   * Follows one line with its block.
   *
   * @param node Line.
   * @param state Variables before it.
   * @param frame Function or part it runs in.
   * @returns Variables after it.
   */
  private step(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowMaybe {
    const kind = solidScriptGivenFlow(node.block)?.kind;
    if (kind === 'function' || kind === 'handler') return state;
    if (kind === 'choice') return this.choice(node, state, frame);
    if (kind === 'loop') return this.loop(node, state, frame);
    const after = this.line(node.block, state, frame);
    if (after === null || solidScriptBlockNesting(node.block) !== 'open') return after;
    return this.body(node, after, frame);
  }

  /**
   * Follows the lines of a block once, and keeps what its End line sees.
   *
   * @param node Block line.
   * @param state Variables before its first line.
   * @param frame Function or part it runs in.
   * @returns Variables after its last line.
   */
  private body(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowMaybe {
    const after = this.sequence(node.children, state, frame);
    this.record(node.end, after ?? state);
    return after;
  }

  /**
   * Follows both sides of an If and joins them.
   *
   * @param node If line.
   * @param state Variables before it.
   * @param frame Function or part it runs in.
   * @returns Variables after its End.
   */
  private choice(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowMaybe {
    const flow = solidScriptGivenFlow(node.block);
    const condition = flow?.kind === 'choice' && flow.condition ? (node.block.values[flow.condition] ?? '') : '';
    const sides = solidScriptFlowNarrow(condition, state, this.headOf(state, frame));
    const then = this.side(node.children, sides.then, state, frame);
    if (node.otherwise === null) {
      this.record(node.end, then ?? state);
      return solidScriptNarrowJoin(then, sides.otherwise);
    }
    this.record(node.elseLine, then ?? state);
    const otherwise = this.side(node.otherwise, sides.otherwise, state, frame);
    this.record(node.end, otherwise ?? state);
    return solidScriptNarrowJoin(then, otherwise);
  }

  /**
   * Follows one side of an If. A side no run can take still gets the variables
   * before the If for its lines, but leaves nothing.
   *
   * @param nodes Lines of the side.
   * @param state Variables where it starts; null when no run takes it.
   * @param before Variables before the If.
   * @param frame Function or part it runs in.
   * @returns Variables after its last line; null when no run takes it.
   */
  private side(
    nodes: readonly SolidScriptFlowNode[],
    state: SolidScriptFlowState | null,
    before: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowState | null {
    if (state !== null) return this.sequence(nodes, state, frame);
    this.sequence(nodes, before, this.dead(frame));
    return null;
  }

  /**
   * Follows a loop until what any number of rounds leaves stops changing, or a
   * few rounds passed.
   *
   * @param node Loop line.
   * @param state Variables before it.
   * @param frame Function or part it runs in.
   * @returns Variables after its End: those of no round joined with those of
   *   the last.
   */
  private loop(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowState {
    const counters = solidScriptGivenFields(node.block).map(({ name }) => solidScriptNameKey(name));
    this.counters.push(...counters.map((key) => ({ key, outer: state.get(key) })));
    try {
      return this.loopJoin(node, state, frame, counters.length);
    } finally {
      this.counters.splice(this.counters.length - counters.length);
    }
  }

  /**
   * Follows a loop's body until what it leaves stops changing.
   *
   * @param node Loop line.
   * @param state Variables before the loop.
   * @param frame Function or part it runs in.
   * @param count How many counters this loop pushed.
   * @returns Variables after its End.
   */
  private loopJoin(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
    count: number,
  ): SolidScriptFlowState {
    let current = state;
    for (let round = 0; round < SOLID_SCRIPT_FLOW_ROUNDS; round++) {
      this.loopReveal(current, count);
      const next =
        solidScriptNarrowJoin(state, this.body(node, this.writes(node.block, current, [], frame), frame)) ?? state;
      if (solidScriptFlowEqual(next, current)) return next;
      current = next;
    }
    return current;
  }

  /**
   * Remembers, for each of this loop's counters, the value the name had at the
   * start of the round, so Delete Variable can bring it back.
   *
   * @param current Variables at the start of the round.
   * @param count How many counters this loop pushed.
   */
  private loopReveal(current: SolidScriptFlowState, count: number): void {
    for (const counter of this.counters.slice(-count)) counter.outer = current.get(counter.key);
  }

  /**
   * Forgets a name, or brings back the value a loop counter of that name hid.
   *
   * @param state Variables before the line.
   * @param name Name as written.
   * @returns Variables after it.
   */
  private forget(state: SolidScriptFlowState, name: string): SolidScriptFlowState {
    const key = solidScriptNameKey(name);
    const after = new Map(solidScriptFlowDelete(state, key));
    const hidden = [...this.counters].reverse().find((counter) => counter.key === key)?.outer;
    if (hidden) after.set(key, hidden);
    return after;
  }

  /**
   * Follows one line that opens no block, or the line of a block before its
   * lines: a Call runs its lines, a Return gives its value, then every field
   * that names a variable writes it the way the command declares.
   *
   * @param block Line.
   * @param state Variables before it.
   * @param frame Function or part it runs in.
   * @returns Variables after it.
   */
  private line(
    block: SolidScriptBlock,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowMaybe {
    const flow = solidScriptGivenFlow(block);
    if (flow?.kind === 'call') {
      const { after, returns } = this.call(block, flow, state, frame);
      return this.writes(block, after, returns, frame);
    }
    if (flow?.kind !== 'return') return this.writes(block, state, [], frame);
    if ((block.values[flow.value] ?? '').trim() !== '')
      for (const kind of solidScriptFlowValueKinds(block.values[flow.value] ?? '', this.headOf(state, frame)))
        frame.returns.add(kind);
    frame.exits = solidScriptNarrowJoin(frame.exits, state);
    return null;
  }

  /**
   * Follows the fields of a line that name a variable it writes, as its command
   * declares them; a loop's fields write before each round.
   *
   * @param block Line.
   * @param state Variables before it.
   * @param returns Kinds the Function a Call ran gives back.
   * @param frame Function or part it runs in.
   * @returns Variables after it.
   */
  private writes(
    block: SolidScriptBlock,
    state: SolidScriptFlowState,
    returns: readonly string[],
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowState {
    return solidScriptGivenFields(block).reduce(
      (after, given) => this.give(block, given, after, returns, frame),
      state,
    );
  }

  /**
   * Follows one field that names a variable: a name not set yet that a list
   * line adds to, or an item such as Points(2), becomes a list; a part such as
   * Face.Data.Height leaves the kind, and a key under the .Data of a variable
   * is remembered for it; a forgotten name is gone.
   *
   * @param block Line.
   * @param given Field and the name typed in it.
   * @param state Variables before it.
   * @param returns Kinds the Function a Call ran gives back.
   * @param frame Function or part it runs in.
   * @returns Variables after it.
   */
  private give(
    block: SolidScriptBlock,
    given: SolidScriptGiven,
    state: SolidScriptFlowState,
    returns: readonly string[],
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowState {
    const { gives, name } = given;
    if (gives.rule === 'word') this.inputNames.add(solidScriptNameKey(name));
    else if (this.inputNames.has(solidScriptNameKey(name))) return state;
    if (gives.rule === 'forgotten') return this.forget(state, name);
    if (gives.rule === 'kept' || gives.rule === 'read' || gives.rule === 'defines') return state;
    if (gives.rule === 'emptied' || gives.rule === 'shrunk') return this.change(state, name, gives.rule, block);
    const item = /^((?:\$local\.|\$persistent\.)?[A-Za-z_]\w*)\s*\(.*\)$/i.exec(name)?.[1];
    const line = this.lineOf.get(block) ?? -1;
    if (item !== undefined || gives.rule === 'list') return this.listWrite(item ?? name, state, line);
    const data = solidScriptFlowDataWrite(name);
    if (data) return solidScriptFlowKeysAdd(state, solidScriptNameKey(data.owner), [data.key]);
    if (/\./.test(name.replace(/^\$(local|persistent)\./i, ''))) return state;
    const kinds = this.kindsGiven(block, gives, state, returns, frame);
    return this.write(state, name, kinds, line, solidScriptFlowKeysGiven(block, gives, state));
  }

  /**
   * Follows a line that empties a variable or takes items out of it.
   *
   * @param state Variables before it.
   * @param name Name typed, maybe an item such as Points(2).
   * @param rule Emptied or shrunk.
   * @param block Line.
   * @returns Variables after it.
   */
  private change(
    state: SolidScriptFlowState,
    name: string,
    rule: 'emptied' | 'shrunk',
    block: SolidScriptBlock,
  ): SolidScriptFlowState {
    const key = solidScriptNameKey(name.replace(/\s*\(.*\)$/s, ''));
    const held = state.get(key);
    // Clear Variable makes an empty list of a name no line set yet; taking items out of one stops the run.
    if (!held && rule === 'shrunk') return state;
    const kinds = held ? solidScriptFlowChanged(rule, [...held.kinds]) : ['List'];
    return this.write(state, key, kinds, this.lineOf.get(block) ?? -1);
  }

  /**
   * Tells the kinds a field gives its variable, as its command declares.
   *
   * @param block Line.
   * @param gives What the field gives.
   * @param state Variables before the line.
   * @param returns Kinds the Function a Call ran gives back.
   * @param frame Function or part it runs in.
   * @returns Kinds; none for a kind only running tells.
   */
  private kindsGiven(
    block: SolidScriptBlock,
    gives: SolidScriptCommandGives,
    state: SolidScriptFlowState,
    returns: readonly string[],
    frame: SolidScriptFlowFrame,
  ): readonly string[] {
    const head = this.headOf(state, frame);
    const field = 'field' in gives ? (block.values[gives.field] ?? '') : '';
    if (gives.rule === 'kind') return solidScriptFlowKindEach(gives.kind, gives.each, block, head);
    if (gives.rule === 'value') return solidScriptFlowValueKinds(field, head);
    if (gives.rule === 'item') return solidScriptFlowItemKinds(field, head);
    if (gives.rule === 'key') return solidScriptFlowKeyKinds(field, head);
    if (gives.rule === 'word') return [solidScriptGivenWordKind(block, gives.field) ?? SOLID_SCRIPT_FLOW_UNKNOWN];
    return gives.rule === 'returned' ? returns : [];
  }

  /**
   * Follows a line that adds or sets an item of a list: a name no line set
   * becomes a List, and a list of one kind may now hold items of another, so it
   * may be a List of anything.
   *
   * @param name List name.
   * @param state Variables before.
   * @param line 0-based line that writes it.
   * @returns Variables after.
   */
  private listWrite(name: string, state: SolidScriptFlowState, line: number): SolidScriptFlowState {
    const held = state.get(solidScriptNameKey(name));
    return this.write(state, name, held ? solidScriptFlowUnique([...held.kinds, 'List']) : ['List'], line);
  }

  /**
   * Writes the kinds of a variable by its name as written.
   *
   * @param state Variables before.
   * @param name Name as written, maybe in brackets.
   * @param kinds Kinds written.
   * @param line 0-based line that writes it.
   * @param keys Keys of the Dictionary written, when known.
   * @returns Variables after.
   */
  private write(
    state: SolidScriptFlowState,
    name: string,
    kinds: readonly string[],
    line: number,
    keys: readonly string[] = [],
  ): SolidScriptFlowState {
    const bare = name
      .trim()
      .replace(/^\[(.*)\]$/s, '$1')
      .trim();
    return bare === '' ? state : solidScriptFlowWrite(state, solidScriptNameKey(bare), kinds, line, keys);
  }

  /**
   * Follows a Call: the Function's lines run with the kinds of the values as
   * its inputs.
   *
   * @param block Call line.
   * @param flow Fields of the Call.
   * @param state Variables before it.
   * @param frame Function or part it runs in.
   * @returns Variables after it, and the kinds the Function gives back.
   */
  private call(
    block: SolidScriptBlock,
    flow: Extract<SolidScriptCommandFlow, { kind: 'call' }>,
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowCalled {
    const node = this.functions.get(solidScriptFunctionKey((block.values[flow.name] ?? '').trim()));
    if (!node) return { after: state, returns: [] };
    const head = this.headOf(state, frame);
    const values = solidScriptFieldSplit(block.values[flow.values] ?? '', ',').map((text) =>
      solidScriptFlowValueKinds(text, head),
    );
    return this.invoke(node, values, this.outside(state), frame);
  }

  /**
   * Gives the variables a Function sees from where it is called: a loop counter
   * that hides a variable of the same name may also be that variable.
   *
   * @param state Variables of the caller.
   * @returns Variables the Function sees.
   */
  private outside(state: SolidScriptFlowState): SolidScriptFlowState {
    if (this.counters.every(({ outer }) => outer === undefined)) return state;
    const seen = new Map(state);
    for (const { key, outer } of this.counters) {
      const held = seen.get(key);
      if (outer) seen.set(key, held ? solidScriptFlowVariableJoin(held, outer) : outer);
    }
    return seen;
  }

  /**
   * Runs a Function's lines with the kinds of its values. A Function that calls
   * itself with the same kinds, directly or through others, gives what it is
   * known to give so far, and its lines are followed again until that stops
   * growing, so recursion ends with everything it can give. What a call gives
   * is kept for the same kinds and variables, so a Function called again the
   * same way is not followed again.
   *
   * @param node Function line.
   * @param values Kinds of the values, in order.
   * @param state Variables of the caller.
   * @param frame Function or part the call runs in.
   * @returns Variables after the call, and the kinds the Function gives back.
   */
  private invoke(
    node: SolidScriptFlowNode,
    values: readonly (readonly string[])[],
    state: SolidScriptFlowState,
    frame: SolidScriptFlowFrame,
  ): SolidScriptFlowCalled {
    const call: SolidScriptFlowCall = { node, values, state, frame, key: solidScriptFlowCallKey(node, values) };
    const running = this.running.get(call.key);
    if (running) return this.guess(call.key, running, state);
    const memo = `${call.key}@${this.current}#${solidScriptFlowGlobals(state)}`;
    const known = this.summaries.get(memo) ?? this.guessed.get(memo);
    if (known) return known;
    if (frame.depth >= SOLID_SCRIPT_FLOW_DEPTH) return { after: state, returns: [SOLID_SCRIPT_FLOW_UNKNOWN] };
    const guesses = this.guesses;
    const caller = this.current;
    const result = this.invokeRounds(call);
    this.current = caller;
    (this.guesses === guesses ? this.summaries : this.guessed).set(memo, result);
    return result;
  }

  /**
   * Gives what a Function still being followed is known to give so far, and
   * marks it to be followed again.
   *
   * @param key Function line and kinds of values.
   * @param running Kinds it gives so far.
   * @param state Variables of the caller.
   * @returns Variables after the call, and the kinds so far.
   */
  private guess(key: string, running: ReadonlySet<string>, state: SolidScriptFlowState): SolidScriptFlowCalled {
    this.guesses++;
    this.guessedOn.add(key);
    return { after: state, returns: [...running] };
  }

  /**
   * Follows a Function's lines until what it gives stops growing: again only
   * while a call inside used what it gave so far.
   *
   * @param call The call.
   * @returns Variables after the call, and the kinds the Function gives back.
   */
  private invokeRounds(call: SolidScriptFlowCall): SolidScriptFlowCalled {
    this.ran.add(call.node);
    let known = new Set<string>();
    let after = call.state;
    for (let round = 0; round < SOLID_SCRIPT_FLOW_ROUNDS; round++) {
      const ran = this.invokeRound(call, known);
      after = ran.after;
      const grown = ran.returns.some((kind) => !known.has(kind));
      known = new Set([...known, ...ran.returns]);
      if (!grown || !ran.again) break;
      this.guessed.clear();
    }
    this.gaveAdd(call.node, known);
    return { after, returns: [...known] };
  }

  /**
   * Joins kinds a Function gave back on one way it was followed into what it
   * gives.
   *
   * @param node Function line.
   * @param kinds Kinds it gave.
   */
  private gaveAdd(node: SolidScriptFlowNode, kinds: Iterable<string>): void {
    const known = this.gave.get(node) ?? new Set<string>();
    for (const kind of kinds) known.add(kind);
    this.gave.set(node, known);
  }

  /**
   * Tells what a Function of the script gives back: every kind its Return lines
   * give, joined over each Call and formula that runs it, or with unknown
   * inputs when nothing does. A Function whose Returns only give what a cycle
   * of calls never settles gives the unknown kind.
   *
   * @param name Function name as written.
   * @returns Kinds, empty when no Return gives a value; undefined when there is
   *   no such Function.
   */
  gives(name: string): string[] | undefined {
    const node = this.functions.get(solidScriptFunctionKey(name));
    if (!node) return undefined;
    const known = this.given.get(node);
    if (known) return known;
    let kinds = [...(this.gave.get(node) ?? [])];
    if (kinds.length === 0 && solidScriptFlowReturnsValue(node)) kinds = [SOLID_SCRIPT_FLOW_UNKNOWN];
    this.given.set(node, kinds);
    return kinds;
  }

  /**
   * Follows a Function's lines once, calls of itself giving what it gave so
   * far.
   *
   * @param call The call.
   * @param known Kinds it gave so far.
   * @returns Variables after the call, kinds given, and whether a call used the
   *   guess.
   */
  private invokeRound(call: SolidScriptFlowCall, known: Set<string>): SolidScriptFlowCalled & { again: boolean } {
    this.running.set(call.key, known);
    const called: SolidScriptFlowFrame = { returns: new Set(), depth: call.frame.depth + 1, exits: null };
    const start = this.inputs(call.node, call.state, call.values);
    const ended = solidScriptNarrowJoin(this.body(call.node, start, called), called.exits);
    this.running.delete(call.key);
    const again = this.guessedOn.delete(call.key);
    return { after: solidScriptFlowLocalsBack(ended ?? call.state, call.state), returns: [...called.returns], again };
  }

  /**
   * Gives the kinds the names of a state may hold, and what a Function of the
   * script gives when a formula calls it.
   *
   * @param state Variables.
   * @param frame Function or part the formula runs in.
   * @returns Kinds by lower-case name key, with calls.
   */
  private headOf(state: SolidScriptFlowState, frame: SolidScriptFlowFrame): SolidScriptFlowHead {
    const head: SolidScriptFlowHead = (key) => [...(state.get(key)?.kinds ?? [])];
    head.call = (name, values) => {
      const node = this.functions.get(solidScriptFunctionKey(name));
      return node ? this.invoke(node, values, state, frame).returns : undefined;
    };
    return head;
  }

  /**
   * Gives a Function's lines its inputs as $Local. names, with no other locals.
   *
   * @param node Function line.
   * @param state Variables of the caller.
   * @param values Kinds of the values given, in order.
   * @returns Variables its first line sees.
   */
  private inputs(
    node: SolidScriptFlowNode,
    state: SolidScriptFlowState,
    values: readonly (readonly string[])[],
  ): SolidScriptFlowState {
    let entry: SolidScriptFlowState = new Map([...state].filter(([key]) => !key.startsWith('$local.')));
    const flow = solidScriptGivenFlow(node.block);
    const field = flow?.kind === 'function' ? flow.inputs : '';
    solidScriptFunctionInputs(node.block.values[field] ?? '').forEach((input, index) => {
      entry = this.write(entry, `$Local.${input.name}`, values[index] ?? [SOLID_SCRIPT_FLOW_UNKNOWN], this.current);
    });
    return entry;
  }
}

/**
 * What a call leaves: the variables after it and the kinds the Function gives
 * back.
 */
interface SolidScriptFlowCalled {
  readonly after: SolidScriptFlowState;
  readonly returns: string[];
}

/** One call of a Function being followed. */
interface SolidScriptFlowCall {
  /** Function line. */
  readonly node: SolidScriptFlowNode;
  /** Kinds of the values, in order. */
  readonly values: readonly (readonly string[])[];
  /** Variables of the caller. */
  readonly state: SolidScriptFlowState;
  /** Function or part the call runs in. */
  readonly frame: SolidScriptFlowFrame;
  /** Function line and kinds of values. */
  readonly key: string;
}

/**
 * Tells the keys of the Dictionary a field writes, where its line shows them:
 * the typed Keys of Make Dictionary, or those its Value copies or lists.
 *
 * @param block Line.
 * @param gives What the field gives.
 * @param state Variables before the line.
 * @returns Keys as written; none when unknown.
 */
function solidScriptFlowKeysGiven(
  block: SolidScriptBlock,
  gives: SolidScriptCommandGives,
  state: SolidScriptFlowState,
): string[] {
  if (gives.rule === 'kind') return gives.keys ? solidScriptFlowTypedKeys(block.values[gives.keys] ?? '') : [];
  if (gives.rule !== 'value') return [];
  return solidScriptFlowValueKeys(block.values[gives.field] ?? '', (key) => state.get(key)?.keys ?? []);
}

/**
 * Tells whether a Function has a Return line that gives a value, not counting
 * the lines of a Function or part inside it.
 *
 * @param node Function line.
 * @returns True when one does.
 */
function solidScriptFlowReturnsValue(node: SolidScriptFlowNode): boolean {
  return [...node.children, ...(node.otherwise ?? [])].some((inner) => {
    const flow = solidScriptGivenFlow(inner.block);
    if (flow?.kind === 'return') return (inner.block.values[flow.value] ?? '').trim() !== '';
    if (flow?.kind === 'function' || flow?.kind === 'part') return false;
    return solidScriptFlowReturnsValue(inner);
  });
}

/**
 * Names a call by its Function line and the kinds of its values.
 *
 * @param node Function line.
 * @param values Kinds of the values, in order.
 * @returns Key.
 */
function solidScriptFlowCallKey(node: SolidScriptFlowNode, values: readonly (readonly string[])[]): string {
  return `${node.line}:${values.map((kinds) => [...kinds].sort().join('|')).join(',')}`;
}

/**
 * Writes the variables a Function can see from its caller as text, the same for
 * the same kinds.
 *
 * @param state Variables of the caller.
 * @returns Text.
 */
function solidScriptFlowGlobals(state: SolidScriptFlowState): string {
  return [...state]
    .filter(([key]) => !key.startsWith('$local.'))
    .map(
      ([key, variable]) =>
        `${key}=${[...variable.kinds].sort().join('|')}@${[...variable.from.keys()].sort().join('|')}`,
    )
    .sort()
    .join(';');
}

/** Analyses already made, by the lines of the script. */
const SOLID_SCRIPT_FLOW_MADE = new WeakMap<readonly SolidScriptBlock[], SolidScriptFlowAnalysis>();

/**
 * Follows a script once per version of its lines.
 *
 * @param document Script.
 * @returns Analysis.
 */
function solidScriptFlowOf(document: SolidScriptDocument): SolidScriptFlowAnalysis {
  const made = SOLID_SCRIPT_FLOW_MADE.get(document.blocks);
  if (made) return made;
  const analysis = new SolidScriptFlowAnalysis(document.blocks);
  SOLID_SCRIPT_FLOW_MADE.set(document.blocks, analysis);
  return analysis;
}

/**
 * Tells, without running the script, the kinds each variable may hold where a
 * line stands, and the Types Sets may have declared for it.
 *
 * @param document Script.
 * @param position 0-based line, or where a new line goes.
 * @returns Variables by name key.
 */
export function solidScriptDocumentFlowAt(document: SolidScriptDocument, position: number): SolidScriptFlowState {
  return solidScriptFlowOf(document).at(position);
}

/**
 * Tells, without running the script, the kinds each variable may hold when the
 * script's own lines are done.
 *
 * @param document Script.
 * @returns Variables by name key.
 */
export function solidScriptDocumentFlowEnd(document: SolidScriptDocument): SolidScriptFlowState {
  return solidScriptFlowOf(document).end;
}

/**
 * Tells, without running the script, the kinds a Function of the script gives
 * back, once per version of its lines.
 *
 * @param document Script.
 * @param name Function name as written.
 * @returns Kinds, with the unknown kind for what only running tells; empty when
 *   no Return gives a value; undefined when there is no such Function.
 */
export function solidScriptDocumentFunctionGives(
  document: SolidScriptDocument,
  name: string,
): readonly string[] | undefined {
  return solidScriptFlowOf(document).gives(name);
}

/**
 * Kinds a field declared as one kind gives: a list of that kind when a field it
 * follows per item holds a list, such as Find On From given [Points], and
 * either when such a field may hold one.
 *
 * @param kind Declared kind, such as Vector.
 * @param each Fields that give one result per item, when any.
 * @param block Line.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
function solidScriptFlowKindEach(
  kind: string,
  each: readonly string[] | undefined,
  block: SolidScriptBlock,
  head: SolidScriptFlowHead,
): string[] {
  const fields = (each ?? []).map((key) => solidScriptFlowValueKinds(block.values[key] ?? '', head));
  const lists = fields.map((kinds) => kinds.filter((found) => found.endsWith('List')).length);
  if (fields.some((kinds, index) => kinds.length > 0 && lists[index] === kinds.length)) return [`${kind} List`];
  return lists.some((count) => count > 0) ? [kind, `${kind} List`] : [kind];
}
