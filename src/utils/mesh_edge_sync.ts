import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import {
  BRUSH_EDGE_SHARED_MATERIAL_KEY,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
} from '@/solid/model/solid_brush_edge_materials.js';
import { getOrBuildMeshDocumentOutlineEdges } from '@/mesh/convert/mesh_document_outline_edges.js';

/**
 * UserData key set on decorative edge LineSegments parented under content
 * meshes.
 */
export const DECORATIVE_EDGE_USERDATA_KEY = 'isDecorativeEdge';

/** UserData keys that cause a mesh to skip content decorative edge rebuild. */
const SKIP_CONTENT_EDGE_MESH_KEYS = ['isSolidBrush', 'isSolidModelResult'] as const;

/**
 * Removes existing decorative edge children, then adds outline LineSegments
 * when the mesh uses content decorative edges and has buildable geometry.
 * Prefers MeshDocument wing-edge topology (same lines as Edit Mode / selection)
 * so n-gon ear-clip diagonals are not drawn.
 *
 * @param mesh The mesh whose decorative edge children are updated.
 * @param edgeColor Line material color (defaults to theme box edge color).
 */
export function rebuildDecorativeEdges(mesh: THREE.Mesh, edgeColor: number = Theme.boxEdgeColor): void {
  if (!usesContentDecorativeEdges(mesh)) {
    removeDecorativeEdges(mesh);
    return;
  }
  removeDecorativeEdges(mesh);
  if (!hasEdgeBuildableGeometry(mesh)) return;
  const edges = resolveDecorativeEdgeGeometry(mesh);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor }));
  line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
  line.userData['decorativeEdgeGeometryShared'] = edges.userData['meshDocumentOutlineShared'] === true;
  mesh.add(line);
}

/**
 * Resolves outline edge geometry for a content mesh.
 *
 * @param mesh Content mesh.
 * @returns Edge geometry (document topology or GPU EdgesGeometry).
 */
function resolveDecorativeEdgeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const documentEdges = getOrBuildMeshDocumentOutlineEdges(mesh);
  if (documentEdges) {
    documentEdges.userData['meshDocumentOutlineShared'] = true;
    return documentEdges;
  }
  return new THREE.EdgesGeometry(mesh.geometry, 1);
}

/**
 * Returns whether the mesh has none of the skip userData keys that exclude it
 * from content decorative edges.
 *
 * @param mesh Candidate mesh.
 * @returns True when no skip key is set true on mesh.userData.
 */
export function usesContentDecorativeEdges(mesh: THREE.Mesh): boolean {
  for (const key of SKIP_CONTENT_EDGE_MESH_KEYS) {
    if (mesh.userData[key] === true) return false;
  }
  return true;
}

/**
 * Returns whether a mesh has a position attribute suitable for EdgesGeometry.
 *
 * @param mesh Candidate mesh.
 * @returns True when at least three position vertices exist.
 */
export function hasEdgeBuildableGeometry(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry) return false;
  const position = mesh.geometry.getAttribute('position');
  return !!position && position.count >= 3;
}

/**
 * Removes decorative edge children from a mesh and disposes their resources.
 *
 * @param mesh The mesh to clean.
 */
export function removeDecorativeEdges(mesh: THREE.Mesh): void {
  const toRemove = mesh.children.filter((child) => isDecorativeEdge(child));
  toRemove.forEach((child) => {
    mesh.remove(child);
    disposeLineObject(child);
  });
}

/**
 * Builds a non-indexed copy of the geometry when indexed, otherwise clones it,
 * then recomputes vertex normals, bounding sphere, and bounding box. Does not
 * dispose the input geometry.
 *
 * @param geometry The source geometry (may be indexed).
 * @returns A non-indexed geometry with recomputed normals and bounds.
 */
export function prepareFlatShadedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  source.computeVertexNormals();
  source.computeBoundingSphere();
  source.computeBoundingBox();
  return source;
}

/**
 * Applies flat shading to a mesh material when supported.
 *
 * @param mesh The mesh whose material should use flat shading.
 */
export function enableFlatShadingOnMesh(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) {
      return;
    }
    applyWritableFlatShading(material);
  });
}

/**
 * Sets flatShading to true when the material exposes a writable flatShading
 * flag, then marks the material for update. Materials with a read-only
 * flatShading getter are left unchanged.
 *
 * @param material Mesh material to update.
 */
function applyWritableFlatShading(material: THREE.Material): void {
  if (!materialHasWritableFlatShading(material)) {
    return;
  }
  (material as THREE.Material & { flatShading: boolean }).flatShading = true;
  material.needsUpdate = true;
}

/**
 * Returns true when flatShading can be assigned on the material.
 *
 * @param material Material to inspect.
 * @returns True when a setter or data property exists.
 */
function materialHasWritableFlatShading(material: THREE.Material): boolean {
  if (!('flatShading' in material)) {
    return false;
  }
  let current: object | null = material;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'flatShading');
    if (descriptor) {
      return typeof descriptor.set === 'function' || descriptor.writable === true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Returns true when the object is a LineSegments instance with the decorative
 * edge userData key set and the solid brush edge userData key not set.
 *
 * @param object The child object to test.
 * @returns True when the object is a content decorative edge LineSegments.
 */
export function isDecorativeEdge(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.LineSegments)) return false;
  if (object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return false;
  return object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true;
}

/**
 * Returns true for solid brush edge line children.
 *
 * @param object The child object to test.
 * @returns True if the object is a brush volume edge helper.
 */
export function isSolidBrushEdge(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.LineSegments)) return false;
  return object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true;
}

/**
 * Returns true for selection/wireframe overlay children.
 *
 * @param object The child object to test.
 * @returns True if the object is an editor overlay.
 */
function isEditorOverlayChild(object: THREE.Object3D): boolean {
  if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
  if (object.userData['isSelectionHighlight'] === true) return true;
  if (object.userData['isWireframeOverlay'] === true) return true;
  if (object.userData['isFaceSelectionHighlight'] === true) return true;
  return false;
}

/**
 * Returns true when the object is an editor overlay child or has a userData
 * flag for decorative edge, solid brush edge, bounds guide lines, gizmo
 * occluded ghost, bounds face pick, clip plane preview, CAD ruler, or solid
 * model result.
 *
 * @param object The object to test.
 * @returns True when any of those helper flags or overlay checks match.
 */
export function isEditorHelperObject(object: THREE.Object3D): boolean {
  if (isEditorOverlayChild(object)) return true;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData['isBoundsGuideLines'] === true) return true;
  if (object.userData['isGizmoOccludedGhost'] === true) return true;
  if (object.userData['isBoundsFacePick'] === true) return true;
  if (object.userData['isClipPlanePreview'] === true) return true;
  if (object.userData['isCadRuler'] === true) return true;
  if (object.userData['isSolidModelResult'] === true) return true;
  return false;
}

/**
 * Disposes geometry on a Line or LineSegments object and disposes each material
 * that is not marked as a shared brush edge material.
 *
 * @param object The line object whose resources are disposed.
 */
function disposeLineObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.LineSegments) && !(object instanceof THREE.Line)) {
    return;
  }
  if (object.userData['decorativeEdgeGeometryShared'] !== true) {
    object.geometry?.dispose();
  }
  if (Array.isArray(object.material)) {
    object.material.forEach((material) => disposeOwnedLineMaterial(material));
    return;
  }
  if (object.material) disposeOwnedLineMaterial(object.material);
}

/**
 * Disposes a line material unless it is a shared brush edge material.
 *
 * @param material Material to dispose.
 */
function disposeOwnedLineMaterial(material: THREE.Material): void {
  if (material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] === true) return;
  material.dispose();
}
