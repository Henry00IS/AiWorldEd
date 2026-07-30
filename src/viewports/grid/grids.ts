import * as THREE from 'three';
import { GridPlane } from './grid_plane.js';
import { InfiniteGrid2D } from './infinite_grid_2d.js';
import { InfiniteGrid3D } from './infinite_grid_3d.js';
import { CoordinateSpaceAdapter, type CoordinateAxis } from '../../coordinates/coordinate_space_adapter.js';
import type { CoordinateSpaceDefinition } from '../../settings/coordinate_space_types.js';
import { Theme } from '../../theme.js';

export type { GridPlane } from './grid_plane.js';

/**
 * Viewport grid facade. Perspective viewports get a camera-following faded 3D
 * floor grid. Orthographic viewports get an adaptive infinite plane grid.
 */
export class Grids {
  private root: THREE.Group;
  private grid3d: InfiniteGrid3D | null;
  private grid2d: InfiniteGrid2D | null;
  private plane: GridPlane;

  /**
   * Creates a grid for either perspective (xz floor) or orthographic use.
   *
   * @param size Unused legacy size argument kept for call-site compatibility.
   * @param divisions Unused legacy divisions argument kept for call-site
   *   compatibility.
   * @param plane Grid plane for 2D viewports (ignored for pure 3D floor mode).
   * @param mode When 'perspective', builds the 3D infinite floor grid.
   */
  constructor(
    size: number = 50,
    divisions: number = 50,
    plane: GridPlane = 'xz',
    mode: 'perspective' | 'orthographic' = 'orthographic',
  ) {
    void size;
    void divisions;
    this.root = new THREE.Group();
    this.root.name = 'grids_root';
    this.plane = plane;
    this.grid3d = null;
    this.grid2d = null;
    if (mode === 'perspective') {
      this.grid3d = new InfiniteGrid3D(0.25);
      this.root.add(this.grid3d.getObject());
      return;
    }
    this.grid2d = new InfiniteGrid2D(plane, 0.25);
    this.root.add(this.grid2d.getObject());
  }

  /**
   * Returns the root group containing grid line geometry.
   *
   * @returns The grid root group (used as a scene child).
   */
  getScene(): THREE.Group {
    return this.root;
  }

  /**
   * Updates dynamic grid geometry for the active camera.
   *
   * @param camera The viewport camera.
   */
  update(camera: THREE.Camera): void {
    if (this.grid3d) {
      this.grid3d.update(camera);
      return;
    }
    if (this.grid2d && camera instanceof THREE.OrthographicCamera) {
      this.grid2d.update(camera);
    }
  }

  /**
   * Applies the editor snap interval to the grid cell base size.
   *
   * @param snapInterval Snap step in world units.
   */
  setSnapInterval(snapInterval: number): void {
    if (this.grid3d) {
      this.grid3d.setCellSize(snapInterval);
    }
    if (this.grid2d) {
      this.grid2d.setSnapInterval(snapInterval);
    }
  }

  /**
   * Applies profile-axis colors while leaving physical grid geometry intact.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    const adapter = new CoordinateSpaceAdapter(space);
    if (this.grid3d) {
      this.applyPerspectiveAxisColors(adapter);
    }
    if (this.grid2d) {
      this.applyOrthographicAxisColors(adapter);
    }
  }

  /**
   * Applies translated profile colors to the XZ perspective floor.
   *
   * @param adapter Active coordinate adapter.
   */
  private applyPerspectiveAxisColors(adapter: CoordinateSpaceAdapter): void {
    const xColor = colorForAxis(adapter.editorAxisToProfileAxis('x'));
    const zColor = colorForAxis(adapter.editorAxisToProfileAxis('z'));
    this.grid3d?.setAxisColors(xColor, zColor);
  }

  /**
   * Applies translated profile colors to the configured orthographic plane.
   *
   * @param adapter Active coordinate adapter.
   */
  private applyOrthographicAxisColors(adapter: CoordinateSpaceAdapter): void {
    const [uAxis, vAxis] = editorAxesForPlane(this.plane);
    const uColor = colorForAxis(adapter.editorAxisToProfileAxis(uAxis));
    const vColor = colorForAxis(adapter.editorAxisToProfileAxis(vAxis));
    this.grid2d?.setAxisColors(uColor, vColor);
  }

  /**
   * Legacy accessor kept so existing call sites compile. Infinite grids no
   * longer use THREE.GridHelper.
   *
   * @returns A placeholder GridHelper (not added to the scene).
   */
  getGridHelper(): THREE.GridHelper {
    return new THREE.GridHelper(1, 1);
  }

  /**
   * Returns the plane orientation for orthographic grids.
   *
   * @returns The grid plane.
   */
  getPlane(): GridPlane {
    return this.plane;
  }

  /** Disposes underlying grid resources. */
  dispose(): void {
    this.grid3d?.dispose();
    this.grid2d?.dispose();
  }
}

/**
 * Returns physical editor axes used as plane U and V.
 *
 * @param plane Grid plane.
 * @returns U and V editor axes.
 */
function editorAxesForPlane(plane: GridPlane): [CoordinateAxis, CoordinateAxis] {
  if (plane === 'xz') return ['x', 'z'];
  if (plane === 'xy') return ['x', 'y'];
  return ['z', 'y'];
}

/**
 * Returns the theme color for a profile coordinate axis.
 *
 * @param axis Profile axis.
 * @returns Numeric theme color.
 */
function colorForAxis(axis: CoordinateAxis): number {
  if (axis === 'x') return Theme.gridXAxisColor;
  if (axis === 'y') return Theme.gridYAxisColor;
  return Theme.gridZAxisColor;
}
