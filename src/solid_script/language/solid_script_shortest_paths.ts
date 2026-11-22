/**
 * One edge of a corner graph: its two corner numbers and what crossing it
 * costs.
 */
export interface SolidScriptPathEdge {
  a: number;
  b: number;
  cost: number;
}

/** The cheapest way from every corner to its nearest End corner. */
export interface SolidScriptPathWays {
  /**
   * For each corner, the edge it leaves by, or -1 at an End or when no End is
   * reachable.
   */
  next: number[];
  /**
   * For each corner, the total cost to its nearest End, Infinity when none is
   * reachable.
   */
  total: number[];
}

/**
 * Finds, for every corner, the next edge on its cheapest way to the nearest End
 * corner and what the whole way costs. Costs below 0 count as 0.
 *
 * @param count Number of corners.
 * @param edges Edges between corners.
 * @param ends Corner numbers paths lead to.
 * @returns The ways of every corner.
 */
export function solidScriptShortestPathsNext(
  count: number,
  edges: readonly SolidScriptPathEdge[],
  ends: readonly number[],
): SolidScriptPathWays {
  const total = Array.from({ length: count }, () => Infinity);
  const next = Array.from({ length: count }, () => -1);
  const done = Array.from({ length: count }, () => false);
  for (const end of ends) total[end] = 0;
  for (;;) {
    const at = total.reduce(
      (best, cost, index) => (!done[index] && cost < (total[best] ?? Infinity) ? index : best),
      -1,
    );
    if (at < 0) return { next, total };
    done[at] = true;
    edges.forEach((edge, index) => {
      const other = edge.a === at ? edge.b : edge.b === at ? edge.a : -1;
      const cost = (total[at] ?? 0) + Math.max(0, edge.cost);
      if (other >= 0 && !done[other] && cost < (total[other] ?? Infinity)) {
        total[other] = cost;
        next[other] = index;
      }
    });
  }
}

/**
 * Follows each Start corner to its nearest End corner and lists the edges on
 * the way, each once.
 *
 * @param edges Edges between corners.
 * @param next For each corner, the edge it leaves by.
 * @param starts Corner numbers paths start from.
 * @returns Edge numbers.
 */
export function solidScriptShortestPathsEdges(
  edges: readonly SolidScriptPathEdge[],
  next: readonly number[],
  starts: readonly number[],
): number[] {
  const picked = new Set<number>();
  for (const start of starts) {
    let corner = start;
    for (let edge = next[corner] ?? -1; edge >= 0 && !picked.has(edge); edge = next[corner] ?? -1) {
      picked.add(edge);
      const { a, b } = edges[edge] ?? { a: -1, b: -1 };
      corner = a === corner ? b : a;
    }
  }
  return [...picked];
}

/**
 * Lists, for every corner, the corner its cheapest way goes to next, or the
 * corner itself at an End or when no End is reachable.
 *
 * @param edges Edges between corners.
 * @param next For each corner, the edge it leaves by.
 * @returns Corner numbers.
 */
export function solidScriptShortestPathsNextCorners(
  edges: readonly SolidScriptPathEdge[],
  next: readonly number[],
): number[] {
  return next.map((edge, corner) => {
    const { a, b } = edges[edge] ?? { a: corner, b: corner };
    return a === corner ? b : a;
  });
}
