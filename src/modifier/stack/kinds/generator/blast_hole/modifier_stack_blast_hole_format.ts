/** Parameter key of the saved Blast Hole format version (hidden integer). */
export const BLAST_HOLE_FORMAT_VERSION_KEY = 'formatVersion';

/**
 * Format version this editor writes. 1: first release, whose Jagged style was a
 * star around the centre. 2: Jagged is a ragged outline that fills the box; the
 * old star lives on as the Star style.
 */
export const BLAST_HOLE_FORMAT_VERSION = 2;

/** Version assumed for saves without a format version. */
export const BLAST_HOLE_FORMAT_VERSION_LEGACY = 1;

/**
 * Returns the stored format version, or the legacy version when it is missing
 * or not a positive integer.
 *
 * @param parameters Stored parameters.
 * @returns Format version.
 */
export function blastHoleFormatVersionOf(parameters: Record<string, unknown>): number {
  const version = parameters[BLAST_HOLE_FORMAT_VERSION_KEY];
  return typeof version === 'number' && Number.isInteger(version) && version >= 1
    ? version
    : BLAST_HOLE_FORMAT_VERSION_LEGACY;
}

/**
 * Upgrades stored parameters to the current format, one version at a time.
 * Version 1 Jagged holes (style jagged or no style) become the Star style, so
 * old scenes keep exactly the hole they were saved with. Newer formats are kept
 * as they are.
 *
 * @param parameters Stored parameters.
 * @returns Parameters in the current format, or untouched future ones.
 */
export function blastHoleFormatMigrate(parameters: Record<string, unknown>): Record<string, unknown> {
  let current = parameters;
  for (let version = blastHoleFormatVersionOf(current); version < BLAST_HOLE_FORMAT_VERSION; version++) {
    if (version === 1 && (current['style'] === undefined || current['style'] === 'jagged'))
      current = { ...current, style: 'star' };
    current = { ...current, [BLAST_HOLE_FORMAT_VERSION_KEY]: version + 1 };
  }
  return current;
}
