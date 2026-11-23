import { SOLID_SCRIPT_FLOW_UNKNOWN } from './solid_script_document_flow_kinds.js';

/** What the checks know about one variable at a point of the script. */
export interface SolidScriptFlowVariable {
  /** Kinds it may hold; the unknown kind where only running tells. */
  readonly kinds: ReadonlySet<string>;
  /**
   * The 0-based lines whose write may reach this point, each with the kinds it
   * gave that the variable may still hold here.
   */
  readonly from: ReadonlyMap<number, ReadonlySet<string>>;
  /**
   * Keys a Dictionary it holds may have been given, as written; none when
   * unknown.
   */
  readonly keys?: readonly string[];
}

/** One write that may reach a point: its 0-based line and the kinds it gave. */
export interface SolidScriptFlowSource {
  readonly line: number;
  readonly kinds: readonly string[];
}

/** The variables at a point of the script, by name key. */
export type SolidScriptFlowState = ReadonlyMap<string, SolidScriptFlowVariable>;

/**
 * Joins what two ways through the script leave, such as both sides of an If: a
 * variable may hold any kind either leaves; one only a way sets keeps its
 * kinds, as reading it on the other way stops.
 *
 * @param left One way.
 * @param right Other way.
 * @returns Joined state.
 */
export function solidScriptFlowJoin(left: SolidScriptFlowState, right: SolidScriptFlowState): SolidScriptFlowState {
  const joined = new Map(left);
  for (const [key, variable] of right) {
    const known = left.get(key);
    joined.set(key, known ? solidScriptFlowVariableJoin(known, variable) : variable);
  }
  return joined;
}

/**
 * Joins what two ways leave in one variable: any kind either holds, from any
 * write either way sees.
 *
 * @param left One way.
 * @param right Other way.
 * @returns Joined variable.
 */
export function solidScriptFlowVariableJoin(
  left: SolidScriptFlowVariable,
  right: SolidScriptFlowVariable,
): SolidScriptFlowVariable {
  const from = new Map(left.from);
  for (const [line, kinds] of right.from) from.set(line, new Set([...(from.get(line) ?? []), ...kinds]));
  const keys = solidScriptFlowKeysJoin(left.keys ?? [], right.keys ?? []);
  return { kinds: new Set([...left.kinds, ...right.kinds]), from, ...(keys.length > 0 ? { keys } : {}) };
}

/**
 * Keeps only some kinds of a variable, as an If narrows it: each write keeps
 * the kinds it gave that remain, and a write whose kind only running told gives
 * the kinds the variable did not hold before.
 *
 * @param variable Variable before; missing when not set.
 * @param kinds Kinds it holds from here on.
 * @returns Variable after.
 */
export function solidScriptFlowVariableKeep(
  variable: SolidScriptFlowVariable | undefined,
  kinds: readonly string[],
): SolidScriptFlowVariable {
  const kept = new Set(kinds);
  const fresh = kinds.filter((kind) => !variable?.kinds.has(kind));
  const from = new Map<number, ReadonlySet<string>>();
  for (const [line, given] of variable?.from ?? []) {
    const left = [...given].filter((kind) => kept.has(kind));
    if (given.has(SOLID_SCRIPT_FLOW_UNKNOWN)) left.push(...fresh);
    if (left.length > 0) from.set(line, new Set(left));
  }
  return { kinds: kept, from, ...(variable?.keys ? { keys: variable.keys } : {}) };
}

/**
 * Tells whether two states know the same.
 *
 * @param left One state.
 * @param right Other state.
 * @returns True when equal.
 */
export function solidScriptFlowEqual(left: SolidScriptFlowState, right: SolidScriptFlowState): boolean {
  if (left.size !== right.size) return false;
  for (const [key, variable] of left) {
    const other = right.get(key);
    if (!other || !solidScriptFlowSame(variable.kinds, other.kinds)) return false;
    if (!solidScriptFlowSame(new Set(variable.keys ?? []), new Set(other.keys ?? []))) return false;
    if (variable.from.size !== other.from.size) return false;
    for (const [line, kinds] of variable.from)
      if (!solidScriptFlowSame(kinds, other.from.get(line) ?? new Set())) return false;
  }
  return true;
}

/**
 * Tells whether two sets hold the same words.
 *
 * @param left One set.
 * @param right Other set.
 * @returns True when equal.
 */
function solidScriptFlowSame(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((entry) => right.has(entry));
}

/**
 * Writes a variable: it holds the written kinds from here on, whatever it held.
 *
 * @param state State before.
 * @param key Name key.
 * @param kinds Kinds written; none for a kind only running tells.
 * @param line 0-based line that writes it.
 * @param keys Keys of the Dictionary it holds, when known.
 * @returns State after.
 */
export function solidScriptFlowWrite(
  state: SolidScriptFlowState,
  key: string,
  kinds: readonly string[],
  line: number,
  keys: readonly string[] = [],
): SolidScriptFlowState {
  const written = new Set(kinds.length > 0 ? kinds : [SOLID_SCRIPT_FLOW_UNKNOWN]);
  const variable = { kinds: written, from: new Map([[line, written]]), ...(keys.length > 0 ? { keys } : {}) };
  return new Map(state).set(key, variable);
}

/**
 * Joins two lists of Dictionary keys, each key once in any case, in the order
 * they were first given.
 *
 * @param left Keys known first.
 * @param right Keys to add.
 * @returns Keys.
 */
export function solidScriptFlowKeysJoin(left: readonly string[], right: readonly string[]): string[] {
  const joined: string[] = [];
  for (const key of [...left, ...right])
    if (!joined.some((known) => known.toLowerCase() === key.toLowerCase())) joined.push(key);
  return joined;
}

/**
 * Adds keys a line writes under the .Data of a variable, such as Glass of Set
 * Prices.Data.Glass; a name not set yet is left as it is.
 *
 * @param state State before.
 * @param key Name key of the variable.
 * @param keys Keys written.
 * @returns State after.
 */
export function solidScriptFlowKeysAdd(
  state: SolidScriptFlowState,
  key: string,
  keys: readonly string[],
): SolidScriptFlowState {
  const variable = state.get(key);
  if (!variable) return state;
  return new Map(state).set(key, { ...variable, keys: solidScriptFlowKeysJoin(variable.keys ?? [], keys) });
}

/**
 * Forgets a variable, as Delete Variable does.
 *
 * @param state State before.
 * @param key Name key.
 * @returns State after.
 */
export function solidScriptFlowDelete(state: SolidScriptFlowState, key: string): SolidScriptFlowState {
  const after = new Map(state);
  after.delete(key);
  return after;
}

/**
 * Puts back the Function locals of a caller after a Function ran: its own
 * Local. names come back and the called Function's go.
 *
 * @param after State the Function left.
 * @param caller State of the caller before the call.
 * @returns State of the caller after the call.
 */
export function solidScriptFlowLocalsBack(
  after: SolidScriptFlowState,
  caller: SolidScriptFlowState,
): SolidScriptFlowState {
  const back = new Map([...after].filter(([key]) => !key.startsWith('local.')));
  for (const [key, variable] of caller) if (key.startsWith('local.')) back.set(key, variable);
  return back;
}

/**
 * Tells the kinds known for a name, without the unknown kind.
 *
 * @param state State.
 * @param key Name key.
 * @returns Kinds, or undefined when the name is not set at that point.
 */
export function solidScriptFlowKinds(state: SolidScriptFlowState, key: string): string[] | undefined {
  const variable = state.get(key);
  return variable ? [...variable.kinds].filter((kind) => kind !== SOLID_SCRIPT_FLOW_UNKNOWN) : undefined;
}

/**
 * Lists the writes that may reach a point for a name, in line order, each with
 * the kinds it gave that the name may hold there, without the unknown kind.
 *
 * @param state State.
 * @param key Name key.
 * @returns Writes; empty when the name is not set at that point.
 */
export function solidScriptFlowSources(state: SolidScriptFlowState, key: string): SolidScriptFlowSource[] {
  return [...(state.get(key)?.from ?? [])]
    .sort(([left], [right]) => left - right)
    .map(([line, kinds]) => ({ line, kinds: [...kinds].filter((kind) => kind !== SOLID_SCRIPT_FLOW_UNKNOWN) }));
}
