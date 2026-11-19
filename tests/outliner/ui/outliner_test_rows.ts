/**
 * Finds the outliner row element whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @returns The row element.
 */
export function rowByName(host: HTMLElement, name: string): HTMLElement {
  const span = Array.from(host.querySelectorAll('span')).find((candidate) => candidate.textContent === name);
  const row = span?.closest<HTMLElement>('[data-outliner-object-uuid]') ?? span?.closest<HTMLElement>('div');
  if (!row) throw new Error(`Outliner row not found: ${name}`);
  return row;
}
