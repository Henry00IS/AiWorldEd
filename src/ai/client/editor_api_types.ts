import type {
  McpBounds,
  McpBrushOrderEnd,
  McpDetailLevel,
  McpSolidOperationName,
  McpVec3,
} from '@/ai/shared/mcp_protocol_types.js';

export type {
  McpBounds,
  McpBrushOrderEnd,
  McpDetailLevel,
  McpSolidOperationName,
  McpVec3,
} from '@/ai/shared/mcp_protocol_types.js';

/** Compact solid model row for list tools. */
export interface SolidModelSummaryDto {
  modelId: string;
  name: string;
  brushCount: number;
  invertedWorld: boolean;
  worldBounds: McpBounds | null;
}

/** Brush row inside a solid model payload. */
export interface SolidBrushSummaryDto {
  brushId: string;
  name: string;
  operation: McpSolidOperationName;
  orderIndex: number;
  visible: boolean;
  position: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Prefer this over radians. */
  rotationDegrees: McpVec3;
  scale: McpVec3;
  localBounds: McpBounds | null;
  worldBounds: McpBounds | null;
  /**
   * Parent solid CSG group uuid when nested under a compound; null when the
   * brush is a direct child of the solid model root.
   */
  parentGroupId: string | null;
}

/** Solid CSG compound group summary. */
export interface SolidCsgGroupSummaryDto {
  groupId: string;
  name: string;
  operation: McpSolidOperationName;
  modelId: string;
  /** Parent group uuid, or null when parented under the solid model root. */
  parentGroupId: string | null;
  childBrushIds: string[];
  childGroupIds: string[];
}

/** Full solid model payload with ordered brushes and hierarchy tree. */
export interface SolidModelDetailDto extends SolidModelSummaryDto {
  /** CSG evaluation order (depth-first scene order of brushes). */
  brushes: SolidBrushSummaryDto[];
  /** Nested solid hierarchy matching the outliner under this model. */
  hierarchy: HierarchyNodeDto[];
}

/** Optional geometry payload for full brush detail. */
export interface SolidBrushGeometryDto {
  vertices: McpVec3[];
  faceCount: number;
  planes: Array<{ normal: McpVec3; distance: number }>;
}

/** Brush detail including optional topology. */
export interface SolidBrushDetailDto extends SolidBrushSummaryDto {
  modelId: string;
  geometry?: SolidBrushGeometryDto;
}

/** Snap settings exposed to the AI. */
export interface SnapSettingsDto {
  enabled: boolean;
  /** Translation grid step. */
  interval: number;
  /** Rotation snap step in degrees (e.g. 15). */
  rotationSnapDegrees: number;
  /** Scale factor snap step. */
  scaleSnapInterval: number;
}

/** Editor session context for planning tools. */
export interface EditorContextDto {
  applicationName: string;
  version: string;
  coordinateSystem: string;
  handedness: string;
  upAxis: string;
  snap: SnapSettingsDto;
  undoCount: number;
  redoCount: number;
  solidModelCount: number;
  selection: SelectionSummaryDto;
}

/** Selection summary for context and selection_get. */
export interface SelectionSummaryDto {
  brushIds: string[];
  /** Selected solid CSG group uuids (outliner group selection). */
  groupIds: string[];
  solidModelIds: string[];
  meshCount: number;
}

/** Hierarchy node for solid model / CSG group / brush trees. */
export interface HierarchyNodeDto {
  id: string;
  name: string;
  kind: 'solid_model' | 'csg_group' | 'brush' | 'other';
  /** Present on brushes and csg_group nodes. */
  operation?: McpSolidOperationName;
  children: HierarchyNodeDto[];
}

/** Arguments accepted by brush_box_add. */
export interface AddBoxBrushArgs {
  modelId: string;
  /** Brush shape filling the size: box (default) or wedge. */
  shape?: string;
  size?: number | McpVec3;
  position?: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Preferred. */
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  operation?: McpSolidOperationName;
  /** Display name (e.g. start_a_flag). Prefer stable names over Brush14. */
  name?: string;
  /**
   * Optional solid CSG group uuid. When set, the new brush is parented under
   * that group (same solid model). Omit to parent under the solid root.
   */
  parentGroupId?: string;
  /** When false, skip grid snap. Same as exact:true. */
  snap?: boolean;
  /** When true, skip grid snap for precise placement. */
  exact?: boolean;
}

/** Create a solid CSG compound group from brushes and/or nested groups. */
export interface CreateCsgGroupArgs {
  modelId: string;
  /** Brush ids to move into the new group. */
  brushIds?: string[];
  /** Existing solid CSG group uuids to nest under the new group. */
  groupIds?: string[];
  /** Parent group uuid, or omit to parent under the solid model root. */
  parentGroupId?: string;
  /** Display name for the new group (default GroupN). */
  name?: string;
  /** Branch CSG operation when combining into the parent (default additive). */
  operation?: McpSolidOperationName;
}

/** Set CSG operation on solid compound groups. */
export interface SetGroupOperationArgs {
  groupIds: string[];
  operation: McpSolidOperationName;
}

/** Ungroup solid CSG compounds (children reparent to the former group parent). */
export interface UngroupCsgGroupsArgs {
  groupIds: string[];
}

/**
 * Reparent solid brushes and/or CSG groups under a solid root or another CSG
 * group in the same solid model.
 */
export interface ReparentSolidNodesArgs {
  /** Brush ids and/or solid CSG group uuids. */
  nodeIds: string[];
  /** Destination parent: solid model uuid (root) or solid CSG group uuid. */
  parentId: string;
  /** Optional sibling id (brush or group) to insert before; omit to append. */
  nodeIdBefore?: string;
}

/** Rename a solid CSG group. */
export interface RenameGroupArgs {
  groupId: string;
  name: string;
}

/** Get one solid CSG group summary. */
export interface GetCsgGroupArgs {
  groupId: string;
}

/** One box entry for brush_boxes_add batch create. */
export interface AddBoxBrushBatchEntry {
  /** Brush shape filling the size: box (default) or wedge. */
  shape?: string;
  size?: number | McpVec3;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  operation?: McpSolidOperationName;
  name?: string;
  /** Optional solid CSG group uuid to parent under. */
  parentGroupId?: string;
  /** Insert after a brush with this display name after create. */
  nameAfter?: string;
  /** Insert before a brush with this display name after create. */
  nameBefore?: string;
  /** Insert after this brush id after create. */
  brushIdAfter?: string;
  /** Insert before this brush id after create. */
  brushIdBefore?: string;
}

/** Batch create many box brushes on one model. */
export interface AddBoxBrushesArgs {
  modelId: string;
  brushes: AddBoxBrushBatchEntry[];
  snap?: boolean;
  exact?: boolean;
}

/** Relative CSG order placement. */
export interface ReorderBrushRelativeArgs {
  brushId: string;
  brushIdRelative?: string;
  nameRelative?: string;
  placement: 'before' | 'after';
}

/** Dry-run new box (same TRS fields as brush_box_add). */
export interface PreviewNewBoxArgs {
  modelId: string;
  size?: number | McpVec3;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  snap?: boolean;
  exact?: boolean;
}

/** Half-extents query. */
export interface HalfExtentsArgs {
  brushId: string;
}

/** Explain CSG membership at a world point. */
export interface ExplainCsgAtPointArgs {
  point: McpVec3;
  modelId?: string;
}

/** Approximate void connectivity between two world points. */
export interface QueryVoidConnectivityArgs {
  pointFrom: McpVec3;
  pointTo: McpVec3;
  modelId?: string;
}

/**
 * Place a wall segment on XZ. Centerline runs from→to; box size is {thickness,
 * height, length} with yaw aligning local +Z to the segment.
 */
export interface PlaceWallArgs {
  modelId: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  height: number;
  thickness: number;
  /** Bottom of the wall (default 0). Position Y becomes baseY + height/2. */
  baseY?: number;
  operation?: McpSolidOperationName;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Hollow room shell: floor + four wall panels + optional ceiling. Outer size is
 * the exterior footprint; walls sit inside that AABB. Interior is empty without
 * interiorCarve (default true still adds a nibble cut).
 */
export interface AddRoomShellArgs {
  modelId: string;
  /**
   * Exterior size (full width, full height including floor/ceiling, full
   * depth).
   */
  size: McpVec3;
  /** Room center (default y = size.y/2 so floor sits on y=0). */
  position?: McpVec3;
  wallThickness: number;
  floorThickness?: number;
  /** Use 0 for no ceiling. Default matches floorThickness / wallThickness. */
  ceilingThickness?: number;
  /**
   * When not false, adds a subtractive interior box slightly larger than the
   * clear span. The panel walls are already hollow; this is optional CSG
   * cleanup.
   */
  interiorCarve?: boolean;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Minimal subtractive rectangular opening. position is the hole center; size is
 * full extents {x,y,z}. Does not auto-align to a wall.
 */
export interface CutOpeningArgs {
  modelId: string;
  position: McpVec3;
  size: McpVec3;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Door/window opening with optional frame. Axis-aligned walls only. Prefer
 * targetBrushId so the cut sits on the wall midplane, depth matches the wall,
 * and CSG order places the cut after that wall.
 */
export interface AddOpeningArgs {
  modelId: string;
  kind: 'window' | 'door';
  /**
   * Named room side (front=+Z outer, back=-Z, left=-X, right=+X). Sets
   * thickness axis only; does not move the opening onto a room. Prefer
   * targetBrushId.
   */
  wall?: 'front' | 'back' | 'left' | 'right';
  /** Thickness axis when wall is omitted (through-wall axis). Default z. */
  axis?: 'x' | 'z';
  /**
   * Opening center. When targetBrushId is set, the through-wall axis coordinate
   * is replaced with the wall midplane. Use sillHeight for bottom Y instead of
   * y.
   */
  position: McpVec3;
  size: { width: number; height: number; depth?: number };
  /** Fallback depth when size.depth and targetBrushId thickness are omitted. */
  wallThickness?: number;
  /**
   * Bottom Y of the opening (floor top for doors, sill for windows). When set,
   * center Y becomes sillHeight + height/2 (overrides position.y).
   */
  sillHeight?: number;
  /**
   * Wall brush to cut. Snaps cut to wall midplane, uses wall thickness as
   * depth, and reorders the subtractive brush after this wall. Strongly
   * recommended.
   */
  targetBrushId?: string;
  /** Frame strips (default true). Doors omit the bottom strip. */
  frameAdd?: boolean;
  /** Center mullion (default false). Avoid for doors. */
  mullionsAdd?: boolean;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/** Partial transform update for a brush. */
export interface SetBrushTransformArgs {
  brushId: string;
  position?: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Preferred. */
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  /** When false, skip grid/rotation/scale snap. */
  snap?: boolean;
  /** When true, skip snap (alias of snap:false). */
  exact?: boolean;
}

/** Batch transform updates. */
export interface BatchSetBrushTransformArgs {
  transforms: SetBrushTransformArgs[];
  /** Default snap for entries that omit snap/exact. */
  snap?: boolean;
  exact?: boolean;
}

/** Relative rotation for one brush (degrees, snapped when snap is on). */
export interface RotateBrushArgs {
  brushId: string;
  /** Rotation amount in degrees (relative by default). */
  degrees: number;
  /** Axis to rotate around. Default y (yaw) for level design. */
  axis?: 'x' | 'y' | 'z';
  /** When true, sets absolute angle on that axis instead of adding. */
  absolute?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Rename one brush for stable AI-friendly ids. */
export interface RenameBrushArgs {
  brushId: string;
  name: string;
}

/**
 * Align moving brush to target brush face. mode top = stack on target top;
 * bottom = hang under; side = touch on axis.
 */
export interface AlignBrushArgs {
  brushId: string;
  targetBrushId: string;
  /** Top | bottom | side (requires axis). */
  mode: 'top' | 'bottom' | 'side';
  /** For mode side: which horizontal axis to touch (+/- direction). */
  axis?: 'x' | 'z';
  /** For mode side: +1 places on +axis face of target, -1 on -axis face. */
  direction?: 1 | -1;
  /** Gap between faces (world units). Default 0. */
  gap?: number;
  /** Center on the contact face in free axes (default true). */
  center?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Dry-run transform: predicted world bounds without committing. */
export interface PreviewTransformArgs {
  brushId: string;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  snap?: boolean;
  exact?: boolean;
}

/** Filtered brush inventory. */
export interface FindBrushesArgs {
  modelId?: string;
  /** Case-insensitive name substring. */
  nameContains?: string;
  /** Shape filter: thin|pole|tall|flat|panel|flag|long|box|any. */
  shape?: string;
  heightMin?: number;
  heightMax?: number;
  /** World AABB region filter (center must be inside). */
  region?: McpBounds;
  limit?: number;
}

/** Mirror brushes across a world-aligned plane. */
export interface MirrorBrushesArgs {
  brushIds: string[];
  /** Mirror across X or Z (Y-up maps). */
  axis: 'x' | 'z';
  /** Plane position on axis (default 0). */
  plane?: number;
  /** When true (default), duplicate then mirror; when false, move in place. */
  copy?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Duplicate brushes and/or solid CSG groups with optional offset and/or mirror. */
export interface DuplicateBrushesArgs {
  brushIds?: string[];
  /** Solid CSG group uuids; each group is cloned with nested brushes. */
  groupIds?: string[];
  offset?: McpVec3;
  /** Optional mirror after duplicate (assembly flip). */
  mirrorAxis?: 'x' | 'z';
  mirrorPlane?: number;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Plane clip of one brush. Define the plane with axis+distance (simplest),
 * point+normal, or three points. frontKeep keeps the Three.js front half-space
 * (along the plane normal / +axis).
 */
export interface ClipBrushArgs {
  brushId: string;
  axis?: 'x' | 'y' | 'z';
  distance?: number;
  point?: McpVec3;
  normal?: McpVec3;
  pointA?: McpVec3;
  pointB?: McpVec3;
  pointC?: McpVec3;
  /** Keep the front half-space (default true). */
  frontKeep?: boolean;
}

/** Split one brush into two pieces with the same plane definition as clip. */
export interface SplitBrushArgs {
  brushId: string;
  axis?: 'x' | 'y' | 'z';
  distance?: number;
  point?: McpVec3;
  normal?: McpVec3;
  pointA?: McpVec3;
  pointB?: McpVec3;
  pointC?: McpVec3;
}

/** Overlap query against a box or reference brush. */
export interface QueryOverlapsArgs {
  modelId?: string;
  brushId?: string;
  bounds?: McpBounds;
}

/** Neighbor query around a brush or point. */
export interface QueryNeighborsArgs {
  modelId?: string;
  brushId?: string;
  point?: McpVec3;
  radius: number;
  /** Max neighbors to return (nearest first). Default all in radius. */
  limit?: number;
}

/** Point containment query. */
export interface QueryPointArgs {
  modelId?: string;
  point: McpVec3;
}

/** Measure distance or size between entities. */
export interface MeasureArgs {
  brushIdFrom?: string;
  brushIdTo?: string;
  pointFrom?: McpVec3;
  pointTo?: McpVec3;
  brushId?: string;
}

/** Detail-level argument shared by several read tools. */
export interface DetailArgs {
  detail?: McpDetailLevel;
}

/** Reorder brushes and/or solid CSG groups among siblings (first or last). */
export interface ReorderBrushesArgs {
  brushIds?: string[];
  /** Solid CSG group uuids to move among their siblings. */
  groupIds?: string[];
  end: McpBrushOrderEnd;
}
