import * as THREE from 'three';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SOLID_VERTEX_EQUAL_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidTreeBrushTexturesApply, solidTreeNodesCreate } from '@/solid/commands/tree/solid_tree_nodes_create.js';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { solidChunkUvProject } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { SeamModelConformer } from '@/solid/mesh/seam/seam_model_conformer.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { shouldReverseSurfaceWinding } from '@/solid/types/surface_category.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { createDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { textureUvProjectAxis } from '@/texture/uv_project/texture_uv_project_view.js';
import {
  solidScriptMeshChecked,
  solidScriptMeshJoin,
  solidScriptMeshLoopNormal,
  solidScriptMeshMerge,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from './solid_script_mesh.js';
import { solidScriptMeshGridSplit } from './solid_script_mesh_grid_split.js';
import type { SolidScriptShape } from './solid_script_shape.js';
import { solidScriptSolidTreeBuild } from './solid_script_solid_tree.js';

/** Script-space origin used when baking brushes in their own frame. */
const SOLID_SCRIPT_MESH_BAKE_OFFSET = new THREE.Vector3();

/** Identity parent transform used when baking brushes in their own frame. */
const SOLID_SCRIPT_MESH_BAKE_TO_PARENT = new THREE.Matrix4();

/**
 * Most rounds of splitting faces into grids, where each round's new grid points
 * can give neighbouring faces extra vertices to split at.
 */
const SOLID_SCRIPT_MESH_GRID_ROUNDS_MAX = 8;

/**
 * Turns evaluated shapes into one mesh: existing meshes stay as they are, and
 * brushes, including their Modes and Groups, are baked through the editor CSG
 * compiler so cuts and overlaps become faces of a regular mesh.
 *
 * @param shapes Shapes built between Mesh From Solids and its End.
 * @param label Mesh label, for messages.
 * @returns Mesh, or null when nothing was built.
 */
export function solidScriptMeshFromBrushes(
  shapes: readonly SolidScriptShape[],
  label: string,
): SolidScriptShapeMesh | null {
  const meshes = [...solidScriptMeshesIn(shapes), ...solidScriptMeshBrushesBake(shapes, label)];
  return meshes.length === 0 ? null : solidScriptMeshJoin(meshes, label);
}

/**
 * Collects meshes already present in a shape tree.
 *
 * @param shapes Shape trees.
 * @returns Meshes in tree order.
 */
function solidScriptMeshesIn(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  return shapes.flatMap((shape) => {
    if (shape.kind === 'mesh') return [shape];
    if (shape.kind === 'solid' || shape.kind === 'polygon') return [];
    return solidScriptMeshesIn(shape.children);
  });
}

/**
 * Bakes the brushes in a shape tree through the editor CSG compiler.
 *
 * @param shapes Shape trees.
 * @param label Mesh label, for messages.
 * @returns A one-item list with the baked mesh, or empty when there are no
 *   brushes.
 */
function solidScriptMeshBrushesBake(shapes: readonly SolidScriptShape[], label: string): SolidScriptShapeMesh[] {
  const nodes = solidScriptSolidTreeBuild(shapes, {
    offset: SOLID_SCRIPT_MESH_BAKE_OFFSET,
    worldToParent: SOLID_SCRIPT_MESH_BAKE_TO_PARENT,
    operation: SolidOperation.Additive,
    namePrefix: '',
  });
  if (solidScriptMeshBrushCount(nodes) === 0) return [];
  return [solidScriptMeshTreeBake(nodes, label)];
}

/**
 * Counts the brushes in a node list.
 *
 * @param nodes Nodes.
 * @returns Brush count.
 */
function solidScriptMeshBrushCount(nodes: readonly SolidTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.kind === 'brush' ? 1 : solidScriptMeshBrushCount(node.children)), 0);
}

/**
 * Builds a bare CSG group tree, compiles it, and turns the polygons into a
 * welded mesh.
 *
 * @param nodes Brush and group nodes in evaluation order.
 * @param label Mesh label, for messages.
 * @returns Baked mesh.
 */
function solidScriptMeshTreeBake(nodes: readonly SolidTreeNode[], label: string): SolidScriptShapeMesh {
  const root = new THREE.Group();
  const instances: SolidBrushInstance[] = [];
  const next = { id: 0 };
  solidTreeNodesCreate(nodes, root, (node, parent) => {
    const instance = solidScriptMeshBrushInsert(node, parent, `script-bake-${next.id}`);
    next.id += 1;
    instances.push(instance);
    return instance;
  });
  root.updateMatrixWorld(true);
  const polygons = new SolidCsgCompiler().compile(instances, { forceFull: true, solidRoot: root });
  solidScriptMeshBrushPreviewsDispose(instances);
  if (polygons.length === 0)
    throw new Error(`${label} has nothing left; the Subtractive or Intersecting solids removed everything`);
  return solidScriptMeshFromPolygons(polygons, instances, label);
}

/**
 * Validates a brush, creates its instance under a parent, and applies textures
 * and UV mappings.
 *
 * @param node Brush node.
 * @param parent Parent to append to.
 * @param id Temporary instance id.
 * @returns Configured instance with a preview mesh parented.
 */
function solidScriptMeshBrushInsert(node: SolidTreeBrush, parent: THREE.Object3D, id: string): SolidBrushInstance {
  solidScriptMeshBrushChecked(node, 'Mesh From Solids');
  const instance = new SolidBrushInstance(id, node.name, node.brush, node.operation);
  instance.position.copy(node.center);
  if (node.texture) instance.setAllFacesTextureId(node.texture);
  solidTreeBrushTexturesApply(instance, node);
  solidScriptMeshBrushUvsApply(instance, node);
  const preview = SolidBrushVisual.createHullPreview(node.name, node.brush, node.operation);
  instance.attachMesh(preview);
  parent.add(preview);
  return instance;
}

/**
 * Stops the line when a brush would be skipped by the compiler as non-convex.
 *
 * @param node Brush node.
 * @param label Tool label, for the message.
 */
function solidScriptMeshBrushChecked(node: SolidTreeBrush, label: string): void {
  const result = SolidBrushValidator.validate(node.brush);
  if (result.valid) return;
  const reason = result.errors[0] ?? 'it is no longer a convex solid';
  throw new Error(`${label} stopped because ${node.name} failed a convex-solid check: ${reason}`);
}

/**
 * Applies stored face UV matrices, or a box projection when the script asked
 * for one.
 *
 * @param instance Brush instance.
 * @param node Source node.
 */
function solidScriptMeshBrushUvsApply(instance: SolidBrushInstance, node: SolidTreeBrush): void {
  if (node.faceUvs) {
    node.faceUvs.forEach((uv, index) => {
      if (!uv) return;
      const surface = instance.getFaceSurface(index);
      instance.setFaceSurface(index, { ...surface, uv });
    });
    return;
  }
  const size = node.boxUvSize;
  if (size === undefined || size <= 0) return;
  node.brush.faces.forEach((_, index) => solidScriptMeshBrushBoxUv(instance, node, index, size));
}

/**
 * Box-projects one face from the axis it points along most.
 *
 * @param instance Brush instance.
 * @param node Source node.
 * @param index Face index.
 * @param size Metres covered by one texture repeat.
 */
function solidScriptMeshBrushBoxUv(
  instance: SolidBrushInstance,
  node: SolidTreeBrush,
  index: number,
  size: number,
): void {
  const surface = instance.getFaceSurface(index);
  const plane = node.brush.planes[index];
  const normal = plane ? plane.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
  instance.setFaceSurface(index, { ...surface, uv: textureUvProjectAxis(normal, size) });
}

/**
 * Frees preview geometries created only for the bake.
 *
 * @param instances Baked instances.
 */
function solidScriptMeshBrushPreviewsDispose(instances: readonly SolidBrushInstance[]): void {
  for (const instance of instances) {
    instance.mesh?.geometry.dispose();
    instance.mesh?.removeFromParent();
  }
}

/**
 * Turns compiled polygons into a script mesh, with UVs baked the same way as
 * editor mesh chunks. Corners of one polygon lying on another polygon's edge
 * are inserted into that edge first, the same way the editor closes
 * T-junctions, so welding shared corners leaves every edge with two faces.
 *
 * @param polygons Compiled surface polygons.
 * @param instances Brushes the polygons came from.
 * @param label Mesh label.
 * @returns Welded mesh.
 */
function solidScriptMeshFromPolygons(
  polygons: readonly SolidCompiledPolygon[],
  instances: readonly SolidBrushInstance[],
  label: string,
): SolidScriptShapeMesh {
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const inverses = solidScriptMeshBrushInverses(instances);
  const mesh: SolidScriptShapeMesh = { kind: 'mesh', label, points: [], faces: [], uvs: [] };
  const texture = solidScriptMeshBakeTexture(polygons);
  if (texture !== undefined) mesh.texture = texture;
  for (const polygon of solidScriptMeshPolygonsGridded(polygons))
    solidScriptMeshPolygonAdd(mesh, polygon, byId, inverses);
  return solidScriptMeshMerge(solidScriptMeshChecked(mesh), SOLID_VERTEX_EQUAL_EPSILON);
}

/**
 * Conforms the polygons and splits every four-cornered one that gained extra
 * vertices into a grid of four-sided cells, round after round, until no face
 * has a vertex in the middle of a side it could be split at. Faces of another
 * shape keep their extra vertices, so the result always conforms.
 *
 * @param polygons Compiled polygons of every baked brush.
 * @returns Conformed polygons, four-cornered ones split into grids.
 */
function solidScriptMeshPolygonsGridded(polygons: readonly SolidCompiledPolygon[]): SolidCompiledPolygon[] {
  let current = solidScriptMeshPolygonsConformed(polygons);
  for (let round = 0; round < SOLID_SCRIPT_MESH_GRID_ROUNDS_MAX; round++) {
    const split = solidScriptMeshPolygonsGridSplit(current);
    if (!split) return current;
    current = solidScriptMeshPolygonsConformed(split);
  }
  return current;
}

/**
 * Splits every polygon that can be split into a grid.
 *
 * @param polygons Conformed polygons.
 * @returns Polygons with the grids in place, or null when none was split.
 */
function solidScriptMeshPolygonsGridSplit(polygons: readonly SolidCompiledPolygon[]): SolidCompiledPolygon[] | null {
  let changed = false;
  const result = polygons.flatMap((polygon) => {
    const cells = solidScriptMeshGridSplit(polygon);
    if (cells) changed = true;
    return cells ?? [polygon];
  });
  return changed ? result : null;
}

/**
 * Inserts every corner that lies inside another polygon's edge into that edge,
 * through the editor's seam conformer.
 *
 * @param polygons Compiled polygons of every baked brush.
 * @returns Polygons with their conformed outlines, grouped by brush.
 */
function solidScriptMeshPolygonsConformed(polygons: readonly SolidCompiledPolygon[]): SolidCompiledPolygon[] {
  const byBrush = solidScriptMeshPolygonsByBrush(polygons);
  const brushOrder = [...byBrush.keys()];
  const conformer = new SeamModelConformer();
  conformer.refresh(brushOrder, brushOrder, (brushId) => byBrush.get(brushId));
  return brushOrder.flatMap((brushId) => conformer.polygonsForMesh(brushId, byBrush.get(brushId) ?? []));
}

/**
 * Groups compiled polygons by the brush they came from, in first-seen order.
 *
 * @param polygons Compiled polygons.
 * @returns Polygons per brush id.
 */
function solidScriptMeshPolygonsByBrush(
  polygons: readonly SolidCompiledPolygon[],
): Map<string, SolidCompiledPolygon[]> {
  const byBrush = new Map<string, SolidCompiledPolygon[]>();
  for (const polygon of polygons) {
    const list = byBrush.get(polygon.brushId);
    if (list) list.push(polygon);
    else byBrush.set(polygon.brushId, [polygon]);
  }
  return byBrush;
}

/**
 * Inverse of each brush's model-space matrix, for UV projection.
 *
 * @param instances Baked instances.
 * @returns Inverse matrix per brush id.
 */
function solidScriptMeshBrushInverses(instances: readonly SolidBrushInstance[]): Map<string, THREE.Matrix4> {
  return new Map(instances.map((instance) => [instance.id, instance.getModelSpaceMatrix().invert()]));
}

/**
 * Texture of the mesh when every compiled face shares one; none otherwise.
 *
 * @param polygons Compiled polygons.
 * @returns Shared texture id, or undefined when they differ or use the default.
 */
function solidScriptMeshBakeTexture(polygons: readonly SolidCompiledPolygon[]): string | undefined {
  const textures = new Set(polygons.map((polygon) => polygon.textureId).filter((id) => id.length > 0));
  if (textures.size !== 1) return undefined;
  const [texture] = textures;
  return texture && texture !== DEFAULT_CHECKER_TEXTURE_ID ? texture : undefined;
}

/**
 * Appends one compiled polygon as a face, with baked corner UVs.
 *
 * @param mesh Mesh being built.
 * @param polygon Compiled polygon.
 * @param byId Instances by id.
 * @param inverses Inverse model matrices by brush id.
 */
function solidScriptMeshPolygonAdd(
  mesh: SolidScriptShapeMesh,
  polygon: SolidCompiledPolygon,
  byId: ReadonlyMap<string, SolidBrushInstance>,
  inverses: ReadonlyMap<string, THREE.Matrix4>,
): void {
  if (polygon.vertices.length < 3) return;
  const loop = solidScriptMeshPolygonLoop(polygon);
  const uvs = loop.map((vertex) => solidScriptMeshPolygonUv(polygon, vertex, byId, inverses));
  const base = mesh.points.length;
  mesh.points.push(...loop.map((vertex) => vertex.clone()));
  mesh.faces.push(loop.map((_, index) => base + index));
  mesh.uvs.push(uvs);
}

/**
 * Vertices of a compiled polygon in outward winding.
 *
 * @param polygon Compiled polygon.
 * @returns Wound vertices.
 */
function solidScriptMeshPolygonLoop(polygon: SolidCompiledPolygon): THREE.Vector3[] {
  const loop = polygon.vertices.map((vertex) => vertex.clone());
  const normal = solidScriptMeshLoopNormal(
    loop,
    loop.map((_, index) => index),
  );
  if (normal.dot(polygon.normal) < 0) loop.reverse();
  return loop;
}

/**
 * Bakes one corner's UV from the source face's mapping.
 *
 * @param polygon Compiled polygon.
 * @param vertex Corner in model space.
 * @param byId Instances by id.
 * @param inverses Inverse model matrices by brush id.
 * @returns Texture coordinates.
 */
function solidScriptMeshPolygonUv(
  polygon: SolidCompiledPolygon,
  vertex: THREE.Vector3,
  byId: ReadonlyMap<string, SolidBrushInstance>,
  inverses: ReadonlyMap<string, THREE.Matrix4>,
): SolidScriptUv {
  const instance = byId.get(polygon.brushId);
  const surface = instance?.getFaceSurface(polygon.surfaceIndex) ?? createDefaultFaceSurface();
  const modelToBrush = inverses.get(polygon.brushId) ?? new THREE.Matrix4();
  const coords = solidChunkUvProject(vertex, surface, modelToBrush, shouldReverseSurfaceWinding(polygon.category));
  return [coords.u, coords.v];
}
