/** Windows drive prefix ("C:/") or a leading slash marks an absolute path. */
const FBX_IMPORT_ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:\/|\/)/;

/**
 * Finds the project texture an FBX image path names. A relative path is first
 * looked up next to the FBX file; otherwise (and for absolute paths written on
 * another computer) the texture with the same file name is used, else one with
 * the same name stem (a .tga converted to .png). Among several matches the one
 * inside the FBX file's folder wins, then the shortest path.
 *
 * @param textureIds Project texture ids (project-relative paths).
 * @param fbxFolder Project folder of the FBX file, or null when outside.
 * @param references Image paths from the FBX, relative ones first.
 * @returns Texture id, or null when the project holds no matching image.
 */
export function fbxImportTexturePathFind(
  textureIds: readonly string[],
  fbxFolder: string | null,
  references: readonly string[],
): string | null {
  const byLowerPath = new Map(textureIds.map((id) => [id.toLowerCase(), id]));
  for (const reference of references) {
    const joined = fbxImportTextureRelativeJoin(fbxFolder, fbxImportPathNormalize(reference));
    const exact = joined === null ? undefined : byLowerPath.get(joined.toLowerCase());
    if (exact !== undefined) return exact;
  }
  const names = references.map((reference) => fbxImportPathName(fbxImportPathNormalize(reference)).toLowerCase());
  const byName = textureIds.filter((id) => names.includes(fbxImportPathName(id).toLowerCase()));
  const stems = names.map(fbxImportPathStem);
  const byStem = textureIds.filter((id) => stems.includes(fbxImportPathStem(fbxImportPathName(id).toLowerCase())));
  return fbxImportTextureClosest(byName.length > 0 ? byName : byStem, fbxFolder);
}

/**
 * Joins a relative image path to the FBX file's folder.
 *
 * @param fbxFolder FBX folder (empty for the project root), or null.
 * @param reference Normalized image path.
 * @returns Project path, or null for absolute paths or files outside the
 *   project.
 */
function fbxImportTextureRelativeJoin(fbxFolder: string | null, reference: string): string | null {
  if (fbxFolder === null || FBX_IMPORT_ABSOLUTE_PATH_PATTERN.test(reference)) return null;
  const segments: string[] = [];
  for (const segment of `${fbxFolder}/${reference}`.split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) return null;
    } else if (segment !== '.' && segment !== '') segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Picks the match inside the FBX folder, then the one with the shortest path.
 *
 * @param candidates Matching texture ids.
 * @param fbxFolder FBX folder, or null.
 * @returns Texture id, or null without candidates.
 */
function fbxImportTextureClosest(candidates: readonly string[], fbxFolder: string | null): string | null {
  const inside = (id: string) => fbxFolder !== null && (fbxFolder === '' || id.startsWith(`${fbxFolder}/`));
  const ranked = [...candidates].sort(
    (a, b) => Number(inside(b)) - Number(inside(a)) || a.split('/').length - b.split('/').length || a.localeCompare(b),
  );
  return ranked[0] ?? null;
}

/**
 * Uses forward slashes in a path.
 *
 * @param path Path.
 * @returns Normalized path.
 */
function fbxImportPathNormalize(path: string): string {
  return path.trim().replace(/\\/g, '/');
}

/**
 * Returns the file name of a path.
 *
 * @param path Path with forward slashes.
 * @returns File name.
 */
function fbxImportPathName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Removes the extension of a file name.
 *
 * @param name File name.
 * @returns Stem.
 */
function fbxImportPathStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
