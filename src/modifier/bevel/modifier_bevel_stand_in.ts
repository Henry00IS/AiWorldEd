import type { Vector3 } from 'three';
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
  memo: Map<number, FaceSurfaceDescription> = new Map(),
): FaceSurfaceDescription {
  const cached = memo.get(faceIndex);
  if (cached) return cached;
  const record = derived.faces[faceIndex];
  const parent = record?.parentSurfaceIndex ?? 0;
  const authored = source.getFaceSurface(parent);
  if (!record?.chamferEdge || record.smearFromDerivedIndex < 0) {
    memo.set(faceIndex, authored);
    return authored;
  }
  const smeared = modifierBevelSmearFromRecord(source, derived, record, authored, memo);
  memo.set(faceIndex, smeared);
  return smeared;
}

/**
 * Smears the source face's surface across this generated face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param record Face inherit record.
 * @param authored Authored surface for the parent face.
 * @param memo Resolved surfaces.
 * @returns Smeared surface.
 */
function modifierBevelSmearFromRecord(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  record: ModifierBevelDerivedBrush['faces'][number],
  authored: FaceSurfaceDescription,
  memo: Map<number, FaceSurfaceDescription>,
): FaceSurfaceDescription {
  const fromIndex = record.smearFromDerivedIndex;
  const fromSurface = modifierBevelResolveDerivedSurface(source, derived, fromIndex, memo);
  const fromNormal = modifierBevelSmearSourceNormal(source, derived, fromIndex, record.parentSurfaceIndex);
  if (!record.chamferEdge) return authored;
  return modifierBevelSmearSurface(fromSurface, fromNormal, record.chamferEdge);
}

/**
 * Returns the normal of the face being smeared from.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param fromIndex Derived source face.
 * @param parentSurfaceIndex Authored parent index.
 * @returns Unit normal.
 */
function modifierBevelSmearSourceNormal(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  fromIndex: number,
  parentSurfaceIndex: number,
): Vector3 {
  const fromRecord = derived.faces[fromIndex];
  if (!fromRecord?.chamferEdge) {
    return (
      source.brush.planes[parentSurfaceIndex]?.normal ?? source.getFaceSurface(parentSurfaceIndex).uv.planeNormal()
    );
  }
  return derived.localBrush.planes[fromIndex]?.normal ?? fromRecord.chamferEdge.destNormal;
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
  const memo = new Map<number, FaceSurfaceDescription>();
  return derived.faces.map((_, index) => modifierBevelResolveDerivedSurface(source, derived, index, memo));
}
