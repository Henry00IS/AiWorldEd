import { Vector3, type Object3D } from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';

/** Undoable command that adds a convex hull brush to a solid model. */
export class CommandSolidBrushHull implements UndoCommand {
  private readonly model: SolidModel;
  private readonly brush: SolidBrush;
  private readonly surfaces: readonly FaceSurfaceDescription[];
  private created: SolidBrushInstance | null;
  private readonly parent: Object3D;
  private readonly after: Object3D | null;
  private executed: boolean;

  /**
   * Creates a hull-brush command.
   *
   * @param model Solid model that will own the brush.
   * @param brush Convex hull in destination-parent local space.
   * @param surfaces Texture and UV for each hull face.
   * @param parent Destination parent, defaulting to the model root.
   * @param after Selected sibling to follow.
   */
  constructor(
    model: SolidModel,
    brush: SolidBrush,
    surfaces: readonly FaceSurfaceDescription[],
    parent: Object3D = model.root,
    after: Object3D | null = null,
  ) {
    this.model = model;
    this.brush = brush;
    this.surfaces = surfaces;
    this.created = null;
    this.parent = parent;
    this.after = after;
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

  /** Builds the hull brush after the selected sibling. */
  private createBrush(): void {
    const instance = this.model.prepareTopologyBrush(
      this.brush,
      SolidOperation.Additive,
      new Vector3(),
      undefined,
      'Hull',
    );
    this.copySurfaces(instance);
    this.model.addBrushInstanceAfter(instance, this.parent, this.after);
    this.created = instance;
  }

  /** Re-inserts a previously created hull after its recorded sibling. */
  private reinsertCreatedBrush(): void {
    if (!this.created || this.model.findBrush(this.created.id)) return;
    this.created.pushTransformToMesh();
    this.model.addBrushInstanceAfter(this.created, this.parent, this.after);
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
