/** Outcome of a topology operator that may refuse to mutate. */
export interface TopologyOperatorResult {
  /** True when the working geometry was changed. */
  applied: boolean;
  /** Status text when the operator refuses or reports a note. */
  message: string;
}

/**
 * Builds a successful operator result.
 *
 * @param message Optional status text.
 * @returns Applied result.
 */
export function topologyOperatorApplied(message: string = ''): TopologyOperatorResult {
  return { applied: true, message };
}

/**
 * Builds a refused operator result.
 *
 * @param message Refusal reason.
 * @returns Refused result.
 */
export function topologyOperatorRefused(message: string): TopologyOperatorResult {
  return { applied: false, message };
}
