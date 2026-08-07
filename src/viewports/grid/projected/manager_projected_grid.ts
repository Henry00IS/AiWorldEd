import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import {
  readSharedProjectedGridVisible,
  resetSharedProjectedGridUniforms,
  writeSharedProjectedGridCellSize,
  writeSharedProjectedGridPlaneFrame,
  writeSharedProjectedGridVisible,
} from '@/materials/shader/uniform/uniform_projected_grid_shared.js';

/** Static accessors that update and read shared projected-grid state. */
export class ManagerProjectedGrid {
  /**
   * Writes the oriented lattice plane frame into shared projected-grid state.
   *
   * @param frame Grid plane origin and axes.
   */
  static setPlaneFrame(frame: EditorPlaneFrame): void {
    writeSharedProjectedGridPlaneFrame(frame);
  }

  /**
   * Writes the minor cell size into shared projected-grid state.
   *
   * @param cellSize World units per minor cell.
   */
  static setCellSize(cellSize: number): void {
    writeSharedProjectedGridCellSize(cellSize);
  }

  /**
   * Enables or disables projected-grid drawing in shared state.
   *
   * @param visible Whether the lattice should draw.
   */
  static setVisibleForRenderPass(visible: boolean): void {
    writeSharedProjectedGridVisible(visible);
  }

  /**
   * Returns whether the shared projected grid is currently enabled.
   *
   * @returns True when drawing.
   */
  static isVisible(): boolean {
    return readSharedProjectedGridVisible();
  }

  /** Clears shared projected-grid uniforms and restores default visibility. */
  static dispose(): void {
    resetSharedProjectedGridUniforms();
  }
}
