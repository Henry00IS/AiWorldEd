import { Vector3 } from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/** Undoable command that adds a convex hull brush to a solid model. */
export class CommandSolidBrushHull implements UndoCommand {
  private readonly model: SolidModel;
  private readonly brush: SolidBrush;
  private readonly surfaces: readonly FaceSurfaceDescription[];
  private created: SolidBrushInstance | null;
  private listIndex: number;
  private executed: boolean;

  /**
   * Creates a hull-brush command.
   *
   * @param model Solid model that will own the brush.
   * @param brush Convex hull in model-local space.
   * @param surfaces Texture and UV for each hull face.
   */
  constructor(model: SolidModel, brush: SolidBrush, surfaces: readonly FaceSurfaceDescription[]) {
    this.model = model;
    this.brush = brush;
    this.surfaces = surfaces;
    this.created = null;
    this.listIndex = -1;
    this.executed = false;
  }

  /** Inserts the hull brush, or re-inserts it on redo. */
  execute(): void {
    if (this.executed) return;
    if (this.created) this.reinsertCreatedBrush();
    else this.createBrush();
    this.executed = true;
  }

  /** Removes the hull brush without disposing its preview. */
  undo(): void {
    if (!this.executed || !this.created) return;
    this.model.removeBrush(this.created.id, false);
    this.executed = false;
  }

  /**
   * Returns the brush created by this command.
   *
   * @returns Created brush, or null before execute.
   */
  getCreatedBrush(): SolidBrushInstance | null {
    return this.created;
  }

  /** Builds the hull brush under the solid root. */
  private createBrush(): void {
    const instance = this.model.prepareTopologyBrush(this.brush, SolidOperation.Additive, new Vector3());
    this.nameHull(instance);
    this.copySurfaces(instance);
    this.model.insertBrushInstance(instance, this.model.getBrushes().length);
    this.created = instance;
    this.listIndex = this.model.getBrushes().findIndex((entry) => entry.id === instance.id);
  }

  /** Re-inserts a previously created hull at its recorded index. */
  private reinsertCreatedBrush(): void {
    if (!this.created || this.model.findBrush(this.created.id)) return;
    this.created.pushTransformToMesh();
    this.model.insertBrushInstance(this.created, this.listIndex);
  }

  /**
   * Names the hull and its preview mesh.
   *
   * @param instance New brush.
   */
  private nameHull(instance: SolidBrushInstance): void {
    const name = hierarchyNameAllocator.allocate('Hull');
    instance.name = name;
    if (instance.mesh) instance.mesh.name = name;
  }

  /**
   * Stores a matched surface on every hull face.
   *
   * @param instance New brush.
   */
  private copySurfaces(instance: SolidBrushInstance): void {
    for (let index = 0; index < this.surfaces.length; index += 1) {
      const surface = this.surfaces[index];
      if (surface) instance.setFaceSurface(index, surface);
    }
  }
}
