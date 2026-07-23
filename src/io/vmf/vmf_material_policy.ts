/**
 * Material name rules for Source tool textures during VMF import.
 */

/**
 * Normalizes a material path for case-insensitive comparisons.
 * @param materialName Raw material string from the VMF.
 * @returns Uppercase path with forward slashes.
 */
export function normalizeVmfMaterialName(materialName: string): string {
  return materialName.toUpperCase().replace(/\\/g, '/');
}

/**
 * Returns true when the material marks a non-rendered volume brush
 * (triggers, hints, fog, skybox shells, etc.) that should be skipped.
 * @param materialName Material path from a solid side.
 * @returns True when the entire solid should be skipped.
 */
export function isSkippedVolumeMaterial(materialName: string): boolean {
  const name = normalizeVmfMaterialName(materialName);
  return SKIPPED_VOLUME_MATERIALS.has(name);
}

/**
 * Returns true when the material is collision / clip only.
 * @param materialName Material path.
 * @returns True for clip-like tools textures.
 */
export function isCollisionOnlyMaterial(materialName: string): boolean {
  const name = normalizeVmfMaterialName(materialName);
  return COLLISION_ONLY_MATERIALS.has(name);
}

/**
 * Returns true when the material is nodraw (still solid, not textured).
 * @param materialName Material path.
 * @returns True for nodraw.
 */
export function isNodrawMaterial(materialName: string): boolean {
  return normalizeVmfMaterialName(materialName) === 'TOOLS/TOOLSNODRAW';
}

/**
 * Converts a VMF material path into a durable texture identity string.
 * @param materialName Material path.
 * @returns Texture id suitable for face mappings.
 */
export function materialNameToTextureId(materialName: string): string {
  const normalized = materialName.replace(/\\/g, '/').toLowerCase();
  if (normalized.length === 0) return 'tools/toolsnodraw';
  return normalized;
}

const SKIPPED_VOLUME_MATERIALS = new Set([
  'TOOLS/TOOLSTRIGGER',
  'TOOLS/TOOLSBLOCK_LOS',
  'TOOLS/TOOLSBLOCKBULLETS',
  'TOOLS/TOOLSBLOCKBULLETS2',
  'TOOLS/TOOLSBLOCKSBULLETSFORCEFIELD',
  'TOOLS/TOOLSBLOCKLIGHT',
  'TOOLS/TOOLSCLIMBVERSUS',
  'TOOLS/TOOLSHINT',
  'TOOLS/TOOLSINVISIBLE',
  'TOOLS/TOOLSINVISIBLENONSOLID',
  'TOOLS/TOOLSINVISIBLELADDER',
  'TOOLS/TOOLSINVISMETAL',
  'TOOLS/TOOLSNODRAWROOF',
  'TOOLS/TOOLSNODRAWWOOD',
  'TOOLS/TOOLSNODRAWPORTALABLE',
  'TOOLS/TOOLSSKIP',
  'TOOLS/TOOLSFOG',
  'TOOLS/TOOLSSKYBOX',
  'TOOLS/TOOLS2DSKYBOX',
  'TOOLS/TOOLSSKYFOG',
  'TOOLS/TOOLSFOGVOLUME',
  'TOOLS/TOOLS_XOGVOLUME'
]);

const COLLISION_ONLY_MATERIALS = new Set([
  'TOOLS/TOOLSCLIP',
  'TOOLS/TOOLSNPCCLIP',
  'TOOLS/TOOLSPLAYERCLIP',
  'TOOLS/TOOLSGRENDADECLIP',
  'TOOLS/TOOLSSTAIRS',
  'TOOLS/TOOLS_XOGVOLUME'
]);
