import * as THREE from 'three';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { DECORATIVE_EDGE_USERDATA_KEY, isSolidBrushEdge } from '@/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import {
  CONTENT_METALNESS,
  CONTENT_ROUGHNESS,
  CONTENT_SPECULAR_INTENSITY,
} from '@/materials/factory_content_material.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { isDefaultSurfaceTexture } from '@/texture/library/factory_debug_texture.js';
import { paintExportBakeSolid } from '@/paint/export/paint_export_bake.js';

/**
 * Name of the export root when the world group has none. Exporters write only
 * its children; files of older versions hold a node of this name, which imports
 * rename after the file.
 */
export const EXPORT_SCENE_ROOT_NAME = 'ExportRoot';

/** Export clones of live materials, by live material. */
type ExportMaterialClones = Map<THREE.Material, THREE.Material>;

/**
 * Builds a temporary scene graph for GLB/export that contains only game
 * content: regular meshes/groups and solid-model CSG result meshes. Excludes
 * brush hull helpers, selection outlines, decorative edges, and clip previews.
 * The returned root is an identity container: exporters write its children as
 * the top-level objects of the file.
 *
 * @param worldGroup Live editor world root.
 * @returns A detached group (does not mutate the live scene).
 */
export function buildExportScene(worldGroup: THREE.Group): THREE.Group {
  const exportRoot = new THREE.Group();
  exportRoot.name = worldGroup.name || EXPORT_SCENE_ROOT_NAME;
  const materials: ExportMaterialClones = new Map();
  worldGroup.children.forEach((child) => {
    const cloned = cloneObjectForExport(child, materials);
    if (cloned) exportRoot.add(cloned);
  });
  return exportRoot;
}

/**
 * Clones one scene object for export, or returns null when it should be
 * omitted.
 *
 * @param object Live scene object.
 * @param materials Material clones of this export.
 * @returns Detached export clone, or null to skip.
 */
function cloneObjectForExport(object: THREE.Object3D, materials: ExportMaterialClones): THREE.Object3D | null {
  if (shouldOmitFromExport(object)) return null;
  if (SolidModel.isSolidModelObject(object)) {
    return cloneSolidModelForExport(object, materials);
  }
  if (object instanceof THREE.Mesh) {
    const clone = cloneContentMeshForExport(object, materials);
    object.children.forEach((child) => {
      if (isEditorHelperObject(child)) return;
      const exported = cloneObjectForExport(child, materials);
      if (exported) clone.add(exported);
    });
    return clone;
  }
  if (object instanceof THREE.Group) {
    return cloneGroupForExport(object, materials);
  }
  return null;
}

/**
 * Returns whether an object is editor-internal and must not appear in exports.
 *
 * @param object Candidate object.
 * @returns True when the object should be omitted.
 */
export function shouldOmitFromExport(object: THREE.Object3D): boolean {
  if (SolidBrushVisual.isBrushObject(object)) return true;
  if (isSolidBrushEdge(object)) return true;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
  if (object.userData['isSelectionHighlight'] === true) return true;
  if (object.userData['isWireframeOverlay'] === true) return true;
  if (object.userData['isFaceSelectionHighlight'] === true) return true;
  if (object.userData['isClipPlanePreview'] === true) return true;
  if (object.userData['isBoundsGuideLines'] === true) return true;
  if (object.userData['isGizmoOccludedGhost'] === true) return true;
  if (object.userData['isBoundsFacePick'] === true) return true;
  if (object.userData['isCadRuler'] === true) return true;
  if (object.userData['isSolidBrushPreview'] === true) return true;
  if (object.userData['isModifierVolume'] === true) return true;
  if (object.userData['isModifierVolumeEdge'] === true) return true;
  return false;
}

/**
 * Clones a solid model as one mesh named after the model, with the model's
 * transform and its compiled CSG result as geometry (a moved result mesh is
 * baked into the geometry). Texture paint and decals are baked into new images
 * on painted faces.
 *
 * @param solidRoot Solid model root group.
 * @param materials Material clones of this export.
 * @returns Export mesh, or null when no result exists.
 */
function cloneSolidModelForExport(solidRoot: THREE.Object3D, materials: ExportMaterialClones): THREE.Mesh | null {
  const resultMesh = findSolidResultMesh(solidRoot);
  if (!resultMesh) return null;
  const mesh = cloneContentMeshForExport(resultMesh, materials);
  mesh.name = solidRoot.name || 'SolidModel';
  paintExportBakeSolid(solidRoot, resultMesh, mesh);
  resultMesh.updateMatrix();
  if (!resultMesh.matrix.equals(new THREE.Matrix4()))
    mesh.geometry = mesh.geometry.clone().applyMatrix4(resultMesh.matrix);
  copyObjectTransform(solidRoot, mesh);
  mesh.visible = solidRoot.visible && resultMesh.visible;
  return mesh;
}

/**
 * Finds the CSG result mesh under a solid model root.
 *
 * @param solidRoot Solid model root.
 * @returns Result mesh or null.
 */
function findSolidResultMesh(solidRoot: THREE.Object3D): THREE.Mesh | null {
  for (const child of solidRoot.children) {
    if (child instanceof THREE.Mesh && SolidModel.isResultMesh(child)) {
      return child;
    }
  }
  return null;
}

/**
 * Clones a hierarchy group, keeping only exportable descendants.
 *
 * @param group Live group.
 * @param materials Material clones of this export.
 * @returns Export group, or null when empty after filtering.
 */
function cloneGroupForExport(group: THREE.Group, materials: ExportMaterialClones): THREE.Group | null {
  const clone = new THREE.Group();
  copyObjectTransform(group, clone);
  clone.name = group.name;
  let childCount = 0;
  group.children.forEach((child) => {
    const exported = cloneObjectForExport(child, materials);
    if (!exported) return;
    clone.add(exported);
    childCount += 1;
  });
  if (childCount === 0) return null;
  return clone;
}

/**
 * Clones a content mesh without editor helper children. Geometry is shared;
 * materials are cloned and built-in default surface maps stripped so export
 * stays small and does not embed editor debug textures.
 *
 * @param mesh Live content or solid result mesh.
 * @param materials Material clones of this export.
 * @returns Mesh clone without helper children.
 */
function cloneContentMeshForExport(mesh: THREE.Mesh, materials: ExportMaterialClones): THREE.Mesh {
  const clone = new THREE.Mesh(mesh.geometry, cloneMaterialsForExport(mesh.material, materials));
  copyObjectTransform(mesh, clone);
  clone.name = mesh.name;
  clone.visible = mesh.visible;
  clone.renderOrder = mesh.renderOrder;
  return clone;
}

/**
 * Clones materials for export and drops non-image canvas maps. A material
 * several meshes share is cloned once, so exports write it once by its name.
 *
 * @param material Live mesh material or material array.
 * @param materials Material clones of this export, by source material.
 * @returns Export-safe material(s).
 */
function cloneMaterialsForExport(
  material: THREE.Material | THREE.Material[],
  materials: ExportMaterialClones,
): THREE.Material | THREE.Material[] {
  const cloneOnce = (entry: THREE.Material) => {
    let clone = materials.get(entry);
    if (!clone) {
      clone = cloneOneMaterialForExport(entry);
      materials.set(entry, clone);
    }
    return clone;
  };
  return Array.isArray(material) ? material.map(cloneOnce) : cloneOnce(material);
}

/**
 * Clones one material for GLB export. Viewport matcaps convert to standard
 * diffuse materials; canvas debug maps are stripped.
 *
 * @param material Live material.
 * @returns Cloned material safe for GLTFExporter.
 */
function cloneOneMaterialForExport(material: THREE.Material): THREE.Material {
  if (isContentViewLitMaterial(material) || material instanceof THREE.MeshMatcapMaterial) {
    return createMatteMaterialFromContent(material);
  }
  const cloned = material.clone();
  clearEditorOnlyMaps(cloned);
  return cloned;
}

/**
 * Builds a matte export material from a viewport content material: physical, so
 * glTF writes its zero specular (KHR_materials_specular) next to zero metalness
 * and full roughness.
 *
 * @param material Live content material (view-lit or legacy matcap).
 * @returns Physical material with albedo only.
 */
function createMatteMaterialFromContent(
  material: THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    flatShading?: boolean;
    side?: THREE.Side;
  },
): THREE.MeshPhysicalMaterial {
  const map = isEditorOnlySurfaceMap(material.map ?? null) ? null : (material.map ?? null);
  return new THREE.MeshPhysicalMaterial({
    color: material.color?.clone() ?? new THREE.Color(0xffffff),
    map,
    metalness: CONTENT_METALNESS,
    roughness: CONTENT_ROUGHNESS,
    specularIntensity: CONTENT_SPECULAR_INTENSITY,
    flatShading: material.flatShading === true,
    side: material.side ?? THREE.FrontSide,
  });
}

/**
 * Nulls editor-only maps so the exporter does not embed the default surface
 * grid.
 *
 * @param material Cloned material to sanitize.
 */
function clearEditorOnlyMaps(material: THREE.Material): void {
  const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
  if (isEditorOnlySurfaceMap(mapHost.map ?? null)) {
    mapHost.map = null;
    material.needsUpdate = true;
  }
}

/**
 * Returns true for maps that must not leave the editor (default grid or
 * canvas).
 *
 * @param map Candidate map.
 * @returns True when the map is editor-only.
 */
function isEditorOnlySurfaceMap(map: THREE.Texture | null): boolean {
  if (!map) {
    return false;
  }
  if (isDefaultSurfaceTexture(map)) {
    return true;
  }
  return map instanceof THREE.CanvasTexture;
}

/**
 * Copies local transform and visibility from source to target.
 *
 * @param source Live object.
 * @param target Export object.
 */
function copyObjectTransform(source: THREE.Object3D, target: THREE.Object3D): void {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.visible = source.visible;
}
