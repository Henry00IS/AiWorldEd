import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview_keys.js';
import { nodeBrushWireId, nodeIdValid } from '@/collaboration/scene/node_collaboration_identity.js';
import { NODE_PARENT_WORLD, type NodeCollaborationRef } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Snapshot of every synchronized node of the scene in depth-first order with
 * lookups by wire id and by scene object.
 */
export class IndexCollaborationNodes {
  readonly refs: NodeCollaborationRef[];
  readonly parents: Map<string, string>;
  private readonly byId: Map<string, NodeCollaborationRef>;
  private readonly byObject: Map<THREE.Object3D, NodeCollaborationRef>;

  /**
   * Builds the index for a world root.
   *
   * @param world World group holding the editable scene.
   */
  constructor(world: THREE.Object3D) {
    this.refs = [];
    this.parents = new Map();
    this.byId = new Map();
    this.byObject = new Map();
    this.collect(world, NODE_PARENT_WORLD, null);
  }

  /**
   * Returns the node with a wire id.
   *
   * @param id Wire id.
   * @returns Node reference or undefined.
   */
  get(id: string): NodeCollaborationRef | undefined {
    return this.byId.get(id);
  }

  /**
   * Returns the node bound to a scene object.
   *
   * @param object Scene object.
   * @returns Node reference or undefined.
   */
  forObject(object: THREE.Object3D): NodeCollaborationRef | undefined {
    return this.byObject.get(object);
  }

  /**
   * Returns the nearest synchronized node at or above a scene object. Result
   * meshes resolve to their solid model root.
   *
   * @param object Scene object.
   * @returns Node reference or undefined.
   */
  forObjectOrAncestor(object: THREE.Object3D): NodeCollaborationRef | undefined {
    let current: THREE.Object3D | null = object;
    while (current !== null) {
      const ref = this.byObject.get(current);
      if (ref !== undefined) return ref;
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Returns the wire ids of a node and every synchronized descendant.
   *
   * @param id Wire id of the subtree root.
   * @param into Set receiving the ids.
   */
  subtreeCollect(id: string, into: Set<string>): void {
    const ref = this.byId.get(id);
    if (ref === undefined) return;
    into.add(id);
    ref.object.traverse((object) => {
      const child = this.byObject.get(object);
      if (child !== undefined) into.add(child.id);
    });
  }

  /**
   * Adds a node created after the index was built.
   *
   * @param ref Node reference.
   * @param parentId Wire id of its parent.
   */
  register(ref: NodeCollaborationRef, parentId: string): void {
    this.parents.set(ref.id, parentId);
    this.byId.set(ref.id, ref);
    this.byObject.set(ref.object, ref);
  }

  /**
   * Forgets a removed node. The depth-first list is not updated; callers
   * rebuild the index before iterating it again.
   *
   * @param ref Node reference.
   */
  unregister(ref: NodeCollaborationRef): void {
    this.parents.delete(ref.id);
    this.byId.delete(ref.id);
    this.byObject.delete(ref.object);
  }

  /**
   * Visits the children of a container and records synchronized nodes.
   *
   * @param container Parent scene object.
   * @param parentId Wire id of the container node.
   * @param model Solid model owning the container, or null in world space.
   */
  private collect(container: THREE.Object3D, parentId: string, model: SolidModel | null): void {
    for (const child of container.children) {
      if (child.userData[CLIP_PREVIEW_USERDATA_KEY] === true) continue;
      const ref = model === null ? this.refWorld(child) : this.refSolid(child, model);
      if (ref === null || !nodeIdValid(ref.id) || this.byId.has(ref.id)) continue;
      this.refs.push(ref);
      this.parents.set(ref.id, parentId);
      this.byId.set(ref.id, ref);
      this.byObject.set(child, ref);
      if (ref.kind !== 'brush' && child instanceof THREE.Group) this.collect(child, ref.id, ref.model);
    }
  }

  /**
   * Classifies an object outside any solid model.
   *
   * @param object Candidate object.
   * @returns Node reference, or null when the object is not synchronized.
   */
  private refWorld(object: THREE.Object3D): NodeCollaborationRef | null {
    if (object instanceof THREE.Group && SolidModel.isSolidModelObject(object)) {
      const model = SolidModel.fromObject(object);
      return model === null ? null : { id: object.uuid, kind: 'entry', object, model, localId: object.uuid };
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.Group) {
      return { id: object.uuid, kind: 'entry', object, model: null, localId: object.uuid };
    }
    return null;
  }

  /**
   * Classifies an object inside a solid model.
   *
   * @param object Candidate object.
   * @param model Owning solid model.
   * @returns Node reference, or null for result meshes and helpers.
   */
  private refSolid(object: THREE.Object3D, model: SolidModel): NodeCollaborationRef | null {
    if (SolidModel.isResultMesh(object)) return null;
    if (object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object)) {
      const brushId = SolidBrushVisual.getBrushId(object);
      if (brushId === null) return null;
      return { id: nodeBrushWireId(model.root.uuid, brushId), kind: 'brush', object, model, localId: brushId };
    }
    if (object instanceof THREE.Group && isSolidCsgGroup(object)) {
      return { id: object.uuid, kind: 'solidGroup', object, model, localId: object.uuid };
    }
    return null;
  }
}
