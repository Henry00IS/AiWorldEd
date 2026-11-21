import { solidScriptShapeNested, type SolidScriptShape, type SolidScriptShapePolygon } from './solid_script_shape.js';
import { SolidScriptElement } from './solid_script_value.js';

/**
 * Keeps the flat outlines of one run that lines have read by Name, so a tool
 * such as Move By can change an outline before the block around it extrudes or
 * spins it.
 */
export class SolidScriptOutlines {
  private readonly elements = new Map<SolidScriptShapePolygon, SolidScriptElement>();
  private readonly latest = new Map<SolidScriptElement, SolidScriptShapePolygon>();

  /**
   * Returns the element of an outline; a later version of the same outline is
   * the same element.
   *
   * @param outline Outline.
   * @returns Outline element.
   */
  element(outline: SolidScriptShapePolygon): SolidScriptElement {
    const known = this.elements.get(outline);
    if (known) return known;
    const element = new SolidScriptElement('outline', this.latest.size + 1, outline.label);
    this.elements.set(outline, element);
    this.latest.set(element, outline);
    return element;
  }

  /**
   * Reads an outline element as the outline is now.
   *
   * @param element Outline element.
   * @returns Outline.
   */
  outline(element: SolidScriptElement): SolidScriptShapePolygon {
    const outline = this.latest.get(element);
    if (!outline) throw new Error(`${String(element)} belongs to another run`);
    return outline;
  }

  /**
   * Swaps an outline for its changed version in every list of built shapes.
   *
   * @param element Outline element.
   * @param by Changed outline.
   * @param lists Lists of built shapes, changed in place.
   */
  replace(element: SolidScriptElement, by: SolidScriptShapePolygon, lists: readonly SolidScriptShape[][]): void {
    const from = this.outline(element);
    for (const list of lists)
      for (let index = 0; index < list.length; index++) list[index] = solidScriptShapeSwap(list[index]!, from, by);
    this.latest.set(element, by);
    this.elements.set(by, element);
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
