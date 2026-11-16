import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Small builders for the lines of the built-in examples, so each example reads
 * like the script the editor shows.
 */

/**
 * Builds one line.
 *
 * @param command Command id.
 * @param values Field text by key.
 * @returns Line.
 */
export function solidScriptExampleLine(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Builds a block: its line, the lines inside and its End.
 *
 * @param command Command id.
 * @param values Field text by key.
 * @param inside Lines inside.
 * @returns Lines.
 */
export function solidScriptExampleBlock(
  command: string,
  values: Record<string, string>,
  inside: readonly SolidScriptLine[],
): SolidScriptLine[] {
  return [solidScriptExampleLine(command, values), ...inside, solidScriptExampleLine('end')];
}

/**
 * Builds an Input line.
 *
 * @param name Variable name.
 * @param type Input type.
 * @param fallback Default value.
 * @param limits Label, minimum, maximum and choices.
 * @returns Line.
 */
export function solidScriptExampleInput(
  name: string,
  type: string,
  fallback: string,
  limits: { label?: string; min?: string; max?: string; choices?: string } = {},
): SolidScriptLine {
  return solidScriptExampleLine('input', { name, type, default: fallback, ...limits });
}

/**
 * Builds a Set line.
 *
 * @param name Variable name.
 * @param value Value text.
 * @returns Line.
 */
export function solidScriptExampleSet(name: string, value: string): SolidScriptLine {
  return solidScriptExampleLine('variable', { name, value });
}

/**
 * Builds a Repeat block.
 *
 * @param variable Counter name.
 * @param from First value.
 * @param to Last value.
 * @param inside Lines inside.
 * @returns Lines.
 */
export function solidScriptExampleRepeat(
  variable: string,
  from: string,
  to: string,
  inside: readonly SolidScriptLine[],
): SolidScriptLine[] {
  return solidScriptExampleBlock('repeat', { variable, from, to }, inside);
}

/**
 * Builds an If block, with an Else when lines for it are given.
 *
 * @param condition Condition text.
 * @param inside Lines run when it holds.
 * @param otherwise Lines run when it does not.
 * @returns Lines.
 */
export function solidScriptExampleIf(
  condition: string,
  inside: readonly SolidScriptLine[],
  otherwise: readonly SolidScriptLine[] = [],
): SolidScriptLine[] {
  const rest = otherwise.length > 0 ? [solidScriptExampleLine('else'), ...otherwise] : [];
  return solidScriptExampleBlock('if', { condition }, [...inside, ...rest]);
}

/**
 * Builds a Note line.
 *
 * @param text Note text.
 * @returns Line.
 */
export function solidScriptExampleNote(text: string): SolidScriptLine {
  return solidScriptExampleLine('note', { text });
}

/**
 * Builds a Point line.
 *
 * @param position Corner as x, y, z text.
 * @returns Line.
 */
export function solidScriptExamplePoint(position: string): SolidScriptLine {
  return solidScriptExampleLine('point', { position });
}

/**
 * Builds a Polyhedron block around corner lines.
 *
 * @param inside Lines that add corners.
 * @param points Optional list of corners.
 * @returns Lines.
 */
export function solidScriptExamplePolyhedron(inside: readonly SolidScriptLine[], points = ''): SolidScriptLine[] {
  return solidScriptExampleBlock('polyhedron', points ? { points } : {}, inside);
}

/** Width, depth and height Inputs every generator port starts with. */
export const SOLID_SCRIPT_EXAMPLE_BOX_INPUTS: readonly SolidScriptLine[] = [
  solidScriptExampleInput('width', 'number', '2', { label: 'Width', min: '0.01' }),
  solidScriptExampleInput('depth', 'number', '2', { label: 'Depth', min: '0.01' }),
  solidScriptExampleInput('height', 'number', '2', { label: 'Height', min: '0.01' }),
];
