/**
 * The current transform mode of the gizmo.
 * Determines which type of transform handles are displayed.
 */
export enum TransformMode {
  TRANSLATE = 'translate',
  ROTATE = 'rotate',
  SCALE = 'scale',
  BOUNDS = 'bounds'
}

/**
 * Individual gizmo axes and planes that can be interacted with.
 * X, Y, Z are single-axis handles. XY_PLANE, YZ_PLANE, XZ_PLANE are planar handles.
 */
export enum GizmoAxis {
  X = 'x',
  Y = 'y',
  Z = 'z',
  XY_PLANE = 'xy_plane',
  YZ_PLANE = 'yz_plane',
  XZ_PLANE = 'xz_plane'
}
