import { SOLID_SCRIPT_FLOW_UNKNOWN } from './solid_script_document_flow_kinds.js';

/** What the checks know about one variable at a point of the script. */
export interface SolidScriptFlowVariable {
  /** Kinds it may hold; the unknown kind where only running tells. */
  readonly kinds: ReadonlySet<string>;
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
    joined.set(key, known ? { kinds: new Set([...known.kinds, ...variable.kinds]) } : variable);
  }
  return joined;
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
 * @returns State after.
 */
export function solidScriptFlowWrite(
  state: SolidScriptFlowState,
  key: string,
  kinds: readonly string[],
): SolidScriptFlowState {
  return new Map(state).set(key, { kinds: new Set(kinds.length > 0 ? kinds : [SOLID_SCRIPT_FLOW_UNKNOWN]) });
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
