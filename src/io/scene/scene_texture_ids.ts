import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';

/** Deepest level nesting searched for texture ids. */
const SCENE_TEXTURE_IDS_DEPTH = 32;

/**
 * Collects the texture ids a level uses: every string, or string array, stored
 * under a key containing "textureId" (any case).
 *
 * @param value Level objects.
 * @returns Texture ids (never the built-in checker).
 */
export function sceneTextureIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > SCENE_TEXTURE_IDS_DEPTH || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((item) => visit(item, depth + 1));
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (/textureid/i.test(key)) {
        const values = Array.isArray(child) ? child : [child];
        values.forEach(
          (item) => typeof item === 'string' && item !== '' && !isDefaultCheckerTextureId(item) && ids.add(item),
        );
      } else visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return ids;
}
