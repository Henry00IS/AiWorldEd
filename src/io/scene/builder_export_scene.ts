import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { DECORATIVE_EDGE_USERDATA_KEY, isSolidBrushEdge } from '@/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { CONTENT_METALNESS, CONTENT_ROUGHNESS } from '@/materials/factory_content_material.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { isDefaultSurfaceTexture } from '@/texture/library/factory_debug_texture.js';

/**
 * Builds a temporary scene graph for GLB/export that contains only game
 * content: regular meshes/groups and solid-model CSG result meshes. Excludes
 * brush hull helpers, selection outlines, decorative edges, and clip previews.
 *
 * @param worldGroup Live editor world root.
 * @returns A detached group safe to pass to GLTFExporter (does not mutate the
 *   live scene).
 */
export function buildExportScene(worldGroup: THREE.Group): THREE.Group {
  const exportRoot = new THREE.Group();
  exportRoot.name = worldGroup.name || 'ExportRoot';
  worldGroup.children.forEach((child) => {
    const cloned = cloneObjectForExport(child);
    if (cloned) exportRoot.add(cloned);
  });
  return exportRoot;
}

/**
 * Clones one scene object for export, or returns null when it should be
 * omitted.
 *
 * @param object Live scene object.
 * @returns Detached export clone, or null to skip.
 */
function cloneObjectForExport(object: THREE.Object3D): THREE.Object3D | null {
  if (shouldOmitFromExport(object)) return null;
  if (SolidModel.isSolidModelObject(object)) {
    return cloneSolidModelForExport(object);
  }
  if (object instanceof THREE.Mesh) {
    return cloneContentMeshForExport(object);
  }
  if (object instanceof THREE.Group) {
    return cloneGroupForExport(object);
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
 * Clones a solid model as a group containing only the compiled CSG result mesh.
 *
 * @param solidRoot Solid model root group.
 * @returns Export group with result mesh, or null when no result exists.
 */
function cloneSolidModelForExport(solidRoot: THREE.Object3D): THREE.Group | null {
  const resultMesh = findSolidResultMesh(solidRoot);
  if (!resultMesh) return null;
  const group = new THREE.Group();
  copyObjectTransform(solidRoot, group);
  group.name = solidRoot.name || 'SolidModel';
  const resultClone = cloneContentMeshForExport(resultMesh);
  group.add(resultClone);
  return group;
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
 * @returns Export group, or null when empty after filtering.
 */
function cloneGroupForExport(group: THREE.Group): THREE.Group | null {
  const clone = new THREE.Group();
  copyObjectTransform(group, clone);
  clone.name = group.name;
  let childCount = 0;
  group.children.forEach((child) => {
    const exported = cloneObjectForExport(child);
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
 * @returns Mesh clone without helper children.
 */
function cloneContentMeshForExport(mesh: THREE.Mesh): THREE.Mesh {
  const clone = new THREE.Mesh(mesh.geometry, cloneMaterialsForExport(mesh.material));
  copyObjectTransform(mesh, clone);
  clone.name = mesh.name;
  clone.visible = mesh.visible;
  clone.renderOrder = mesh.renderOrder;
  return clone;
}

/**
 * Clones materials for export and drops non-image canvas maps.
 *
 * @param material Live mesh material or material array.
 * @returns Export-safe material(s).
 */
function cloneMaterialsForExport(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => cloneOneMaterialForExport(entry));
  }
  return cloneOneMaterialForExport(material);
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
    return createStandardMaterialFromContent(material);
  }
  const cloned = material.clone();
  clearEditorOnlyMaps(cloned);
  return cloned;
}

/**
 * Builds an export MeshStandardMaterial from a viewport content material.
 *
 * @param material Live content material (view-lit or legacy matcap).
 * @returns Standard material with albedo only.
 */
function createStandardMaterialFromContent(
  material: THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    flatShading?: boolean;
    side?: THREE.Side;
  },
): THREE.MeshStandardMaterial {
  const map = isEditorOnlySurfaceMap(material.map ?? null) ? null : (material.map ?? null);
  return new THREE.MeshStandardMaterial({
    color: material.color?.clone() ?? new THREE.Color(0xffffff),
    map,
    metalness: CONTENT_METALNESS,
    roughness: CONTENT_ROUGHNESS,
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
