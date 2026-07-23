/**
 * Public entry points for Source Engine 2006 VMF import.
 */
export { VmfParser } from './vmf_parser.js';
export { VmfSolidImporter } from './vmf_solid_importer.js';
export type { VmfImportOptions, VmfImportResult } from './vmf_solid_importer.js';
export { VmfBrushFromSides } from './vmf_brush_from_sides.js';
export type { VmfBuiltBrush } from './vmf_brush_from_sides.js';
export { VmfHalfSpaceHullBuilder } from './vmf_half_space_hull.js';
export { VmfUvConverter, VMF_DEFAULT_TEXTURE_SIZE } from './vmf_uv_converter.js';
export {
  VMF_INCHES_TO_METERS,
  sourcePointToEditorMeters,
  swizzleSourceToThree
} from './vmf_coordinates.js';
export type {
  VmfWorld,
  VmfSolid,
  VmfSolidSide,
  VmfEntity,
  VmfTextureAxis,
  VmfVector3,
  VmfPlanePoints
} from './vmf_types.js';
export {
  isSkippedVolumeMaterial,
  materialNameToTextureId
} from './vmf_material_policy.js';
