import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { isDecorativeEdge, usesContentDecorativeEdges } from '@/utils/mesh_edge_sync.js';

/** UserData key marking temporary final-mesh wireframe lines. */
export const MESH_WIREFRAME_OVERLAY_USERDATA_KEY = 'isMeshWireframeOverlay';

/** Wireframe lines of one mesh and the geometry state they were built from. */
interface MeshWireframeEntry {
  geometry: THREE.BufferGeometry;
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  positionVersion: number;
  index: THREE.BufferAttribute | null;
  indexVersion: number;
  lines: THREE.LineSegments;
}

/** Cached wireframe lines per source mesh. */
const wireframeEntriesByMesh = new WeakMap<THREE.Mesh, MeshWireframeEntry>();

/** Shared line materials of the final mesh wireframe, keyed by line color. */
const meshWireframeMaterials = new Map<number, THREE.LineBasicMaterial>();

/**
 * Adds the triangle wireframe of every visible final mesh under a world root
 * for one render pass: compiled CSG results and plain content meshes. Lines
 * live in the scene, not under their meshes, so they still draw when a mode
 * hides the CSG result (Overlap). Returns a callback that removes them.
 *
 * @param worldRoot World group containing content.
 * @param scene Scene the lines are drawn in.
 * @param seeThrough True when the mode draws no opaque surfaces, so light lines
 *   read on the dark background.
 * @returns Removal callback.
 */
export function addMeshWireframeOverlays(
  worldRoot: THREE.Object3D,
  scene: THREE.Object3D,
  seeThrough = false,
): () => void {
  const material = resolveMeshWireframeMaterial(
    seeThrough ? Theme.meshWireframeSeeThroughColor : Theme.meshWireframeColor,
  );
  const added: THREE.LineSegments[] = [];
  collectFinalMeshes(worldRoot).forEach((mesh) => {
    const lines = resolveMeshWireframeLines(mesh);
    if (!lines) return;
    lines.material = material;
    added.push(lines);
  });
  if (added.length > 0) scene.add(...added);
  return () => added.forEach((lines) => lines.removeFromParent());
}

/**
 * Collects final meshes whose parents are visible. CSG results count even while
 * hidden, since Overlap hides them only for its pass.
 *
 * @param worldRoot World group containing content.
 * @returns Final meshes.
 */
function collectFinalMeshes(worldRoot: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible && !isResultMesh(object)) return;
    if (object instanceof THREE.Mesh && isFinalMesh(object)) meshes.push(object);
    object.children.forEach(visit);
  };
  visit(worldRoot);
  return meshes;
}

/**
 * Returns whether a mesh is final output geometry: a compiled CSG result, or a
 * content mesh that draws its own content edges.
 *
 * @param mesh Candidate mesh.
 * @returns True for final meshes.
 */
export function isFinalMesh(mesh: THREE.Mesh): boolean {
  if (isResultMesh(mesh)) return true;
  return usesContentDecorativeEdges(mesh) && mesh.children.some((child) => isDecorativeEdge(child));
}

/**
 * Returns the cached wireframe lines of a mesh, rebuilding them when its
 * geometry changed.
 *
 * @param mesh Final mesh.
 * @returns Lines, or null when the mesh has no triangles.
 */
function resolveMeshWireframeLines(mesh: THREE.Mesh): THREE.LineSegments | null {
  const position = mesh.geometry?.getAttribute('position');
  if (!position || position.count < 3) return null;
  const cached = wireframeEntriesByMesh.get(mesh);
  if (cached && isMeshWireframeCurrent(cached, mesh.geometry)) return cached.lines;
  cached?.lines.geometry.dispose();
  const lines = cached?.lines ?? createMeshWireframeLines(mesh);
  lines.geometry = new THREE.WireframeGeometry(mesh.geometry);
  wireframeEntriesByMesh.set(mesh, {
    geometry: mesh.geometry,
    position,
    positionVersion: readAttributeVersion(position),
    index: mesh.geometry.index,
    indexVersion: mesh.geometry.index?.version ?? -1,
    lines,
  });
  return lines;
}

/**
 * Returns whether cached lines still match the mesh geometry.
 *
 * @param entry Cached lines.
 * @param geometry Current mesh geometry.
 * @returns True when nothing changed.
 */
function isMeshWireframeCurrent(entry: MeshWireframeEntry, geometry: THREE.BufferGeometry): boolean {
  if (entry.geometry !== geometry || entry.index !== geometry.index) return false;
  const position = geometry.getAttribute('position');
  if (entry.position !== position || entry.positionVersion !== readAttributeVersion(position)) return false;
  return entry.indexVersion === (geometry.index?.version ?? -1);
}

/**
 * Reads the upload version of a position attribute.
 *
 * @param attribute Position attribute.
 * @returns Version counter.
 */
function readAttributeVersion(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number {
  return attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
}

/**
 * Creates the line object that follows a mesh's world transform at draw time.
 *
 * @param mesh Source mesh.
 * @returns Lines without geometry yet.
 */
function createMeshWireframeLines(mesh: THREE.Mesh): THREE.LineSegments {
  const lines = new THREE.LineSegments(new THREE.BufferGeometry());
  lines.name = 'mesh_wireframe_overlay';
  lines.userData[MESH_WIREFRAME_OVERLAY_USERDATA_KEY] = true;
  lines.userData['isWireframeOverlay'] = true;
  lines.matrixAutoUpdate = false;
  lines.matrixWorldAutoUpdate = false;
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  lines.raycast = () => undefined;
  lines.onBeforeRender = () => lines.matrixWorld.copy(mesh.matrixWorld);
  return lines;
}

/**
 * Returns the shared final mesh wireframe line material of a color.
 *
 * @param color Line color.
 * @returns Line material.
 */
function resolveMeshWireframeMaterial(color: number): THREE.LineBasicMaterial {
  const cached = meshWireframeMaterials.get(color);
  if (cached) return cached;
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false });
  meshWireframeMaterials.set(color, material);
  return material;
}
