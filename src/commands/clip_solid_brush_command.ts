import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidBrush } from '../solid/brush/solid_brush.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';
import { SolidBrushPlaneClip } from '../solid/brush/solid_brush_plane_clip.js';

/**
 * Undoable clip of one solid brush by a world-space plane.
 */
export class ClipSolidBrushCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly brushId: string;
  private readonly worldPlane: THREE.Plane;
  private readonly keepFront: boolean;
  private previousBrush: SolidBrush | null;
  private executed: boolean;

  /**
   * Creates a solid brush clip command.
   * @param model Owning solid model.
   * @param brushId Brush instance id.
   * @param worldPlane World-space clip plane.
   * @param keepFront Whether to keep the Three.js front half-space.
   */
  constructor(
    model: SolidModel,
    brushId: string,
    worldPlane: THREE.Plane,
    keepFront: boolean
  ) {
    this.model = model;
    this.brushId = brushId;
    this.worldPlane = worldPlane.clone();
    this.keepFront = keepFront;
    this.previousBrush = null;
    this.executed = false;
  }

  /**
   * Applies the clip to the brush and rebuilds the solid model.
   */
  execute(): void {
    if (this.executed) return;
    const instance = this.model.findBrush(this.brushId);
    if (!instance) return;
    const localPlane = this.worldPlaneToLocal(instance, this.worldPlane);
    const clipped = SolidBrushPlaneClip.clipKeepThreeHalfSpace(
      instance.brush,
      localPlane,
      this.keepFront
    );
    if (!clipped) return;
    this.previousBrush = instance.brush.clone();
    this.applyBrushGeometry(instance, clipped);
    this.model.markDirty();
    this.model.rebuild(true);
    this.executed = true;
  }

  /**
   * Restores the previous brush geometry.
   */
  undo(): void {
    if (!this.executed || !this.previousBrush) return;
    const instance = this.model.findBrush(this.brushId);
    if (!instance) return;
    this.applyBrushGeometry(instance, this.previousBrush);
    this.previousBrush = null;
    this.model.markDirty();
    this.model.rebuild(true);
    this.executed = false;
  }

  /**
   * Returns whether the last execute produced a clipped brush.
   * @returns True when geometry changed.
   */
  didClip(): boolean {
    return this.executed;
  }

  /**
   * Transforms a world plane into brush local space.
   * @param instance Brush instance with mesh transform.
   * @param worldPlane World plane.
   * @returns Local Three.js plane.
   */
  private worldPlaneToLocal(
    instance: SolidBrushInstance,
    worldPlane: THREE.Plane
  ): THREE.Plane {
    instance.pullTransformFromMesh();
    const matrix = instance.getLocalMatrix();
    const inverse = matrix.clone().invert();
    return worldPlane.clone().applyMatrix4(inverse);
  }

  /**
   * Replaces brush topology and rebuilds the hull preview mesh in place.
   * @param instance Brush instance.
   * @param brush New local topology.
   */
  private applyBrushGeometry(
    instance: SolidBrushInstance,
    brush: SolidBrush
  ): void {
    instance.brush = brush;
    if (!instance.mesh) return;
    const previous = instance.mesh;
    const parent = previous.parent;
    const siblingIndex = parent ? parent.children.indexOf(previous) : 0;
    const replacement = SolidBrushVisual.createHullPreview(
      instance.name,
      brush,
      instance.operation
    );
    replacement.position.copy(previous.position);
    replacement.rotation.copy(previous.rotation);
    replacement.scale.copy(previous.scale);
    instance.attachMesh(replacement);
    if (parent) {
      parent.remove(previous);
      parent.add(replacement);
      this.restoreSiblingIndex(parent, replacement, siblingIndex);
    }
    this.disposeMeshTree(previous);
  }

  /**
   * Moves a child to a specific sibling index under its parent.
   * @param parent Parent object.
   * @param child Child to reorder.
   * @param index Desired sibling index.
   */
  private restoreSiblingIndex(
    parent: THREE.Object3D,
    child: THREE.Object3D,
    index: number
  ): void {
    const current = parent.children.indexOf(child);
    if (current < 0 || current === index) return;
    parent.children.splice(current, 1);
    parent.children.splice(index, 0, child);
  }

  /**
   * Disposes geometry and materials of a mesh tree.
   * @param root Root object.
   */
  private disposeMeshTree(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.LineSegments)) {
        return;
      }
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else if (material) {
        material.dispose();
      }
    });
  }
}
