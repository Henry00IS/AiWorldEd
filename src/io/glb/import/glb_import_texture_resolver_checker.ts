import type { GlbImportImage, GlbImportTextureResolution, GlbImportTextureResolver } from './glb_import_types.js';

/**
 * Keeps every imported surface on the checker texture and explains why the
 * embedded images were not used.
 */
export class GlbImportTextureResolverChecker implements GlbImportTextureResolver {
  /**
   * Creates the resolver.
   *
   * @param reason Why embedded images are not used, shown when a file has any.
   */
  constructor(private readonly reason: string) {}

  /**
   * Resolves no texture ids.
   *
   * @param images Embedded images.
   * @returns Empty map, with the reason when the file had images.
   */
  async resolve(images: readonly GlbImportImage[]): Promise<GlbImportTextureResolution> {
    return { textureIdByImage: new Map(), note: images.length > 0 ? this.reason : null };
  }
}
