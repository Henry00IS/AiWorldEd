/**
 * Writes a count with its noun in singular or plural ("1 texture", "2
 * textures").
 *
 * @param count Count.
 * @param singular Noun for one.
 * @param plural Noun for any other count (default: singular + "s").
 * @returns Text.
 */
export function textCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
