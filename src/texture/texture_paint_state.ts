import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';

/**
 * Tracks the last texture chosen in the browser for paint / fill operations.
 */
export class TexturePaintState {
  private lastTextureId: string;

  /**
   * Creates paint state defaulting to the built-in checker.
   */
  constructor() {
    this.lastTextureId = DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Returns the last selected texture id.
   * @returns Texture id (never empty).
   */
  getLastTextureId(): string {
    return this.lastTextureId;
  }

  /**
   * Records the last selected texture id for fills and new surfaces.
   * @param textureId Texture id to remember.
   */
  setLastTextureId(textureId: string): void {
    if (!textureId) return;
    this.lastTextureId = textureId;
  }

  /**
   * Resets to the built-in checker (tests / teardown).
   */
  reset(): void {
    this.lastTextureId = DEFAULT_CHECKER_TEXTURE_ID;
  }
}

let sharedPaintState: TexturePaintState | null = null;

/**
 * Returns the process-wide paint state singleton.
 * @returns Shared TexturePaintState.
 */
export function getTexturePaintState(): TexturePaintState {
  if (!sharedPaintState) {
    sharedPaintState = new TexturePaintState();
  }
  return sharedPaintState;
}

/**
 * Replaces the shared paint state (tests only).
 * @param state State to install, or null to clear.
 */
export function setTexturePaintStateForTests(
  state: TexturePaintState | null
): void {
  sharedPaintState = state;
}
