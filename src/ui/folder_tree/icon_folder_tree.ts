/** Fill colour of the folder icons. */
const ICON_FOLDER_TREE_COLOR = '#c9a060';

/** Darker fill of an open folder's back. */
const ICON_FOLDER_TREE_BACK_COLOR = '#8f7144';

/**
 * Inline SVG folder icons for folder tree rows: a closed folder, and an open
 * one for an expanded folder.
 */
export class IconFolderTree {
  /**
   * Returns SVG markup for a closed folder.
   *
   * @returns Inline SVG string.
   */
  static closed(): string {
    return IconFolderTree.wrapSvg(
      `<path fill="${ICON_FOLDER_TREE_COLOR}" d="M2 5.5A1.5 1.5 0 0 1 3.5 4h5.2l2 2h9.8A1.5 1.5 0 0 1 22 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z"/>`,
    );
  }

  /**
   * Returns SVG markup for an open folder.
   *
   * @returns Inline SVG string.
   */
  static open(): string {
    const back = `<path fill="${ICON_FOLDER_TREE_BACK_COLOR}" d="M2 5.5A1.5 1.5 0 0 1 3.5 4h5.2l2 2h8.3A1.5 1.5 0 0 1 20.5 7.5V10H6.2a1.5 1.5 0 0 0-1.4 1L2 18.5z"/>`;
    const front = `<path fill="${ICON_FOLDER_TREE_COLOR}" d="M5.1 11.2A1.5 1.5 0 0 1 6.5 10.2h15a1 1 0 0 1 .95 1.3l-2.3 7.5a1.5 1.5 0 0 1-1.43 1H3.2a1 1 0 0 1-.95-1.3z"/>`;
    return IconFolderTree.wrapSvg(`${back}${front}`);
  }

  /**
   * Wraps path content in a 14px SVG sized for tree rows.
   *
   * @param content Inner SVG path markup.
   * @returns Complete SVG element markup.
   */
  private static wrapSvg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  }
}
