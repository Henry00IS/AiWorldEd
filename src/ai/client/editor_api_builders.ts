import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type {
  AddOpeningArgs,
  AddRoomShellArgs,
  CutOpeningArgs,
  PlaceWallArgs,
  PreviewNewBoxArgs,
} from './editor_api_types.js';
import { boxToDto, computeBrushWorldBounds, vec3ToDto } from './editor_api_math.js';
import { findBrush, findSolidModel } from './editor_api_lookup.js';
import {
  resolveEulerFromArgs,
  resolveSnappedPosition,
  resolveSnappedScale,
  shouldApplySnap,
  snapEulerWhenRequested,
} from './editor_api_snap.js';
import { failResult, okResult } from './editor_api_result.js';
import { assignSnapExact } from './editor_api_optional.js';
import type { EditorApiSolidWrites } from './editor_api_solid_writes.js';
import type { AddBoxBrushArgs, AddBoxBrushBatchEntry, AddBoxBrushesArgs } from './editor_api_types.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { McpToolResult, McpVec3 } from '@/ai/shared/mcp_protocol_types.js';

/** High-level geometry builders for walls, rooms, and openings. */
export class EditorApiBuilders {
  private readonly host: EditorApiHost;
  private readonly writes: EditorApiSolidWrites;

  /**
   * Creates builder helpers.
   *
   * @param host Editor host.
   * @param writes Solid write facade for box creation.
   */
  constructor(host: EditorApiHost, writes: EditorApiSolidWrites) {
    this.host = host;
    this.writes = writes;
  }

  /**
   * Dry-run for a new box: predicted world bounds without creating geometry.
   *
   * @param args Same fields as brush_box_add (requires modelId).
   * @returns Predicted bounds, size, center, and TRS.
   */
  previewNewBox(args: PreviewNewBoxArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return failResult(`Solid model not found: ${args.modelId}`);
    const useSnap = shouldApplySnap(args);
    const size = resolveBuilderSize(args.size);
    const position = resolveSnappedPosition(this.host, args.position, new THREE.Vector3(), useSnap);
    const rotation = snapEulerWhenRequested(this.host, resolveEulerFromArgs(args.rotationDegrees), useSnap);
    const scale = resolveSnappedScale(this.host, args.scale, new THREE.Vector3(1, 1, 1), useSnap);
    const topology = SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
    const localBounds = topology.computeLocalBounds();
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    const localMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
    model.root.updateMatrixWorld(true);
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(model.root.matrixWorld, localMatrix);
    const worldBounds = localBounds.clone().applyMatrix4(worldMatrix);
    const worldSize = worldBounds.getSize(new THREE.Vector3());
    const center = worldBounds.getCenter(new THREE.Vector3());
    return okResult('Preview new box (not created)', {
      modelId: model.root.uuid,
      position: vec3ToDto(position),
      rotationDegrees: {
        x: THREE.MathUtils.radToDeg(rotation.x),
        y: THREE.MathUtils.radToDeg(rotation.y),
        z: THREE.MathUtils.radToDeg(rotation.z),
      },
      scale: vec3ToDto(scale),
      size: vec3ToDto(size),
      worldBounds: boxToDto(worldBounds),
      center: vec3ToDto(center),
      worldSize: vec3ToDto(worldSize),
      applied: false,
    });
  }

  /**
   * Places a vertical wall segment between two XZ points. Box size is
   * {thickness, height, length}; yaw aligns local +Z with from→to.
   *
   * @param args Wall arguments.
   * @returns Created brush id.
   */
  placeWall(args: PlaceWallArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return failResult(`Solid model not found: ${args.modelId}`);
    if (!(args.height > 0) || !(args.thickness > 0)) return failResult('height and thickness must be positive');
    const dx = args.to.x - args.from.x;
    const dz = args.to.z - args.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return failResult('from and to must be distinct on XZ');
    const baseY = typeof args.baseY === 'number' ? args.baseY : 0;
    const midX = (args.from.x + args.to.x) * 0.5;
    const midZ = (args.from.z + args.to.z) * 0.5;
    // Local +Z maps to (sin yaw, 0, cos yaw); match segment direction (dx, dz).
    const yawDegrees = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
    const boxArgs: AddBoxBrushArgs = {
      modelId: args.modelId,
      size: { x: args.thickness, y: args.height, z: length },
      position: { x: midX, y: baseY + args.height * 0.5, z: midZ },
      rotationDegrees: { x: 0, y: yawDegrees, z: 0 },
      operation: args.operation ?? 'additive',
    };
    if (args.name !== undefined) boxArgs.name = args.name;
    assignSnapExact(boxArgs, args);
    return this.writes.addBoxBrush(boxArgs);
  }

  /**
   * Builds a hollow room: floor, four wall panels, optional ceiling. Walls
   * already leave the interior empty; interiorCarve is optional CSG cleanup.
   *
   * @param args Room shell arguments.
   * @returns Created brush ids.
   */
  addRoomShell(args: AddRoomShellArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return failResult(`Solid model not found: ${args.modelId}`);
    if (!(args.size.x > 0) || !(args.size.y > 0) || !(args.size.z > 0)) {
      return failResult('size components must be positive');
    }
    if (!(args.wallThickness > 0)) return failResult('wallThickness must be positive');
    const prefix = args.name?.trim() || 'room';
    const floorT = typeof args.floorThickness === 'number' ? args.floorThickness : args.wallThickness;
    const ceilT = typeof args.ceilingThickness === 'number' ? args.ceilingThickness : floorT;
    const center = args.position ?? { x: 0, y: args.size.y * 0.5, z: 0 };
    const halfX = args.size.x * 0.5;
    const halfZ = args.size.z * 0.5;
    const baseY = center.y - args.size.y * 0.5;
    const topY = center.y + args.size.y * 0.5;
    const ceilingAllowance = args.ceilingThickness === 0 ? 0 : ceilT;
    const wallHeight = Math.max(args.size.y - floorT - ceilingAllowance, 0.01);
    const wallBase = baseY + floorT;
    const wallCenterY = wallBase + wallHeight * 0.5;
    const brushes = this.buildRoomBrushList(
      args,
      prefix,
      center,
      halfX,
      halfZ,
      baseY,
      topY,
      floorT,
      ceilT,
      wallHeight,
      wallCenterY,
    );
    const batch: AddBoxBrushesArgs = { modelId: args.modelId, brushes };
    assignSnapExact(batch, args);
    return this.writes.addBoxBrushes(batch);
  }

  /**
   * Cuts a subtractive rectangular opening. position is the hole center; size
   * is full extents. Prefer build_opening_add when targeting a wall brush.
   *
   * @param args Cut arguments.
   * @returns Created subtractive brush id.
   */
  cutOpening(args: CutOpeningArgs): McpToolResult {
    const size = args.size;
    if (!(size.x > 0) || !(size.y > 0) || !(size.z > 0)) return failResult('size must be positive');
    const boxArgs: AddBoxBrushArgs = {
      modelId: args.modelId,
      size,
      position: args.position,
      operation: 'subtractive',
      name: args.name ?? 'opening_cut',
    };
    assignSnapExact(boxArgs, args);
    return this.writes.addBoxBrush(boxArgs);
  }

  /**
   * Cuts a door/window through an axis-aligned wall with optional frame. Prefer
   * targetBrushId so the cut sits on the wall midplane and CSG order is
   * correct. position is opening center; sillHeight sets the bottom Y when
   * given.
   *
   * @param args Opening arguments.
   * @returns Created brush ids (cut + optional frame).
   */
  addOpening(args: AddOpeningArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return failResult(`Solid model not found: ${args.modelId}`);
    const width = args.size.width;
    const height = args.size.height;
    if (!(width > 0) || !(height > 0)) return failResult('opening width and height must be positive');
    const placement = this.resolveOpeningPlacement(args, height);
    if (!placement.ok) return failResult(placement.message);
    const { center, axis, depth, targetBrushId } = placement;
    const prefix = args.name?.trim() || args.kind;
    const cutSize = orientedSize(width, height, depth, axis);
    const cutArgs: AddBoxBrushArgs = {
      modelId: args.modelId,
      size: cutSize,
      position: center,
      operation: 'subtractive',
      name: `${prefix}_cut`,
    };
    assignSnapExact(cutArgs, args);
    const cut = this.writes.addBoxBrush(cutArgs);
    if (!cut.ok) return cut;
    const cutBrushId = (cut.data as { brushId?: string } | undefined)?.brushId ?? null;
    if (cutBrushId && targetBrushId) {
      this.writes.reorderBrushRelative({
        brushId: cutBrushId,
        brushIdRelative: targetBrushId,
        placement: 'after',
      });
    }
    const createdIds = [...(cut.createdIds ?? [])];
    if (args.frameAdd !== false) {
      const frameIds = this.addOpeningFrame(args.modelId, prefix, center, width, height, depth, axis, args);
      createdIds.push(...frameIds);
    }
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    return okResult(
      `Added ${args.kind} opening`,
      { kind: args.kind, center, axis, depth, cutBrushId, targetBrushId, createdIds },
      { createdIds },
    );
  }

  /**
   * Builds room shell brush entries (panel walls; corners do not double-stack).
   *
   * @param args Room args.
   * @param prefix Name prefix.
   * @param center Room center.
   * @param halfX Half extent X.
   * @param halfZ Half extent Z.
   * @param baseY Floor bottom Y.
   * @param topY Ceiling top Y.
   * @param floorT Floor thickness.
   * @param ceilT Ceiling thickness.
   * @param wallHeight Wall height.
   * @param wallCenterY Wall center Y.
   * @returns Batch brush entries.
   */
  private buildRoomBrushList(
    args: AddRoomShellArgs,
    prefix: string,
    center: McpVec3,
    halfX: number,
    halfZ: number,
    baseY: number,
    topY: number,
    floorT: number,
    ceilT: number,
    wallHeight: number,
    wallCenterY: number,
  ) {
    const wallT = args.wallThickness;
    const sx = args.size.x;
    const sz = args.size.z;
    const brushes: AddBoxBrushBatchEntry[] = [
      {
        name: `${prefix}_floor`,
        size: { x: sx, y: floorT, z: sz },
        position: { x: center.x, y: baseY + floorT * 0.5, z: center.z },
        operation: 'additive',
      },
      {
        name: `${prefix}_wall_front`,
        size: { x: sx, y: wallHeight, z: wallT },
        position: { x: center.x, y: wallCenterY, z: center.z + halfZ - wallT * 0.5 },
        operation: 'additive',
      },
      {
        name: `${prefix}_wall_back`,
        size: { x: sx, y: wallHeight, z: wallT },
        position: { x: center.x, y: wallCenterY, z: center.z - halfZ + wallT * 0.5 },
        operation: 'additive',
      },
      {
        name: `${prefix}_wall_left`,
        size: { x: wallT, y: wallHeight, z: Math.max(sz - wallT * 2, 0.01) },
        position: { x: center.x - halfX + wallT * 0.5, y: wallCenterY, z: center.z },
        operation: 'additive',
      },
      {
        name: `${prefix}_wall_right`,
        size: { x: wallT, y: wallHeight, z: Math.max(sz - wallT * 2, 0.01) },
        position: { x: center.x + halfX - wallT * 0.5, y: wallCenterY, z: center.z },
        operation: 'additive',
      },
    ];
    if (ceilT > 0) {
      brushes.push({
        name: `${prefix}_ceiling`,
        size: { x: sx, y: ceilT, z: sz },
        position: { x: center.x, y: topY - ceilT * 0.5, z: center.z },
        operation: 'additive',
      });
    }
    if (args.interiorCarve !== false) {
      brushes.push(this.buildInteriorCarveBrush(args, prefix, center, baseY, floorT, ceilT, wallT));
    }
    return brushes;
  }

  /**
   * Builds an optional interior subtract matching the clear span between wall
   * inner faces (flush, no nibble into wall thickness).
   *
   * @param args Room args.
   * @param prefix Name prefix.
   * @param center Room center.
   * @param baseY Floor bottom.
   * @param floorT Floor thickness.
   * @param ceilT Ceiling thickness.
   * @param wallT Wall thickness.
   * @returns Subtractive brush entry.
   */
  private buildInteriorCarveBrush(
    args: AddRoomShellArgs,
    prefix: string,
    center: McpVec3,
    baseY: number,
    floorT: number,
    ceilT: number,
    wallT: number,
  ): AddBoxBrushBatchEntry {
    const innerW = Math.max(args.size.x - wallT * 2, 0.01);
    const innerD = Math.max(args.size.z - wallT * 2, 0.01);
    const innerH = Math.max(args.size.y - floorT - ceilT, 0.01);
    return {
      name: `${prefix}_interior_cut`,
      size: { x: innerW, y: innerH, z: innerD },
      position: { x: center.x, y: baseY + floorT + innerH * 0.5, z: center.z },
      operation: 'subtractive',
    };
  }

  /**
   * Resolves opening center, thickness axis, and cut depth.
   *
   * @param args Opening args.
   * @param height Opening height.
   * @returns Placement data or failure message.
   */
  private resolveOpeningPlacement(
    args: AddOpeningArgs,
    height: number,
  ):
    | { ok: true; center: McpVec3; axis: 'x' | 'z'; depth: number; targetBrushId: string | null }
    | { ok: false; message: string } {
    const axisFromArgs = resolveWallAxis(args);
    if (args.targetBrushId) {
      return this.placementFromTargetBrush(args, height, axisFromArgs);
    }
    const depth = typeof args.size.depth === 'number' ? args.size.depth : (args.wallThickness ?? 0.5);
    if (!(depth > 0)) return { ok: false, message: 'opening depth / wallThickness must be positive' };
    const center = resolveOpeningCenterY(args, height);
    return { ok: true, center, axis: axisFromArgs, depth, targetBrushId: null };
  }

  /**
   * Snaps the cut to a wall brush midplane and thickness.
   *
   * @param args Opening args.
   * @param height Opening height.
   * @param axisHint Axis from wall/axis args (overridden when wall is thin).
   * @returns Placement or failure.
   */
  private placementFromTargetBrush(
    args: AddOpeningArgs,
    height: number,
    axisHint: 'x' | 'z',
  ):
    | { ok: true; center: McpVec3; axis: 'x' | 'z'; depth: number; targetBrushId: string | null }
    | { ok: false; message: string } {
    const found = findBrush(this.host.worldObject, args.targetBrushId!);
    if (!found) return { ok: false, message: `Target wall brush not found: ${args.targetBrushId}` };
    if (found.model.root.uuid !== args.modelId) {
      return { ok: false, message: 'targetBrushId must belong to modelId' };
    }
    const bounds = computeBrushWorldBounds(found.model, found.brush);
    if (bounds.isEmpty()) return { ok: false, message: 'Target wall brush has empty bounds' };
    const size = bounds.getSize(new THREE.Vector3());
    const wallCenter = bounds.getCenter(new THREE.Vector3());
    const axis = pickThicknessAxis(size, axisHint, args.wall, args.axis);
    const depth =
      typeof args.size.depth === 'number'
        ? args.size.depth
        : typeof args.wallThickness === 'number'
          ? args.wallThickness
          : axis === 'x'
            ? size.x
            : size.z;
    if (!(depth > 0)) return { ok: false, message: 'resolved wall depth must be positive' };
    const center = resolveOpeningCenterY(args, height);
    if (axis === 'x') center.x = wallCenter.x;
    else center.z = wallCenter.z;
    return { ok: true, center, axis, depth, targetBrushId: found.brush.id };
  }

  /**
   * Adds thin frame strips around an opening. Doors omit the bottom strip.
   *
   * @param modelId Model id.
   * @param prefix Name prefix.
   * @param center Opening center.
   * @param width Opening width.
   * @param height Opening height.
   * @param depth Wall depth (frame thickness through wall).
   * @param axis Wall thickness axis.
   * @param args Opening args for snap and kind.
   * @returns Created frame brush ids.
   */
  private addOpeningFrame(
    modelId: string,
    prefix: string,
    center: McpVec3,
    width: number,
    height: number,
    depth: number,
    axis: 'x' | 'z',
    args: AddOpeningArgs,
  ): string[] {
    const frame = Math.min(0.12, Math.min(width, height) * 0.15);
    const pieces = buildFramePieces(prefix, center, width, height, depth, axis, frame, args.kind);
    const ids: string[] = [];
    for (const piece of pieces) {
      const frameArgs: AddBoxBrushArgs = {
        modelId,
        size: piece.size,
        position: piece.position,
        operation: 'additive',
        name: piece.name,
      };
      assignSnapExact(frameArgs, args);
      const result = this.writes.addBoxBrush(frameArgs);
      const id = (result.data as { brushId?: string } | undefined)?.brushId;
      if (id) ids.push(id);
    }
    if (args.mullionsAdd) {
      const midId = this.addMullionBrush(modelId, prefix, center, height, depth, axis, frame, args);
      if (midId) ids.push(midId);
    }
    return ids;
  }

  /**
   * Adds a vertical mullion through the opening center.
   *
   * @param modelId Model id.
   * @param prefix Name prefix.
   * @param center Opening center.
   * @param height Opening height.
   * @param depth Wall depth.
   * @param axis Thickness axis.
   * @param frame Frame thickness.
   * @param args Snap args.
   * @returns Created brush id or null.
   */
  private addMullionBrush(
    modelId: string,
    prefix: string,
    center: McpVec3,
    height: number,
    depth: number,
    axis: 'x' | 'z',
    frame: number,
    args: AddOpeningArgs,
  ): string | null {
    const alongX = axis === 'z';
    const size = alongX ? { x: frame * 0.75, y: height, z: depth } : { x: depth, y: height, z: frame * 0.75 };
    const mullionArgs: AddBoxBrushArgs = {
      modelId,
      size,
      position: center,
      operation: 'additive',
      name: `${prefix}_mullion`,
    };
    assignSnapExact(mullionArgs, args);
    const result = this.writes.addBoxBrush(mullionArgs);
    return (result.data as { brushId?: string } | undefined)?.brushId ?? null;
  }
}

/**
 * Resolves box size from number or vec3 for builders.
 *
 * @param size Size argument.
 * @returns Size vector.
 */
function resolveBuilderSize(size: number | McpVec3 | undefined): THREE.Vector3 {
  if (typeof size === 'number') return new THREE.Vector3(size, size, size);
  if (size) return new THREE.Vector3(size.x, size.y, size.z);
  return new THREE.Vector3(1, 1, 1);
}

/**
 * Maps wall / axis args to the wall thickness axis (through the wall).
 *
 * @param args Opening args.
 * @returns Thickness axis.
 */
function resolveWallAxis(args: AddOpeningArgs): 'x' | 'z' {
  if (args.wall === 'left' || args.wall === 'right') return 'x';
  if (args.wall === 'front' || args.wall === 'back') return 'z';
  if (args.axis === 'x') return 'x';
  return 'z';
}

/**
 * Picks thickness axis from wall bounds, preferring explicit wall/axis args.
 *
 * @param size Wall world AABB size.
 * @param axisHint Axis from wall/axis fields.
 * @param wall Optional named wall side.
 * @param axis Optional explicit axis.
 * @returns Thickness axis.
 */
function pickThicknessAxis(
  size: THREE.Vector3,
  axisHint: 'x' | 'z',
  wall?: AddOpeningArgs['wall'],
  axis?: AddOpeningArgs['axis'],
): 'x' | 'z' {
  if (wall || axis) return axisHint;
  return size.x <= size.z ? 'x' : 'z';
}

/**
 * Resolves opening center Y from sillHeight (bottom of hole) or position.y.
 *
 * @param args Opening args.
 * @param height Opening height.
 * @returns Center position (cloned fields).
 */
function resolveOpeningCenterY(args: AddOpeningArgs, height: number): McpVec3 {
  if (typeof args.sillHeight === 'number') {
    return { x: args.position.x, y: args.sillHeight + height * 0.5, z: args.position.z };
  }
  return { x: args.position.x, y: args.position.y, z: args.position.z };
}

/**
 * Builds oriented hole size: width along the wall, depth through the wall.
 *
 * @param width Opening width along wall.
 * @param height Opening height.
 * @param depth Cut depth through wall.
 * @param axis Thickness axis.
 * @returns Size vec3.
 */
function orientedSize(width: number, height: number, depth: number, axis: 'x' | 'z'): McpVec3 {
  if (axis === 'x') return { x: depth, y: height, z: width };
  return { x: width, y: height, z: depth };
}

/** One frame strip definition. */
interface FramePiece {
  name: string;
  size: McpVec3;
  position: McpVec3;
}

/**
 * Builds frame strip pieces around an opening. Doors skip the bottom strip.
 *
 * @param prefix Name prefix.
 * @param center Opening center.
 * @param width Opening width.
 * @param height Opening height.
 * @param depth Frame depth through wall.
 * @param axis Thickness axis.
 * @param frame Strip thickness.
 * @param kind Door or window.
 * @returns Frame pieces.
 */
function buildFramePieces(
  prefix: string,
  center: McpVec3,
  width: number,
  height: number,
  depth: number,
  axis: 'x' | 'z',
  frame: number,
  kind: 'window' | 'door',
): FramePiece[] {
  const alongX = axis === 'z';
  const pieces: FramePiece[] = [];
  pieces.push(frameTop(prefix, center, width, height, depth, alongX, frame));
  if (kind !== 'door') pieces.push(frameBottom(prefix, center, width, height, depth, alongX, frame));
  pieces.push(frameLeft(prefix, center, width, height, depth, alongX, frame));
  pieces.push(frameRight(prefix, center, width, height, depth, alongX, frame));
  return pieces;
}

/**
 * Top frame strip above the opening.
 *
 * @param prefix Name prefix.
 * @param center Opening center.
 * @param width Opening width.
 * @param height Opening height.
 * @param depth Frame depth.
 * @param alongX True when width runs along X.
 * @param frame Strip thickness.
 * @returns Frame piece.
 */
function frameTop(
  prefix: string,
  center: McpVec3,
  width: number,
  height: number,
  depth: number,
  alongX: boolean,
  frame: number,
): FramePiece {
  return {
    name: `${prefix}_frame_top`,
    size: alongX ? { x: width + frame * 2, y: frame, z: depth } : { x: depth, y: frame, z: width + frame * 2 },
    position: { x: center.x, y: center.y + height * 0.5 + frame * 0.5, z: center.z },
  };
}

/**
 * Bottom frame strip under the opening (windows / sills).
 *
 * @param prefix Name prefix.
 * @param center Opening center.
 * @param width Opening width.
 * @param height Opening height.
 * @param depth Frame depth.
 * @param alongX True when width runs along X.
 * @param frame Strip thickness.
 * @returns Frame piece.
 */
function frameBottom(
  prefix: string,
  center: McpVec3,
  width: number,
  height: number,
  depth: number,
  alongX: boolean,
  frame: number,
): FramePiece {
  return {
    name: `${prefix}_frame_bottom`,
    size: alongX ? { x: width + frame * 2, y: frame, z: depth } : { x: depth, y: frame, z: width + frame * 2 },
    position: { x: center.x, y: center.y - height * 0.5 - frame * 0.5, z: center.z },
  };
}

/**
 * Left frame strip beside the opening.
 *
 * @param prefix Name prefix.
 * @param center Opening center.
 * @param width Opening width.
 * @param height Opening height.
 * @param depth Frame depth.
 * @param alongX True when width runs along X.
 * @param frame Strip thickness.
 * @returns Frame piece.
 */
function frameLeft(
  prefix: string,
  center: McpVec3,
  width: number,
  height: number,
  depth: number,
  alongX: boolean,
  frame: number,
): FramePiece {
  if (alongX) {
    return {
      name: `${prefix}_frame_left`,
      size: { x: frame, y: height, z: depth },
      position: { x: center.x - width * 0.5 - frame * 0.5, y: center.y, z: center.z },
    };
  }
  return {
    name: `${prefix}_frame_left`,
    size: { x: depth, y: height, z: frame },
    position: { x: center.x, y: center.y, z: center.z - width * 0.5 - frame * 0.5 },
  };
}

/**
 * Right frame strip beside the opening.
 *
 * @param prefix Name prefix.
 * @param center Opening center.
 * @param width Opening width.
 * @param height Opening height.
 * @param depth Frame depth.
 * @param alongX True when width runs along X.
 * @param frame Strip thickness.
 * @returns Frame piece.
 */
function frameRight(
  prefix: string,
  center: McpVec3,
  width: number,
  height: number,
  depth: number,
  alongX: boolean,
  frame: number,
): FramePiece {
  if (alongX) {
    return {
      name: `${prefix}_frame_right`,
      size: { x: frame, y: height, z: depth },
      position: { x: center.x + width * 0.5 + frame * 0.5, y: center.y, z: center.z },
    };
  }
  return {
    name: `${prefix}_frame_right`,
    size: { x: depth, y: height, z: frame },
    position: { x: center.x, y: center.y, z: center.z + width * 0.5 + frame * 0.5 },
  };
}
