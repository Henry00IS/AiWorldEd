import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** One box brush of a test layout: centre, size and CSG operation. */
export interface PassThroughLayoutBox {
  kind: 'box';
  center: [number, number, number];
  size: [number, number, number];
  operation: SolidOperation;
}

/** One CSG group of a test layout with its operation and children. */
export interface PassThroughLayoutGroup {
  kind: 'group';
  operation: SolidOperation;
  children: PassThroughLayoutNode[];
}

/** Node of a declarative solid test layout. */
export type PassThroughLayoutNode = PassThroughLayoutBox | PassThroughLayoutGroup;

/** Comparable summary of a compiled solid result mesh. */
export interface PassThroughMeshSignature {
  triangles: string[];
  volume: number;
  area: number;
}

/**
 * Builds a box layout node.
 *
 * @param center Box centre in solid space.
 * @param size Box edge lengths.
 * @param operation CSG operation of the brush.
 * @returns Layout box node.
 */
export function layoutBox(
  center: [number, number, number],
  size: [number, number, number],
  operation: SolidOperation = SolidOperation.Additive,
): PassThroughLayoutBox {
  return { kind: 'box', center, size, operation };
}

/**
 * Builds a group layout node.
 *
 * @param operation Group CSG operation.
 * @param children Child layout nodes in CSG order.
 * @returns Layout group node.
 */
export function layoutGroup(operation: SolidOperation, children: PassThroughLayoutNode[]): PassThroughLayoutGroup {
  return { kind: 'group', operation, children };
}

/**
 * Returns the layout with every pass-through group replaced by its children,
 * the shape the solid would have if those brushes were never grouped.
 *
 * @param nodes Layout nodes.
 * @returns Layout without pass-through groups.
 */
export function layoutWithoutPassThrough(nodes: readonly PassThroughLayoutNode[]): PassThroughLayoutNode[] {
  return nodes.flatMap((node): PassThroughLayoutNode[] => {
    if (node.kind === 'box') return [node];
    const children = layoutWithoutPassThrough(node.children);
    if (node.operation === SolidOperation.PassThrough) return children;
    return [layoutGroup(node.operation, children)];
  });
}

/**
 * Builds a solid model from a layout and compiles it fully.
 *
 * @param name Model name.
 * @param nodes Layout nodes under the solid root.
 * @returns Model and the scene groups created in layout order.
 */
export function layoutModelBuild(
  name: string,
  nodes: readonly PassThroughLayoutNode[],
): { model: SolidModel; groups: THREE.Group[] } {
  const model = new SolidModel(name);
  const groups: THREE.Group[] = [];
  layoutNodesAttach(model, model.root, nodes, groups);
  model.syncBrushOrderFromScene();
  model.markDirty();
  model.rebuild(true);
  return { model, groups };
}

/**
 * Attaches layout nodes under a scene parent.
 *
 * @param model Owning model.
 * @param parent Solid root or group.
 * @param nodes Layout nodes.
 * @param groups List receiving created groups.
 */
function layoutNodesAttach(
  model: SolidModel,
  parent: THREE.Object3D,
  nodes: readonly PassThroughLayoutNode[],
  groups: THREE.Group[],
): void {
  for (const node of nodes) {
    if (node.kind === 'box') {
      layoutBoxAttach(model, parent, node);
      continue;
    }
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, node.operation);
    parent.add(group);
    groups.push(group);
    layoutNodesAttach(model, group, node.children, groups);
  }
}

/**
 * Adds one box brush under a parent and poses it.
 *
 * @param model Owning model.
 * @param parent Solid root or group.
 * @param box Layout box.
 */
function layoutBoxAttach(model: SolidModel, parent: THREE.Object3D, box: PassThroughLayoutBox): void {
  const brush = model.addBoxBrush(1, box.operation, parent, false);
  brush.position.set(...box.center);
  brush.scale.set(...box.size);
  brush.pushTransformToMesh();
}

/**
 * Reads the result mesh of a model as a sorted triangle set plus its volume and
 * surface area. Degenerate triangles are skipped.
 *
 * @param model Compiled solid model.
 * @returns Mesh signature.
 */
export function meshSignature(model: SolidModel): PassThroughMeshSignature {
  const signature: PassThroughMeshSignature = { triangles: [], volume: 0, area: 0 };
  const geometry = model.getResultMesh().geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
  for (let start = 0; start + 2 < count; start += 3) {
    corners.forEach((corner, offset) =>
      corner.fromBufferAttribute(position, index ? index.getX(start + offset) : start + offset),
    );
    meshSignatureTriangleAdd(signature, corners);
  }
  signature.triangles.sort();
  return signature;
}

/**
 * Adds one triangle to a mesh signature.
 *
 * @param signature Signature being built.
 * @param corners Triangle corners in winding order.
 */
function meshSignatureTriangleAdd(
  signature: PassThroughMeshSignature,
  corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
): void {
  const [a, b, c] = corners;
  const doubleArea = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length();
  if (doubleArea < 1e-9) return;
  signature.volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  signature.area += doubleArea / 2;
  signature.triangles.push(
    corners
      .map((corner) =>
        corner
          .toArray()
          .map((value) => value.toFixed(4))
          .join(','),
      )
      .join('|'),
  );
}
