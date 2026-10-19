import type { Object3D } from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { CommandSolidBrushHull } from '@/tools/hull/command_solid_brush_hull.js';
import { solidBrushHullBuild } from '@/tools/hull/solid_brush_hull_build.js';

/** Services the object-mode convex hull action needs. */
export interface HandlerSolidBrushHullDeps {
  /** Undo stack. */
  commandStack: CommandStack;
  /** Current object selection. */
  getSelectedObjects: () => readonly Object3D[];
  /** Status line. */
  showStatusMessage: (message: string) => void;
}

/** Builds a convex brush around the selected solid brushes. */
export class HandlerSolidBrushHull {
  private readonly deps: HandlerSolidBrushHullDeps;

  /**
   * Creates a hull action.
   *
   * @param deps Selection, undo, and status.
   */
  constructor(deps: HandlerSolidBrushHullDeps) {
    this.deps = deps;
  }

  /**
   * Runs the hull when at least two brushes are selected.
   *
   * @returns Created brush, or null when the selection cannot form a hull.
   */
  run(): SolidBrushInstance | null {
    const brushes = solidBrushHullSelection(this.deps.getSelectedObjects());
    if (brushes.length < 2) {
      this.deps.showStatusMessage('Convex hull needs two or more brushes');
      return null;
    }
    return this.commitHull(brushes);
  }

  /**
   * Builds the hull and pushes the undo command.
   *
   * @param brushes Selected brushes.
   * @returns Created brush, or null when the points are flat.
   */
  private commitHull(brushes: readonly SolidBrushInstance[]): SolidBrushInstance | null {
    const mesh = brushes[0]?.mesh;
    const model = mesh ? SolidModel.fromObject(mesh) : null;
    if (!model) {
      this.deps.showStatusMessage('Convex hull needs brushes in a solid model');
      return null;
    }
    const built = solidBrushHullBuild(brushes, model.root);
    if (!built) {
      this.deps.showStatusMessage('Convex hull needs a 3D set of brushes');
      return null;
    }
    const command = new CommandSolidBrushHull(model, built.brush, built.surfaces);
    this.deps.commandStack.push(command);
    return command.getCreatedBrush();
  }
}

/**
 * Lists selected solid brushes, skipping bevel volumes and other objects.
 *
 * @param selected Current selection.
 * @returns Brush instances.
 */
export function solidBrushHullSelection(selected: readonly Object3D[]): SolidBrushInstance[] {
  const brushes: SolidBrushInstance[] = [];
  for (const object of selected) solidBrushHullPushSelection(brushes, object);
  return brushes;
}

/**
 * Appends a selected object when it is an authored brush.
 *
 * @param brushes Brush accumulator.
 * @param object Selected object.
 */
function solidBrushHullPushSelection(brushes: SolidBrushInstance[], object: Object3D): void {
  if (ModifierVolumeBevel.isVolume(object) || !SolidBrushVisual.isBrushObject(object)) return;
  const model = SolidModel.fromObject(object);
  const brush = model?.findBrushByMesh(object);
  if (brush) brushes.push(brush);
}
