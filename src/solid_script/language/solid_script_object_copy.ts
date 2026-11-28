import type { SolidScriptBuiltFrames } from './solid_script_built_frames.js';
import type { SolidScriptElements } from './solid_script_elements.js';
import type { SolidScriptPaths } from './solid_script_paths.js';
import { solidScriptShapeClone } from './solid_script_shape_clone.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptValueCopy, type SolidScriptValueCopyHost } from './solid_script_value_copy.js';
import type { SolidScriptElement, SolidScriptPathElement, SolidScriptValue } from './solid_script_value.js';

/** What a copy of a value needs from the run that holds it. */
export interface SolidScriptCopierRun {
  readonly elements: SolidScriptElements;
  readonly paths: SolidScriptPaths;
  readonly builtFrames: SolidScriptBuiltFrames;
}

/**
 * Makes the deep copies of Copy and Set with Copy on. A copied solid or mesh is
 * a new object with its own geometry, Mode, textures, UVs and tags and its own
 * copy of every .Data value on it and on its faces, edges, corners and face
 * corners; it is kept only by the name it is written to, until Output.
 */
export class SolidScriptCopier implements SolidScriptValueCopyHost {
  /** @param run The run whose values are copied. */
  constructor(private readonly run: SolidScriptCopierRun) {}

  /**
   * Makes a deep copy of a value.
   *
   * @param value Value to copy.
   * @param shown Name it was read from, for messages.
   * @returns The copy.
   */
  value(value: SolidScriptValue, shown: string): SolidScriptValue {
    return solidScriptValueCopy(value, shown, this);
  }

  /**
   * Makes a second solid or mesh with the geometry and Mode of the first and
   * the same place among the blocks it was built in.
   *
   * @param element Solid or mesh.
   * @returns The new object, still without Data.
   */
  objectCopy(element: SolidScriptElement): SolidScriptElement {
    const { elements, builtFrames } = this.run;
    const leaf = elements.leaf(element);
    const clone = solidScriptShapeClone(leaf) as SolidScriptGeometryLeaf;
    elements.modeRoleCopy(leaf, clone);
    builtFrames.copy(leaf, clone);
    return elements.brush(clone);
  }

  /**
   * Gives a copied object its own copy of every .Data value of the original, on
   * the object and on each held face, edge, corner and face corner.
   *
   * @param from Original.
   * @param to Copy.
   * @param copy Copies one value.
   */
  objectDataCopy(
    from: SolidScriptElement,
    to: SolidScriptElement,
    copy: (value: SolidScriptValue) => SolidScriptValue,
  ): void {
    const { elements } = this.run;
    const data = elements.data(to);
    for (const entry of elements.dataEntries(from))
      elements.dataWrite(data, solidScriptNameKey(entry.name), entry.name, copy(entry.value));
    elements.partsCopy(elements.leaf(from), elements.leaf(to), copy);
  }

  /**
   * Makes a second Path.
   *
   * @param element Path to copy.
   * @returns The new Path.
   */
  pathCopy(element: SolidScriptPathElement): SolidScriptPathElement {
    return this.run.paths.created(element.path, element.name);
  }

  /**
   * Lists every .Data value of a solid or mesh and its parts.
   *
   * @param element Solid or mesh.
   * @returns Values.
   */
  objectDataValues(element: SolidScriptElement): SolidScriptValue[] {
    return this.run.elements.dataValuesAll(element);
  }
}
