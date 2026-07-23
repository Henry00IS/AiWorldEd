import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';

/**
 * UserData flag marking decorative mesh edge wireframes (white outlines).
 */
export const DECORATIVE_EDGE_USERDATA_KEY = 'isDecorativeEdge';

/**
 * Rebuilds decorative edge LineSegments for a mesh from its current geometry.
 * Removes stale edges left over after extrude/CSG/geometry edits.
 * @param mesh The mesh whose decorative edges should match its geometry.
 * @param edgeColor Optional edge color (defaults to theme box edge color).
 */
export function rebuildDecorativeEdges(
  mesh: THREE.Mesh,
  edgeColor: number = Theme.boxEdgeColor
): void {
  removeDecorativeEdges(mesh);
  if (!hasEdgeBuildableGeometry(mesh)) return;
  const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: edgeColor })
  );
  line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
  mesh.add(line);
}

/**
 * Returns whether a mesh has a position attribute suitable for EdgesGeometry.
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
 * Removes selection and wireframe overlay children that should not persist
 * across geometry replacement (they are recreated by their owners).
 * @param mesh The mesh to clean.
 */
export function stripEditorOverlayChildren(mesh: THREE.Mesh): void {
  const toRemove = mesh.children.filter((child) => isEditorOverlayChild(child));
  toRemove.forEach((child) => {
    mesh.remove(child);
    disposeLineObject(child);
  });
}

/**
 * Prepares a geometry for hard-edge (flat) shading used by the world editor.
 * Converts to non-indexed triangles so each face has independent normals.
 * Does not dispose the input geometry (caller owns that reference).
 * @param geometry The source geometry (may be indexed).
 * @returns A flat-shaded non-indexed geometry ready for a mesh.
 */
export function prepareFlatShadedGeometry(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  source.computeVertexNormals();
  source.computeBoundingSphere();
  source.computeBoundingBox();
  return source;
}

/**
 * Applies flat shading to a mesh material when supported.
 * @param mesh The mesh whose material should use flat shading.
 */
export function enableFlatShadingOnMesh(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) return;
    if ('flatShading' in material) {
      (material as THREE.MeshStandardMaterial).flatShading = true;
      material.needsUpdate = true;
    }
  });
}

/**
 * Returns true for decorative edge line children.
 * @param object The child object to test.
 * @returns True if the object is a decorative edge outline.
 */
export function isDecorativeEdge(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.LineSegments)) return false;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (isEditorOverlayChild(object)) return false;
  return true;
}

/**
 * Returns true for selection/wireframe overlay children.
 * @param object The child object to test.
 * @returns True if the object is an editor overlay.
 */
function isEditorOverlayChild(object: THREE.Object3D): boolean {
  if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
  if (object.userData.isSelectionHighlight === true) return true;
  if (object.userData.isWireframeOverlay === true) return true;
  if (object.userData.isFaceSelectionHighlight === true) return true;
  return false;
}

/**
 * Returns true for objects that are editor internals, not scene hierarchy content.
 * Used by the outliner and hierarchy tools to hide decorative edges, selection
 * outlines, wireframe overlays, and similar helpers parented under meshes.
 * @param object The object to test.
 * @returns True when the object should be hidden from the content outliner.
 */
export function isEditorHelperObject(object: THREE.Object3D): boolean {
  if (isEditorOverlayChild(object)) return true;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData.isBoundsGuideLines === true) return true;
  if (object.userData.isGizmoOccludedGhost === true) return true;
  if (object.userData.isBoundsFacePick === true) return true;
  if (object.userData.isClipPlanePreview === true) return true;
  if (object.userData.isSolidModelResult === true) return true;
  if (object instanceof THREE.LineSegments && isDecorativeEdge(object)) {
    return true;
  }
  return false;
}

/**
 * Disposes geometry and material of a line object.
 * @param object The line object to dispose.
 */
function disposeLineObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.LineSegments) && !(object instanceof THREE.Line)) {
    return;
  }
  object.geometry?.dispose();
  if (Array.isArray(object.material)) {
    object.material.forEach((material) => material.dispose());
  } else if (object.material) {
    object.material.dispose();
  }
}
