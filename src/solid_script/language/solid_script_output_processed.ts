import { solidScriptOutputLeaves } from './solid_script_output_solids.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import type { SolidScriptShape } from './solid_script_shape.js';

/**
 * Counts every solid and mesh a run creates or handles, including values kept
 * only in memory, so the result line can show what was processed.
 */
export class SolidScriptOutputProcessed {
  /** Solids created or handled, including those never placed in the result. */
  solids = 0;
  /** Meshes created or handled, including those never placed in the result. */
  meshes = 0;

  /**
   * Counts one solid or mesh the first time it is created or handled.
   *
   * @param leaf Solid or mesh.
   */
  note(leaf: SolidScriptGeometryLeaf): void {
    if (leaf.kind === 'solid') this.solids += 1;
    else this.meshes += 1;
  }

  /**
   * Counts the solids and meshes in a shape tree, ignoring flat outlines.
   *
   * @param shapes Shapes.
   */
  notes(shapes: readonly SolidScriptShape[]): void {
    for (const leaf of solidScriptOutputLeaves(shapes)) {
      if (leaf.kind === 'solid' || leaf.kind === 'mesh') this.note(leaf);
    }
  }

  /**
   * Counts the solids and meshes in a shape tree and returns the same list.
   *
   * @param shapes Shapes.
   * @returns The same shapes.
   */
  taken<T extends SolidScriptShape>(shapes: T[]): T[] {
    this.notes(shapes);
    return shapes;
  }
}
