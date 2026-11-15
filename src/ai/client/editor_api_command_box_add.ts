import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidBrushShapeCreate, type SolidBrushShape } from '@/solid/brush/solid_brush_shape.js';

/**
 * Undoable command that adds a sized box or wedge brush under a solid model for
 * the AI EditorApi path (supports non-uniform size).
 */
export class EditorApiCommandAddBox implements UndoCommand {
  private readonly model: SolidModel;
  private readonly width: number;
  private readonly height: number;
  private readonly depth: number;
  private readonly operation: SolidOperation;
  private readonly position: THREE.Vector3;
  private readonly rotation: THREE.Euler;
  private readonly scale: THREE.Vector3;
  private readonly parent: THREE.Object3D | null;
  private readonly shape: SolidBrushShape;
  private created: SolidBrushInstance | null;
  private listIndex: number;
  private hierarchySiblingIndex: number;
  private executed: boolean;

  /**
   * Creates an add-box command with full TRS.
   *
   * @param model Target solid model.
   * @param size Box dimensions.
   * @param operation CSG operation.
   * @param position Local position.
   * @param rotation Local rotation.
   * @param scale Local scale.
   * @param parent Optional solid CSG group (or solid root) to parent under.
   * @param shape Brush shape filling the size.
   */
  constructor(
    model: SolidModel,
    size: THREE.Vector3,
    operation: SolidOperation,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
    parent: THREE.Object3D | null = null,
    shape: SolidBrushShape = 'box',
  ) {
    this.model = model;
    this.width = size.x;
    this.height = size.y;
    this.depth = size.z;
    this.operation = operation;
    this.position = position.clone();
    this.rotation = rotation.clone();
    this.scale = scale.clone();
    this.parent = parent;
    this.shape = shape;
    this.created = null;
    this.listIndex = -1;
    this.hierarchySiblingIndex = -1;
    this.executed = false;
  }

  /** Creates the brush on first run, or re-inserts it on redo. */
  execute(): void {
    if (this.executed) return;
    if (this.created) this.reinsertCreatedBrush();
    else this.createBrush();
    this.executed = true;
  }

  /** Removes the created brush without disposing preview resources. */
  undo(): void {
    if (!this.executed || !this.created) return;
    this.model.removeBrush(this.created.id, false);
    this.executed = false;
  }

  /**
   * Returns the brush created by this command when available.
   *
   * @returns Created brush instance or null.
   */
  getCreatedBrush(): SolidBrushInstance | null {
    return this.created;
  }

  /** Builds a new brush of the shape, applies TRS, and records its list index. */
  private createBrush(): void {
    const size = new THREE.Vector3(this.width, this.height, this.depth);
    const topology = solidBrushShapeCreate(this.shape, size);
    const instance = this.model.prepareTopologyBrush(topology, this.operation, this.position);
    instance.rotation.copy(this.rotation);
    instance.scale.copy(this.scale);
    instance.pushTransformToMesh();
    const previewSize = Math.max(this.width, this.height, this.depth);
    const hierarchy = this.buildHierarchyPlacement();
    const listIndex = this.model.getBrushCount();
    this.model.insertBrushInstance(instance, listIndex, previewSize, hierarchy);
    this.created = instance;
    this.listIndex = this.model.getBrushes().findIndex((entry) => entry.id === instance.id);
    if (hierarchy) this.hierarchySiblingIndex = hierarchy.siblingIndex;
  }

  /** Re-inserts a previously created brush at its recorded index. */
  private reinsertCreatedBrush(): void {
    if (!this.created) return;
    if (this.model.findBrush(this.created.id)) return;
    this.created.pushTransformToMesh();
    const hierarchy = this.buildHierarchyPlacement(this.hierarchySiblingIndex);
    this.model.insertBrushInstance(
      this.created,
      this.listIndex,
      Math.max(this.width, this.height, this.depth),
      hierarchy,
    );
  }

  /**
   * Builds optional nested parent placement under a solid CSG group.
   *
   * @param siblingIndex Explicit sibling index, or append when omitted.
   * @returns Hierarchy placement or undefined for solid root.
   */
  private buildHierarchyPlacement(siblingIndex?: number): { parent: THREE.Object3D; siblingIndex: number } | undefined {
    const parent = this.model.resolveBrushInsertParent(this.parent);
    if (parent === this.model.root) return undefined;
    const index = siblingIndex ?? parent.children.length;
    return { parent, siblingIndex: index };
  }
}
