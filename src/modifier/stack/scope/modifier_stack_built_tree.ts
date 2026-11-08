import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh, isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackPoseTouches } from '@/modifier/stack/evaluate/modifier_stack_capture.js';

/**
 * One brush of a volume's scope. Only brushes whose hull meets the volume carry
 * world planes; the others can never contain a point inside the volume.
 */
export interface ModifierStackBuiltLeaf {
  kind: 'leaf';
  /** CSG operation relative to the parent. */
  operation: SolidOperation;
  /** Authored brush or generator piece. */
  brush: SolidBrushInstance;
  /** Brush-to-world matrix. */
  toWorld: THREE.Matrix4;
  /** Outward world planes, or null when the hull misses the volume. */
  planes: SolidPlane[] | null;
  /** Generator node that built the piece, or null for an authored brush. */
  generator: THREE.Object3D | null;
  /** Position in CSG order across the whole scope tree. */
  order: number;
  /** Child lists from the scope's top list down to the one holding the leaf. */
  lists: readonly ModifierStackBuiltNode[][];
}

/** A CSG group of a volume's scope: children combined from empty. */
export interface ModifierStackBuiltBranch {
  kind: 'branch';
  /** CSG operation relative to the parent. */
  operation: SolidOperation;
  /** Child nodes in CSG order. */
  children: ModifierStackBuiltNode[];
}

/** Node of the CSG tree a volume tests built geometry against. */
export type ModifierStackBuiltNode = ModifierStackBuiltLeaf | ModifierStackBuiltBranch;

/** Lookups used while the scope tree is built. */
export interface ModifierStackBuiltSources {
  /** Authored brushes by id. */
  authored: ReadonlyMap<string, SolidBrushInstance>;
  /** Pieces each generator node of the solid built, in solid space. */
  generators: ReadonlyMap<THREE.Object3D, readonly ModifierStackUnit[]>;
  /** Solid-to-world matrix, the space of generator pieces. */
  solidToWorld: THREE.Matrix4;
  /** Modifier volume. */
  volume: THREE.Object3D;
}

/**
 * Builds the CSG tree of the nodes before a volume, as the compiler would see
 * them: authored brushes, CSG groups, and generator pieces at their node's
 * place. Hidden and invalid brushes are left out like the compiler does.
 *
 * @param nodes Scene nodes in CSG order.
 * @param sources Brush lookups.
 * @returns Tree nodes.
 */
export function modifierStackBuiltTreeBuild(
  nodes: readonly THREE.Object3D[],
  sources: ModifierStackBuiltSources,
): ModifierStackBuiltNode[] {
  const tree = nodes.flatMap((node) => modifierStackBuiltNodeBuild(node, sources, null));
  modifierStackBuiltNumber(tree, [], { next: 0 });
  return tree;
}

/**
 * Numbers the leaves in CSG order and records the lists above each.
 *
 * @param list Child list being walked.
 * @param above Lists above this one.
 * @param counter Running order.
 * @param counter.next Next order number.
 */
function modifierStackBuiltNumber(
  list: ModifierStackBuiltNode[],
  above: readonly ModifierStackBuiltNode[][],
  counter: { next: number },
): void {
  const lists = [...above, list];
  for (const node of list) {
    if (node.kind === 'branch') modifierStackBuiltNumber(node.children, lists, counter);
    else Object.assign(node, { order: counter.next++, lists });
  }
}

/**
 * Builds the tree nodes of one scene node.
 *
 * @param node Scene node.
 * @param sources Brush lookups.
 * @param generator Generator node whose piece tree is walked, or null.
 * @returns Zero or more tree nodes.
 */
function modifierStackBuiltNodeBuild(
  node: THREE.Object3D,
  sources: ModifierStackBuiltSources,
  generator: THREE.Object3D | null,
): ModifierStackBuiltNode[] {
  if (!node.visible || isResultMesh(node) || isSolidModelObject(node)) return [];
  if (ModifierVolume.isGenerator(node)) return modifierStackBuiltGeneratorBuild(node, sources);
  if (ModifierVolume.isVolume(node)) return [];
  if (SolidBrushVisual.isBrushObject(node)) return modifierStackBuiltLeafBuild(node, sources, generator);
  if (!(node instanceof THREE.Group)) return [];
  const children = node.children.flatMap((child) => modifierStackBuiltNodeBuild(child, sources, generator));
  return children.length > 0 ? [{ kind: 'branch', operation: getSolidGroupOperation(node), children }] : [];
}

/**
 * Builds the pieces of a generator node at the node's place.
 *
 * @param node Generator node.
 * @param sources Brush lookups.
 * @returns Tree nodes of its pieces.
 */
function modifierStackBuiltGeneratorBuild(
  node: THREE.Object3D,
  sources: ModifierStackBuiltSources,
): ModifierStackBuiltNode[] {
  const units = sources.generators.get(node) ?? [];
  return units.flatMap((unit) => {
    const pieces = new Map(unit.brushes.map((brush) => [brush.id, brush]));
    return modifierStackBuiltNodeBuild(unit.tree, { ...sources, authored: pieces }, node);
  });
}

/**
 * Builds the leaf of one brush mesh.
 *
 * @param mesh Brush mesh.
 * @param sources Brush lookups.
 * @param generator Generator node of a piece, or null.
 * @returns The leaf, or nothing for a hidden, invalid or unknown brush.
 */
function modifierStackBuiltLeafBuild(
  mesh: THREE.Object3D,
  sources: ModifierStackBuiltSources,
  generator: THREE.Object3D | null,
): ModifierStackBuiltLeaf[] {
  const id = SolidBrushVisual.getBrushId(mesh);
  const brush = id ? sources.authored.get(id) : undefined;
  if (!brush || !brush.visible || (brush.mesh && isSolidBrushMarkedNonConvex(brush.mesh))) return [];
  const toWorld = generator ? sources.solidToWorld : (brush.mesh ?? mesh).matrixWorld;
  const planes = modifierStackPoseTouches(brush, sources.volume, toWorld)
    ? modifierStackBuiltPlanes(brush, toWorld)
    : null;
  return [{ kind: 'leaf', operation: brush.operation, brush, toWorld, planes, generator, order: 0, lists: [] }];
}

/**
 * Builds a brush's outward planes in world space.
 *
 * @param brush Brush.
 * @param toWorld Brush-to-world matrix.
 * @returns One plane per face.
 */
function modifierStackBuiltPlanes(brush: SolidBrushInstance, toWorld: THREE.Matrix4): SolidPlane[] {
  const center = new THREE.Vector3();
  for (const vertex of brush.brush.vertices) center.add(vertex);
  center.multiplyScalar(1 / Math.max(1, brush.brush.vertices.length)).applyMatrix4(toWorld);
  return modifierStackBuiltFaces(brush, toWorld).map((points) => {
    const plane = SolidPlane.fromPolygon(points);
    return plane.signedDistance(center) > 0 ? new SolidPlane(plane.normal.clone().negate(), -plane.offset) : plane;
  });
}

/**
 * Returns a brush's face polygons in world space.
 *
 * @param brush Brush.
 * @param toWorld Brush-to-world matrix.
 * @returns One polygon per face, in face order.
 */
export function modifierStackBuiltFaces(brush: SolidBrushInstance, toWorld: THREE.Matrix4): THREE.Vector3[][] {
  return brush.brush.faces.map((face) => brush.brush.getFaceVertices(face).map((point) => point.applyMatrix4(toWorld)));
}

/**
 * Evaluates whether a world point is solid after the given nodes, folding them
 * in order like the compiler.
 *
 * @param nodes Tree nodes in CSG order.
 * @param startsSolid True when the fold starts solid.
 * @param point World point.
 * @returns True when the point is inside built geometry.
 */
export function modifierStackBuiltSolidAt(
  nodes: readonly ModifierStackBuiltNode[],
  startsSolid: boolean,
  point: THREE.Vector3,
): boolean {
  let solid = startsSolid;
  for (const node of nodes)
    solid = modifierStackBuiltApply(solid, modifierStackBuiltInside(node, point), node.operation);
  return solid;
}

/**
 * Returns whether a point is inside one node's own shape.
 *
 * @param node Leaf or branch.
 * @param point World point.
 * @returns True inside the brush, or inside the group's combined children.
 */
function modifierStackBuiltInside(node: ModifierStackBuiltNode, point: THREE.Vector3): boolean {
  if (node.kind === 'branch') return modifierStackBuiltSolidAt(node.children, false, point);
  return node.planes !== null && BrushMembership.isInsidePlanes(point, node.planes);
}

/**
 * Applies one CSG operation to the running state.
 *
 * @param current State before the node.
 * @param inside Whether the point is inside the node.
 * @param operation Node operation.
 * @returns State after the node.
 */
function modifierStackBuiltApply(current: boolean, inside: boolean, operation: SolidOperation): boolean {
  if (operation === SolidOperation.Additive) return current || inside;
  if (operation === SolidOperation.Subtractive) return current && !inside;
  return current && inside;
}

/**
 * Lists the leaves whose hull meets the volume.
 *
 * @param nodes Tree nodes.
 * @returns Touching leaves in CSG order.
 */
export function modifierStackBuiltTouchingLeaves(nodes: readonly ModifierStackBuiltNode[]): ModifierStackBuiltLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === 'branch' ? modifierStackBuiltTouchingLeaves(node.children) : node.planes ? [node] : [],
  );
}

/**
 * Returns whether a later brush buries a face wherever it contains it: it comes
 * after the face's brush in the same list or a list above, and adds or
 * subtracts, so the solid is the same on both sides of the face there.
 *
 * @param face Leaf of the face.
 * @param later Other leaf.
 * @returns True when the other leaf buries the face inside itself.
 */
export function modifierStackBuiltBuries(face: ModifierStackBuiltLeaf, later: ModifierStackBuiltLeaf): boolean {
  if (later.order <= face.order || later.operation === SolidOperation.Intersecting) return false;
  const own = later.lists[later.lists.length - 1];
  return own !== undefined && face.lists.includes(own);
}
