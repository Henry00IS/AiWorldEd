import { solidScriptFieldIsVariable } from '@/solid_script/language/solid_script_field.js';

/**
 * What one piece of a listed line is: the command name, a connecting word, a
 * configured value, a variable or the text of a note.
 */
export type SolidScriptListingKind = 'name' | 'word' | 'value' | 'variable' | 'note';

/** One piece of a line in the script listing. */
export interface SolidScriptListingPart {
  /** What the piece is, for its colour. */
  kind: SolidScriptListingKind;
  /** Shown text, spacing included. */
  text: string;
}

/** Reads the configured values of a line for its listing. */
export interface SolidScriptListingValues {
  /**
   * Returns a value as the listing shows it: a lone variable in square
   * brackets, a text in its double quotes, anything else in single quotes.
   */
  value: (key: string) => SolidScriptListingPart;
  /** Returns a name the line defines, such as a counter, in square brackets. */
  variable: (key: string) => SolidScriptListingPart;
  /** Returns a value as plain text. */
  text: (key: string) => string;
  /** Returns whether a switch is on. */
  on: (key: string) => boolean;
  /** Returns whether a value differs from its default. */
  changed: (key: string) => boolean;
}

/** A piece of a listing, a connecting word, or nothing for a skipped option. */
export type SolidScriptListingPiece = SolidScriptListingPart | string | null | false;

/**
 * Writes the listing of one line from its values. The first piece is the
 * command name; the listing keeps two spaces between it and the rest.
 */
export type SolidScriptListingWrite = (read: SolidScriptListingValues) => SolidScriptListingPiece[];

/**
 * Formats a configured value as typed: a lone variable as [name], anything else
 * in single quotes.
 *
 * @param text Field text.
 * @returns Listing piece.
 */
export function solidScriptListingValue(text: string): SolidScriptListingPart {
  if (solidScriptFieldIsVariable(text)) return { kind: 'variable', text: text.trim().replace(/\s+/g, '') };
  return { kind: 'value', text: `'${text}'` };
}

/**
 * Builds a listing from the command name and the rest of the line.
 *
 * @param name Command name as listed.
 * @param rest Remaining pieces; strings become connecting words.
 * @returns Listing pieces.
 */
export function solidScriptListingBuild(
  name: string,
  rest: readonly SolidScriptListingPiece[],
): SolidScriptListingPart[] {
  const parts = rest
    .filter((piece): piece is SolidScriptListingPart | string => piece !== null && piece !== false && piece !== '')
    .map((piece) => (typeof piece === 'string' ? { kind: 'word' as const, text: piece } : piece));
  return [{ kind: 'name', text: parts.length > 0 ? `${name}  ` : name }, ...parts];
}

/**
 * Joins the options of a line in brackets, such as "(Centered, Top Scale '[1,
 * 1]')", or nothing when every option is at its default.
 *
 * @param options Option pieces; empty entries are skipped.
 * @returns Pieces of the bracket, starting with a space.
 */
export function solidScriptListingOptions(
  options: readonly (SolidScriptListingPiece[] | null | false)[],
): SolidScriptListingPiece[] {
  const shown = options.filter((option): option is SolidScriptListingPiece[] => Array.isArray(option));
  if (shown.length === 0) return [];
  const pieces: SolidScriptListingPiece[] = [' ('];
  shown.forEach((option, index) => pieces.push(...(index > 0 ? [', '] : []), ...option));
  pieces.push(')');
  return pieces;
}

/**
 * Joins listing pieces into the shown line.
 *
 * @param parts Listing pieces.
 * @returns Line text.
 */
export function solidScriptListingText(parts: readonly SolidScriptListingPart[]): string {
  return parts.map((part) => part.text).join('');
}
