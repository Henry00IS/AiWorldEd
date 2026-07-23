/**
 * Inline SVG icon markup for editor toolbars.
 * Icons use currentColor so button text color styles them.
 */
export class ToolbarIcons {
  /**
   * Solid shaded cube icon.
   * @returns SVG markup string.
   */
  static solid(): string {
    return this.wrapSvg(
      '<path fill="currentColor" d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9zm2 1.2v6.6l6 3.4V12L6 8.7zm8 9.9 6-3.4V8.7L14 12v6.6zM12 5.2 7.1 8 12 10.8 16.9 8 12 5.2z"/>'
    );
  }

  /**
   * Wireframe cube icon.
   * @returns SVG markup string.
   */
  static wireframe(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 3v18M4 7.5l8 4.5 8-4.5"/>'
    );
  }

  /**
   * Flat shaded cube icon.
   * @returns SVG markup string.
   */
  static flat(): string {
    return this.wrapSvg(
      '<path fill="currentColor" opacity="0.35" d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path fill="currentColor" d="M12 12 4 7.5v9L12 21V12zm0 0 8-4.5v9L12 21V12z"/>'
    );
  }

  /**
   * Fit / frame selection icon (bounding box with arrows).
   * @returns SVG markup string.
   */
  static fit(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M8 5H5v3M16 5h3v3M8 19H5v-3M16 19h3v-3"/><rect x="8" y="8" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>'
    );
  }

  /**
   * Floor align icon (horizontal plane).
   * @returns SVG markup string.
   */
  static alignFloor(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 14h16M6 14l2 5h8l2-5M8 14V9h8v5"/>'
    );
  }

  /**
   * Wall align icon (vertical plane).
   * @returns SVG markup string.
   */
  static alignWall(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M7 4h10v16H7zM7 12h10"/>'
    );
  }

  /**
   * Ceiling align icon (plane above).
   * @returns SVG markup string.
   */
  static alignCeiling(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 10h16M6 10l2-5h8l2 5M8 10v5h8v-5"/>'
    );
  }

  /**
   * Texture reset icon (circular arrow).
   * @returns SVG markup string.
   */
  static textureReset(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M7 8a6 6 0 1 1-1.5 6.5M7 8V4M7 8h4"/>'
    );
  }

  /**
   * Object selection cursor icon.
   * @returns SVG markup string.
   */
  static toolObjectSelect(): string {
    return this.wrapSvg(
      '<path fill="currentColor" d="M5 3l10 6-4 1 3 7-2 1-3-7-4 3V3z"/>'
    );
  }

  /**
   * Face selection icon (highlighted polygon face).
   * @returns SVG markup string.
   */
  static toolFaceSelect(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 8 12 4l7 4v8l-7 4-7-4V8z"/><path fill="currentColor" opacity="0.55" d="M12 10 7 12.5v4L12 19l5-2.5v-4L12 10z"/>'
    );
  }

  /**
   * Clip plane icon (solid cut by a diagonal plane).
   * @returns SVG markup string.
   */
  static toolClipPlane(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9z"/><path fill="currentColor" opacity="0.4" d="M12 3v18l-7-4.5v-9L12 3z"/><path stroke="currentColor" stroke-width="1.8" d="M8 19 16 5"/>'
    );
  }

  /**
   * Bounds / rect transform icon.
   * @returns SVG markup string.
   */
  static toolBounds(): string {
    return this.wrapSvg(
      '<rect x="5" y="5" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path fill="currentColor" d="M4 4h3v3H4zM17 4h3v3h-3zM4 17h3v3H4zM17 17h3v3h-3z"/>'
    );
  }

  /**
   * Move / translate gizmo icon.
   * @returns SVG markup string.
   */
  static toolMove(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 4v16M4 12h16"/><path fill="currentColor" d="M12 3l2.5 3.5h-5L12 3zm0 18-2.5-3.5h5L12 21zM3 12l3.5-2.5v5L3 12zm18 0-3.5 2.5v-5L21 12z"/>'
    );
  }

  /**
   * Rotate gizmo icon.
   * @returns SVG markup string.
   */
  static toolRotate(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M18.5 8.5A7 7 0 1 0 19 12"/><path fill="currentColor" d="M19 5.5v5h-5l5-5z"/>'
    );
  }

  /**
   * Scale gizmo icon.
   * @returns SVG markup string.
   */
  static toolScale(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M6 18 18 6M8 6h4M6 8v4M16 18h-4M18 16v-4"/><path fill="currentColor" d="M5 5h5v2H7v3H5V5zm14 14h-5v-2h3v-3h2v5z"/>'
    );
  }

  /**
   * Undo curved arrow icon.
   * @returns SVG markup string.
   */
  static undo(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M8 10H5V7"/><path fill="none" stroke="currentColor" stroke-width="1.7" d="M5 10a8 8 0 1 1 2.3 5.6"/>'
    );
  }

  /**
   * Redo curved arrow icon.
   * @returns SVG markup string.
   */
  static redo(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M16 10h3V7"/><path fill="none" stroke="currentColor" stroke-width="1.7" d="M19 10a8 8 0 1 0-2.3 5.6"/>'
    );
  }

  /**
   * UV editor grid icon.
   * @returns SVG markup string.
   */
  static uvEditor(): string {
    return this.wrapSvg(
      '<rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path stroke="currentColor" stroke-width="1.3" d="M12 4v16M4 12h16"/><path fill="currentColor" opacity="0.35" d="M12 12h8v8h-8z"/>'
    );
  }

  /**
   * Texture browser image icon.
   * @returns SVG markup string.
   */
  static textureBrowser(): string {
    return this.wrapSvg(
      '<rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 16l4-4 3 3 3-4 4 5"/>'
    );
  }

  /**
   * Tools palette wrench/panel icon.
   * @returns SVG markup string.
   */
  static toolsPanel(): string {
    return this.wrapSvg(
      '<rect x="5" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="14" width="6" height="6" rx="1" fill="currentColor" opacity="0.45"/>'
    );
  }

  /**
   * Snap-to-grid icon (grid with a snap target at the intersection).
   * @returns SVG markup string.
   */
  static snap(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 8h14M5 12h14M5 16h14M8 5v14M12 5v14M16 5v14"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>'
    );
  }

  /**
   * Cube primitive icon for the main toolbar.
   * @returns SVG markup string.
   */
  static primitiveCube(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M4 8 12 3.5 20 8v8L12 20.5 4 16V8z"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 12v8.5M4 8l8 4 8-4"/>'
    );
  }

  /**
   * Sphere primitive icon for the main toolbar.
   * @returns SVG markup string.
   */
  static primitiveSphere(): string {
    return this.wrapSvg(
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="3.5" ry="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M4.5 12h15"/>'
    );
  }

  /**
   * Cylinder primitive icon for the main toolbar.
   * @returns SVG markup string.
   */
  static primitiveCylinder(): string {
    return this.wrapSvg(
      '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11"/><ellipse cx="12" cy="17.5" rx="6.5" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    );
  }

  /**
   * Plane primitive icon for the main toolbar.
   * @returns SVG markup string.
   */
  static primitivePlane(): string {
    return this.wrapSvg(
      '<rect x="5" y="5" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="currentColor" opacity="0.3" d="M5 5h14v14H5z"/>'
    );
  }

  /**
   * Terrain primitive icon for the main toolbar.
   * @returns SVG markup string.
   */
  static primitiveTerrain(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M3 17 8 10l4 4 3-5 6 8H3z"/><path fill="currentColor" opacity="0.35" d="M3 17 8 10l4 4 3-5 6 8H3z"/>'
    );
  }

  /**
   * Solid model (brush CSG) icon for the main toolbar.
   * @returns SVG markup string.
   */
  static solidModel(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 8.5 12 4.5l7 4v8l-7 4-7-4v-8z"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M8 10h5v5H8z"/><path fill="currentColor" opacity="0.35" d="M10 7h7v7h-7z"/>'
    );
  }

  /**
   * About / information circle icon for the main toolbar.
   * @returns SVG markup string.
   */
  static about(): string {
    return this.wrapSvg(
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="currentColor" d="M11 10h2v7h-2zm0-3h2v2h-2z"/>'
    );
  }

  /**
   * Wraps path content in a standard 24x24 SVG element.
   * @param content Inner SVG path markup.
   * @returns Complete SVG element markup.
   */
  private static wrapSvg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  }
}
