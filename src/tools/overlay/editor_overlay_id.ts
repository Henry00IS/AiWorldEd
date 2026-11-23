/**
 * Named editor overlays that tools opt into. Overlays are off by default; tools
 * that need them call {@link PolicyEditorOverlay.enable}.
 */
export enum EditorOverlayId {
  /** Selection size dimensions (CAD bounds rulers). */
  CAD_BOUNDS_RULERS = 'cad_bounds_rulers',
  /** Permanent bounds / translate / rotate / scale gizmos. */
  TRANSFORM_GIZMOS = 'transform_gizmos',
  /** Generator editing; while on, gizmos and bounds rulers stay hidden. */
  GENERATOR_EDITING = 'generator_editing',
}
