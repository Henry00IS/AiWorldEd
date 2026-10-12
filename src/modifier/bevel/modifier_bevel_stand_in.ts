import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelSmearSurface } from './modifier_bevel_surface_smear.js';

/**
 * Builds a compile-only instance whose brush is the chamfer and whose surfaces
 * match it. The authored instance is not modified.
 *
 * @param source Authored instance.
 * @param derived Chamfered local brush and face records.
 * @returns Stand-in sharing the source mesh and id.
 */
export function modifierBevelCreateStandIn(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
): SolidBrushInstance {
  const standIn = new SolidBrushInstance(source.id, source.name, derived.localBrush, source.operation);
  standIn.mesh = source.mesh;
  standIn.position.copy(source.position);
  standIn.rotation.copy(source.rotation);
  standIn.scale.copy(source.scale);
  standIn.visible = source.visible;
  standIn.restoreFaceSurfaces(source.serializeDefaultSurface(), modifierBevelStandInSurfaces(source, derived));
  return standIn;
}

/**
 * Resolves one face surface for a derived face from the live authored brush.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns Surface to bake.
 */
export function modifierBevelResolveDerivedSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): FaceSurfaceDescription {
  const record = derived.faces[faceIndex];
  const parent = record?.parentSurfaceIndex ?? 0;
  const authored = source.getFaceSurface(parent);
  if (!record?.chamferEdge) return authored;
  const sourceNormal = source.brush.planes[parent]?.normal ?? authored.uv.planeNormal();
  return modifierBevelSmearSurface(authored, sourceNormal, record.chamferEdge);
}

/**
 * Builds the stand-in face surface list.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @returns Surfaces aligned with derived faces.
 */
function modifierBevelStandInSurfaces(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
): FaceSurfaceDescription[] {
  return derived.faces.map((_, index) => modifierBevelResolveDerivedSurface(source, derived, index));
}
