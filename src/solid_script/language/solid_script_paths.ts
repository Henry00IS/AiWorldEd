import { solidScriptShapeNested } from './solid_script_shape.js';
import type { SolidScriptShape, SolidScriptShapePolygon } from './solid_script_shape.js';
import { solidScriptPathMap, type SolidScriptPath } from './solid_script_path_model.js';
import { SolidScriptPathElement } from './solid_script_value.js';

/**
 * Turns a point of the drawing plane of Linear Extrude into script space: X
 * stays, the drawing's Y runs to the back, on the ground.
 *
 * @param point Point of the drawing plane.
 * @returns X, Y and Z.
 */
export function solidScriptPathFromFlat([x, y]: readonly [number, number]): number[] {
  return [x, 0, y === 0 ? 0 : -y];
}

/**
 * Keeps the Paths of one run: those Path lines write and the closed ones
 * Square, Circle, Polygon or a closed Path line drew for Linear Extrude, Rotate
 * Extrude or Offset to fill. A tool such as Move By can change a drawn path
 * before the block around it fills it.
 */
export class SolidScriptPaths {
  private count = 0;
  private readonly elements = new Map<SolidScriptShapePolygon, SolidScriptPathElement>();
  private readonly latest = new Map<SolidScriptPathElement, SolidScriptShapePolygon>();

  /**
   * Returns a new Path element for points in script space.
   *
   * @param path Path.
   * @param name Name it shows.
   * @returns Path element.
   */
  created(path: SolidScriptPath<number[]>, name: string): SolidScriptPathElement {
    this.count += 1;
    return new SolidScriptPathElement(this.count, name, path);
  }

  /**
   * Returns the element of a drawn path; a later version of the same path is
   * the same element.
   *
   * @param drawn Closed flat path.
   * @returns Path element.
   */
  element(drawn: SolidScriptShapePolygon): SolidScriptPathElement {
    const known = this.elements.get(drawn);
    if (known) return known;
    const element = this.created(solidScriptPathMap(drawn.path, solidScriptPathFromFlat), drawn.label);
    this.elements.set(drawn, element);
    this.latest.set(element, drawn);
    return element;
  }

  /**
   * Reads a drawn path as it is now.
   *
   * @param element Path element.
   * @returns The closed flat path, or undefined for a path no block fills.
   */
  drawn(element: SolidScriptPathElement): SolidScriptShapePolygon | undefined {
    return this.latest.get(element);
  }

  /**
   * Swaps a drawn path for its changed version in every list of built shapes.
   *
   * @param element Path element.
   * @param by Changed path.
   * @param lists Lists of built shapes, changed in place.
   */
  replace(element: SolidScriptPathElement, by: SolidScriptShapePolygon, lists: readonly SolidScriptShape[][]): void {
    const from = this.latest.get(element);
    if (!from) throw new Error(`${String(element)} belongs to another run`);
    for (const list of lists)
      for (let index = 0; index < list.length; index++) list[index] = solidScriptShapeSwap(list[index]!, from, by);
    this.latest.set(element, by);
    this.elements.set(by, element);
    element.path = solidScriptPathMap(by.path, solidScriptPathFromFlat);
  }
}

/**
 * Returns a shape tree with one leaf swapped for another; parts without that
 * leaf stay the same objects.
 *
 * @param shape Shape tree.
 * @param from Leaf to swap.
 * @param to Replacement.
 * @returns Shape tree.
 */
export function solidScriptShapeSwap(
  shape: SolidScriptShape,
  from: SolidScriptShape,
  to: SolidScriptShape,
): SolidScriptShape {
  if (shape === from) return to;
  const nested = solidScriptShapeNested(shape);
  if (!nested) return shape;
  const children = nested.map((child) => solidScriptShapeSwap(child, from, to));
  if (children.every((child, index) => child === nested[index])) return shape;
  return { ...shape, children } as SolidScriptShape;
}
