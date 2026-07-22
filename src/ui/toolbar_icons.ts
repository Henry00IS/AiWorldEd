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
   * Face selection icon (highlighted polygon).
   * @returns SVG markup string.
   */
  static toolFaceSelect(): string {
    return this.wrapSvg(
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 8 12 4l7 4v8l-7 4-7-4V8z"/><path fill="currentColor" opacity="0.45" d="M12 10 7 12.5v4L12 19l5-2.5v-4L12 10z"/>'
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
   * Wraps path content in a standard 24x24 SVG element.
   * @param content Inner SVG path markup.
   * @returns Complete SVG element markup.
   */
  private static wrapSvg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  }
}
