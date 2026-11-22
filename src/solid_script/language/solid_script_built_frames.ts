import * as THREE from 'three';
import { solidScriptShapeIsLeaf, type SolidScriptShape, type SolidScriptShapeLeaf } from './solid_script_shape.js';

/**
 * The blocks each object was built inside, so Output moves a held object only
 * by the blocks around the Output line that it was not already built inside.
 * Each block is known by the space its lines run in.
 */
export class SolidScriptBuiltFrames {
  private readonly spaces: THREE.Matrix4[] = [];
  private readonly built = new WeakMap<SolidScriptShapeLeaf, readonly THREE.Matrix4[]>();

  /**
   * Notes that lines start running in a space.
   *
   * @param matrix Space of the lines.
   */
  enter(matrix: THREE.Matrix4): void {
    this.spaces.push(matrix);
  }

  /** Notes that the lines of the innermost space are done. */
  leave(): void {
    this.spaces.pop();
  }

  /**
   * Remembers the blocks new shapes were placed inside. Objects a line inside
   * built keep the blocks of that line, so a Group around them does not change
   * them.
   *
   * @param shapes Shapes, already placed.
   */
  record(shapes: readonly SolidScriptShape[]): void {
    for (const shape of shapes)
      if (solidScriptShapeIsLeaf(shape)) {
        if (this.built.has(shape)) continue;
        this.built.set(shape, [...this.spaces]);
      } else this.record(shape.children);
  }

  /**
   * Gives an object a tool remade the blocks of the one it replaces.
   *
   * @param from Object before the tool.
   * @param to Object after it.
   */
  copy(from: SolidScriptShapeLeaf, to: SolidScriptShapeLeaf): void {
    const spaces = this.built.get(from);
    if (spaces) this.built.set(to, spaces);
  }

  /**
   * The move that takes an object from the innermost block it shares with an
   * Output line to the space of that line; the whole space for objects not
   * built by the script.
   *
   * @param leaf Object as it was built.
   * @param matrix Space of the Output line.
   * @returns Move to apply.
   */
  relative(leaf: SolidScriptShapeLeaf, matrix: THREE.Matrix4): THREE.Matrix4 {
    const spaces = this.built.get(leaf) ?? [];
    let shared = 0;
    while (shared < spaces.length && spaces[shared] === this.spaces[shared]) shared++;
    const base = shared > 0 ? spaces[shared - 1] : undefined;
    return base ? matrix.clone().multiply(base.clone().invert()) : matrix.clone();
  }
}
