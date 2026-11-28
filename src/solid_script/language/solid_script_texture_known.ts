import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/**
 * Builds the warning of a texture name the project does not have, or nothing
 * when it has it or no texture library is open to ask.
 *
 * @param name Texture name as given.
 * @returns Warning text, or null.
 */
export function solidScriptTextureUnknownWarning(name: string): string | null {
  if (name === '' || getTextureMapCache().knows(name) !== false) return null;
  return `No texture named "${name}" in this project.`;
}

/**
 * Warns on the running line when a texture name is not in the project, and
 * gives the name back unchanged, as the texture may come with another project.
 *
 * @param run Running line, which takes the warning.
 * @param run.warn Adds a warning on the running line.
 * @param name Texture name.
 * @returns The name.
 */
export function solidScriptTextureChecked(run: { warn(text: string): void }, name: string): string {
  const warning = solidScriptTextureUnknownWarning(name);
  if (warning !== null) run.warn(warning);
  return name;
}
