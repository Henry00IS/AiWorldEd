/**
 * Names shown to the user: PascalCase identifiers and Title Case words, so a
 * lowercase suggestion such as x cannot be declared.
 */

/** A PascalCase identifier, such as X or Length. */
export type SolidScriptPascalCase<S extends string> = S extends `${infer First}${string}`
  ? First extends Uppercase<First>
    ? First extends Lowercase<First>
      ? never
      : S
    : never
  : never;

/** A table of PascalCase kinds and members, so a key such as x is a type error. */
export type SolidScriptPascalTable<T extends Record<string, Record<string, string>>> = T & {
  [Kind in keyof T]: Kind extends string
    ? Kind extends SolidScriptPascalCase<Kind>
      ? {
          [Name in keyof T[Kind]]: Name extends string
            ? Name extends SolidScriptPascalCase<Name>
              ? T[Kind][Name]
              : never
            : never;
        }
      : never
    : never;
};

/**
 * Returns a member table after checking that every kind and member is
 * PascalCase.
 *
 * @param table Table of kinds to member names and the kinds they give.
 * @returns The same table.
 */
export function solidScriptPascalTable<T extends Record<string, Record<string, string>>>(
  table: SolidScriptPascalTable<T>,
): T {
  return table;
}

/** One member's list name and the kind it gives on a single value. */
export interface SolidScriptMemberForm<P extends string = string, T extends string = string> {
  /**
   * Name through a list, such as Positions; the same as the singular when it
   * does not change.
   */
  plural: P;
  /** Kind it gives on one value, such as Vector. */
  type: T;
}

/**
 * Declares the list name of a member and the kind it gives on one value.
 *
 * @param plural Name through a list, such as Positions, or the singular when it
 *   stays the same.
 * @param type Kind on one value, such as Vector.
 * @returns The form.
 */
export function solidScriptMemberForm<P extends string, T extends string>(
  plural: P & SolidScriptPascalCase<P>,
  type: T,
): SolidScriptMemberForm<P, T> {
  return { plural, type };
}

/** One PascalCase identifier, such as X or Length. */
export const SOLID_SCRIPT_PASCAL_IDENT = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Title Case words shown as a choice or label, such as Counter Clockwise or
 * Left, Bottom, Back.
 */
export const SOLID_SCRIPT_SHOWN_WORDS = /^[A-Z0-9][A-Za-z0-9]*(?:(?:, | \/ | )[A-Z0-9][A-Za-z0-9]*)*(?: [°%])?$/;

/**
 * Tells whether a shown name is PascalCase or Title Case, including a dotted
 * path such as $Box.Size.X or Pos.X.
 *
 * @param name Name as shown to the user.
 * @returns True when every part starts with a capital letter or digit.
 */
export function solidScriptShownNameOk(name: string): boolean {
  if (name.startsWith('$')) return solidScriptShownPathOk(name.slice(1));
  if (name.includes('.')) return solidScriptShownPathOk(name);
  return SOLID_SCRIPT_SHOWN_WORDS.test(name);
}

/**
 * Tells whether every dotted part is a PascalCase identifier, allowing an item
 * number such as Brushes(0).
 *
 * @param path Name without a leading $.
 * @returns True when every part is PascalCase.
 */
function solidScriptShownPathOk(path: string): boolean {
  const parts = path.split('.');
  return parts.every((part) => part !== '' && SOLID_SCRIPT_PASCAL_IDENT.test(part.replace(/\(\d+\)$/, '')));
}
