/**
 * Inline SVG icons for solid CSG operation buttons in the inspector. Top-down
 * two-square layout: back square (X) upper-left, front square (Y) offset
 * down-right. Additive lights both; subtractive darkens Y; intersecting lights
 * only the overlap (I) and darkens the exclusive regions.
 */
export class SolidCsgOperationIcons {
  private static readonly viewSize = 18;
  private static readonly backX = 1.5;
  private static readonly backY = 1.5;
  private static readonly squareSize = 10;
  private static readonly frontOffset = 5;
  private static readonly lightFill = 'currentColor';
  private static readonly darkFill = '#1a1a1a';
  private static readonly outlineStroke = 'currentColor';
  private static readonly outlineOpacity = 0.35;
  private static readonly cornerRadius = 1.2;

  /**
   * Two overlapping squares, both light (union).
   *
   * @returns SVG markup string.
   */
  static additive(): string {
    return this.wrapSvg(this.backSquareLight() + this.frontSquareLight() + this.bothSquareOutlines());
  }

  /**
   * Same two-square layout; back square light, front square dark (difference).
   *
   * @returns SVG markup string.
   */
  static subtractive(): string {
    return this.wrapSvg(this.backSquareLight() + this.frontSquareDark() + this.bothSquareOutlines());
  }

  /**
   * Overlap region light; exclusive parts of both squares dark (intersection).
   *
   * @returns SVG markup string.
   */
  static intersecting(): string {
    return this.wrapSvg(
      this.backExclusiveDark() + this.frontExclusiveDark() + this.overlapLight() + this.bothSquareOutlines(),
    );
  }

  /**
   * Light filled back square (X region upper-left).
   *
   * @returns SVG rect element markup.
   */
  private static backSquareLight(): string {
    return this.roundedRect(this.backX, this.backY, this.squareSize, this.squareSize, this.lightFill, 0.95);
  }

  /**
   * Light filled front square (Y region offset down-right).
   *
   * @returns SVG rect element markup.
   */
  private static frontSquareLight(): string {
    return this.roundedRect(
      this.backX + this.frontOffset,
      this.backY + this.frontOffset,
      this.squareSize,
      this.squareSize,
      this.lightFill,
      0.95,
    );
  }

  /**
   * Dark filled front square (Y region).
   *
   * @returns SVG rect element markup.
   */
  private static frontSquareDark(): string {
    return this.roundedRect(
      this.backX + this.frontOffset,
      this.backY + this.frontOffset,
      this.squareSize,
      this.squareSize,
      this.darkFill,
      1,
    );
  }

  /**
   * Dark L-shaped exclusive region of the back square (X minus overlap).
   *
   * @returns SVG path element markup.
   */
  private static backExclusiveDark(): string {
    const x0 = this.backX;
    const y0 = this.backY;
    const s = this.squareSize;
    const o = this.frontOffset;
    const d = [
      `M${this.fmt(x0)} ${this.fmt(y0)}`,
      `H${this.fmt(x0 + s)}`,
      `V${this.fmt(y0 + o)}`,
      `H${this.fmt(x0 + o)}`,
      `V${this.fmt(y0 + s)}`,
      `H${this.fmt(x0)}`,
      'Z',
    ].join('');
    return `<path fill="${this.darkFill}" d="${d}"/>`;
  }

  /**
   * Dark L-shaped exclusive region of the front square (Y minus overlap).
   *
   * @returns SVG path element markup.
   */
  private static frontExclusiveDark(): string {
    const x0 = this.backX + this.frontOffset;
    const y0 = this.backY + this.frontOffset;
    const s = this.squareSize;
    const o = this.frontOffset;
    const d = [
      `M${this.fmt(x0)} ${this.fmt(y0)}`,
      `H${this.fmt(x0 + s)}`,
      `V${this.fmt(y0 + s)}`,
      `H${this.fmt(x0)}`,
      `V${this.fmt(y0 + (s - o))}`,
      `H${this.fmt(x0 + (s - o))}`,
      `V${this.fmt(y0)}`,
      'Z',
    ].join('');
    return `<path fill="${this.darkFill}" d="${d}"/>`;
  }

  /**
   * Light filled overlap rectangle (I region).
   *
   * @returns SVG rect element markup.
   */
  private static overlapLight(): string {
    const overlapSize = this.squareSize - this.frontOffset;
    return this.roundedRect(
      this.backX + this.frontOffset,
      this.backY + this.frontOffset,
      overlapSize,
      overlapSize,
      this.lightFill,
      1,
    );
  }

  /**
   * Thin stroke outlines for the back and front squares.
   *
   * @returns Concatenated SVG rect outline markup.
   */
  private static bothSquareOutlines(): string {
    return (
      this.squareOutline(this.backX, this.backY) +
      this.squareOutline(this.backX + this.frontOffset, this.backY + this.frontOffset)
    );
  }

  /**
   * Thin stroke outline for one square at the given top-left corner.
   *
   * @param x Left edge.
   * @param y Top edge.
   * @returns SVG rect outline markup.
   */
  private static squareOutline(x: number, y: number): string {
    const s = this.squareSize;
    const r = this.cornerRadius;
    return `<rect x="${this.fmt(x)}" y="${this.fmt(y)}" width="${this.fmt(s)}" height="${this.fmt(s)}" rx="${this.fmt(r)}" fill="none" stroke="${this.outlineStroke}" stroke-opacity="${this.outlineOpacity}" stroke-width="0.75"/>`;
  }

  /**
   * Builds a filled rounded rectangle element.
   *
   * @param x Left edge.
   * @param y Top edge.
   * @param width Rectangle width.
   * @param height Rectangle height.
   * @param fill Fill color.
   * @param opacity Fill opacity.
   * @returns SVG rect element markup.
   */
  private static roundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    opacity: number,
  ): string {
    const r = this.cornerRadius;
    return `<rect x="${this.fmt(x)}" y="${this.fmt(y)}" width="${this.fmt(width)}" height="${this.fmt(height)}" rx="${this.fmt(r)}" fill="${fill}" opacity="${opacity}"/>`;
  }

  /**
   * Formats a coordinate with one decimal place for compact SVG markup.
   *
   * @param value Numeric coordinate.
   * @returns Formatted string.
   */
  private static fmt(value: number): string {
    return value.toFixed(1);
  }

  /**
   * Wraps inner markup in a fixed-size SVG root element.
   *
   * @param content Inner SVG element markup.
   * @returns Complete SVG element markup.
   */
  private static wrapSvg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.viewSize}" height="${this.viewSize}" viewBox="0 0 ${this.viewSize} ${this.viewSize}" aria-hidden="true">${content}</svg>`;
  }
}
