/** Parameter key of the saved Blast Hole format version (hidden integer). */
export const BLAST_HOLE_FORMAT_VERSION_KEY = 'formatVersion';

/**
 * Format version this editor writes. 1: first release, whose Jagged style was a
 * star around the centre. 2: Jagged is a ragged outline that fills the box.
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
 * Version 1 Jagged holes (style jagged or no style) become the new Jagged: the
 * star rows (Spikes, Spike Length) are dropped, Roughness and Edge Detail keep
 * their values, and Shape, Jag Size and Bites start at their defaults. Bricks
 * keeps every setting. A Star style saved by a test build of version 2 also
 * becomes Jagged. Newer formats are kept as they are.
 *
 * @param parameters Stored parameters.
 * @returns Parameters in the current format, or untouched future ones.
 */
export function blastHoleFormatMigrate(parameters: Record<string, unknown>): Record<string, unknown> {
  let current = parameters;
  for (let version = blastHoleFormatVersionOf(current); version < BLAST_HOLE_FORMAT_VERSION; version++) {
    if (version === 1 && current['style'] !== 'Bricks') current = blastHoleFormatJaggedFromStar(current);
    current = { ...current, [BLAST_HOLE_FORMAT_VERSION_KEY]: version + 1 };
  }
  return current['style'] === 'star' ? blastHoleFormatJaggedFromStar(current) : current;
}

/**
 * Turns star-outline Jagged settings into new Jagged ones: style Jagged,
 * without the star-only rows.
 *
 * @param parameters Stored parameters.
 * @returns Parameters for the new Jagged.
 */
function blastHoleFormatJaggedFromStar(parameters: Record<string, unknown>): Record<string, unknown> {
  const { spikes: _spikes, spikeLength: _spikeLength, ...rest } = parameters;
  return { ...rest, style: 'Jagged' };
}
