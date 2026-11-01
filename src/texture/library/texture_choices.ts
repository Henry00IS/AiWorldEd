import { getTextureMapCache } from './texture_map_cache.js';

/** One texture in a picker: its id and the label to show. */
export interface TextureChoice {
  value: string;
  label: string;
}

/** Suffix that marks a texture the level uses but whose file is missing. */
export const TEXTURE_CHOICE_MISSING_SUFFIX = ' (missing)';

/**
 * Lists the library's textures, then the textures the level uses whose files
 * are missing, then any stored id not listed yet. Missing ones keep their id so
 * picking or showing them never unassigns anything.
 *
 * @param extraIds Stored ids to keep visible.
 * @returns Picker entries.
 */
export function textureChoicesList(extraIds: readonly string[] = []): TextureChoice[] {
  const cache = getTextureMapCache();
  const choices: TextureChoice[] = (cache.getLibrary()?.getEntries() ?? []).map((entry) => ({
    value: entry.id,
    label: entry.displayName,
  }));
  const listed = new Set(choices.map((choice) => choice.value));
  for (const id of [...cache.usedIds(), ...extraIds]) {
    if (id === '' || listed.has(id)) continue;
    listed.add(id);
    choices.push({ value: id, label: `${id}${TEXTURE_CHOICE_MISSING_SUFFIX}` });
  }
  return choices;
}
