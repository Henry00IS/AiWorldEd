import type { ObjMaterialSlot } from './obj_material_collector.js';

/**
 * Builds Wavefront MTL library text from collected material slots.
 *
 * @param meta The objmeta comment line of the .obj it belongs to.
 * @param slots Unique material slots.
 * @returns MTL file contents.
 */
export function buildMtlDocument(meta: string, slots: readonly ObjMaterialSlot[]): string {
  const lines: string[] = [
    '# Wavefront MTL exported by AI World Editor',
    '# https://github.com/Henry00IS/AiWorldEd',
    meta,
    '',
  ];
  slots.forEach((slot) => {
    lines.push(...buildOneMaterialBlock(slot));
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Builds one newmtl block.
 *
 * @param slot Material slot.
 * @returns MTL lines for the material.
 */
function buildOneMaterialBlock(slot: ObjMaterialSlot): string[] {
  const r = formatComponent(slot.color.r);
  const g = formatComponent(slot.color.g);
  const b = formatComponent(slot.color.b);
  const lines = [
    `newmtl ${slot.name}`,
    'Ns 250.000000',
    'Ka 1.000000 1.000000 1.000000',
    `Kd ${r} ${g} ${b}`,
    'Ks 0.000000 0.000000 0.000000',
    'Ke 0.000000 0.000000 0.000000',
    'Ni 1.500000',
    'd 1.000000',
    'illum 2',
  ];
  if (slot.mapFileName) {
    lines.push(`map_Kd ${slot.mapFileName}`);
  }
  return lines;
}

/**
 * Formats a 0–1 color channel for MTL output.
 *
 * @param value Channel value.
 * @returns Fixed decimal string.
 */
function formatComponent(value: number): string {
  return value.toFixed(6);
}
