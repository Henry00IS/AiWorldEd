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

/**
 * Builds an Input Group around the inputs that sit under Title.
 *
 * @param title Heading.
 * @param inside Input lines and nested input blocks.
 * @returns Lines.
 */
export function solidScriptExampleInputGroup(title: string, inside: readonly SolidScriptLine[]): SolidScriptLine[] {
  return solidScriptExampleBlock('input_group', { title }, inside);
}

/**
 * Builds a Show Inputs When block around the inputs shown for a value.
 *
 * @param name Input it watches.
 * @param value Value, or several values separated by commas.
 * @param inside Input lines shown then.
 * @returns Lines.
 */
export function solidScriptExampleShowWhen(
  name: string,
  value: string,
  inside: readonly SolidScriptLine[],
): SolidScriptLine[] {
  return solidScriptExampleBlock('show_inputs_when', { name, value }, inside);
}

/**
 * Builds three Number inputs, one per axis, as the inspector of a modifier
 * shows them.
 *
 * @param prefix Variable stem; X, Y and Z are appended.
 * @param values Default X, Y and Z as text.
 * @param label Caption stem; the axis letter is appended.
 * @param limits Minimum and maximum, when the modifier has them.
 * @returns Lines.
 */
export function solidScriptExampleComponents(
  prefix: string,
  values: readonly [string, string, string],
  label: string,
  limits: { min?: string; max?: string } = {},
): SolidScriptLine[] {
  return (['X', 'Y', 'Z'] as const).map((axis, index) =>
    solidScriptExampleInput(`${prefix}${axis}`, 'Number', values[index] ?? '0', {
      label: `${label} ${axis}`,
      ...limits,
    }),
  );
}
