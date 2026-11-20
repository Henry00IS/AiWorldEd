/**
 * Writes how many solids a run built and how long the script run took, as shown
 * after the solids count in the editor output and on a generator row.
 *
 * @param count Solids built.
 * @param ms Time the script run took, in milliseconds.
 * @param paused True when the run stopped early, such as at a breakpoint.
 * @returns Text such as "5 solids (0.21825ms)".
 */
export function solidScriptOutputSolids(count: number, ms: number, paused = false): string {
  const noun = count === 1 ? 'solid' : 'solids';
  const soFar = paused ? ' so far' : '';
  return `${count} ${noun}${soFar} (${ms.toFixed(5)}ms)`;
}
