import type * as THREE from 'three';

/** A line of points made from joined edges, open or closed. */
export interface SolidScriptPathChain {
  points: THREE.Vector3[];
  closed: boolean;
}

/** Edge ends and the edges that meet at each corner, by corner key. */
interface SolidScriptChainGraph {
  segments: readonly (readonly [THREE.Vector3, THREE.Vector3])[];
  at: Map<string, number[]>;
  used: Set<number>;
}

/**
 * Joins edges that share corners into lines of points: a line runs on through
 * every corner where exactly two edges meet and stops at an end or a fork.
 * Edges that go round and meet themselves give a closed line.
 *
 * @param segments Edge ends.
 * @returns Lines of points, open ones first.
 */
export function solidScriptPathChains(
  segments: readonly (readonly [THREE.Vector3, THREE.Vector3])[],
): SolidScriptPathChain[] {
  const graph: SolidScriptChainGraph = { segments, at: new Map(), used: new Set() };
  segments.forEach((segment, index) =>
    segment.forEach((end) => {
      const key = solidScriptChainKey(end);
      graph.at.set(key, [...(graph.at.get(key) ?? []), index]);
    }),
  );
  const chains: SolidScriptPathChain[] = [];
  for (const [key, held] of graph.at)
    if (held.length !== 2) held.forEach(() => solidScriptChainFrom(graph, key, chains));
  segments.forEach((segment, index) => {
    if (!graph.used.has(index)) solidScriptChainFrom(graph, solidScriptChainKey(segment[0]), chains);
  });
  return chains;
}

/**
 * Walks one line from a corner along unused edges and adds it.
 *
 * @param graph Edges and corners.
 * @param start Corner key to start from.
 * @param chains Lines so far.
 */
function solidScriptChainFrom(graph: SolidScriptChainGraph, start: string, chains: SolidScriptPathChain[]): void {
  let key = start;
  let next = solidScriptChainNext(graph, key);
  if (next === undefined) return;
  const points: THREE.Vector3[] = [];
  while (next !== undefined) {
    graph.used.add(next);
    const [a, b] = graph.segments[next] ?? [];
    if (!a || !b) return;
    const forward = solidScriptChainKey(a) === key;
    if (points.length === 0) points.push((forward ? a : b).clone());
    points.push((forward ? b : a).clone());
    key = solidScriptChainKey(forward ? b : a);
    next = key === start || (graph.at.get(key)?.length ?? 0) !== 2 ? undefined : solidScriptChainNext(graph, key);
  }
  const closed = key === start && points.length > 3;
  chains.push({ points: closed ? points.slice(0, -1) : points, closed });
}

/**
 * Finds an unused edge at a corner.
 *
 * @param graph Edges and corners.
 * @param key Corner key.
 * @returns Edge index, or undefined.
 */
function solidScriptChainNext(graph: SolidScriptChainGraph, key: string): number | undefined {
  return graph.at.get(key)?.find((index) => !graph.used.has(index));
}

/**
 * Key of a corner, to a hundredth of a millimetre, so edges that meet share it.
 *
 * @param point Corner.
 * @returns Key.
 */
function solidScriptChainKey(point: THREE.Vector3): string {
  return `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`;
}
