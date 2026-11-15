import type { SolidOperation } from '@/solid/types/solid_operation.js';
import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterMaterial } from './physics_shatter_materials.js';

/**
 * How the input is broken: 'glass' random Voronoi cells, 'radial' shards around
 * the impact point, or 'bricks' a staggered brick bond.
 */
export type PhysicsShatterMode = 'glass' | 'radial' | 'bricks';

/**
 * Whether cracks run straight through the thickness ('2d': flat prisms) or cut
 * in every direction ('3d': chunks); 'auto' lets the pattern decide.
 */
export type PhysicsShatterCracks = 'auto' | '2d' | '3d';

/** An axis of the modifier frame, or 'auto' to pick one from the input's shape. */
export type PhysicsShatterAxis = 'auto' | 'x' | 'y' | 'z';

/** Settings of one fracture, all lengths in metres of the modifier frame. */
export interface PhysicsShatterSettings {
  /**
   * Material preset. Outside 'custom' it already set the pattern fields below
   * (mode, cracks, impact detail) and picks the finer crack shape.
   */
  material: PhysicsShatterMaterial;
  /** Fracture pattern. */
  mode: PhysicsShatterMode;
  /** 2D through-thickness or 3D cracks. */
  cracks: PhysicsShatterCracks;
  /** Axis 2D cracks run through; 'auto' takes the input's thinnest direction. */
  thicknessAxis: PhysicsShatterAxis;
  /** Direction cells stretch along; 'auto' takes the input's longest side. */
  grainAxis: PhysicsShatterAxis;
  /** Cell length along the grain over its width; 1 for no grain. */
  grainStretch: number;
  /** Radial cracks leaving the impact point in radial mode. */
  radialSpokes: number;
  /** Integer seed; the same seed and inputs give the same pieces. */
  seed: number;
  /** Typical piece size of glass mode. */
  crackSize: number;
  /** Zero spreads glass pieces evenly; one gathers them around the impact point. */
  impactDetail: number;
  /** Impact point in the modifier frame. */
  impactPoint: THREE.Vector3;
  /** Distance over which Impact Detail fades out. */
  impactRadius: number;
  /** Brick size along the run of the wall. */
  brickLength: number;
  /** Brick size along the frame's up axis. */
  brickHeight: number;
  /** Gap left between neighbouring bricks. */
  mortarGap: number;
  /**
   * Zero keeps every joint on the half-brick bond; one shifts joints up to a
   * quarter brick.
   */
  brickJitter: number;
  /** Largest number of pieces made from all inputs together. */
  maxPieces: number;
}

/** One convex brush to fracture, already in the modifier frame. */
export interface PhysicsShatterInput {
  /** Id of the brush the piece came from. */
  sourceBrushId: string;
  /** Convex brush in modifier frame coordinates. */
  brush: SolidBrush;
  /**
   * CSG operation of the brush; additive when left out. Subtractive inputs
   * carve the earlier inputs they overlap and make no pieces of their own.
   */
  operation?: SolidOperation;
}

/** Where a piece face came from. */
export interface PhysicsShatterFaceOrigin {
  /**
   * 'original' faces lie on an input face; 'crack' faces were made by the
   * fracture.
   */
  kind: 'original' | 'crack';
  /** Face index on the input brush for original faces, else -1. */
  sourceFaceIndex: number;
  /**
   * Input the original face lies on, when it is not the piece's own input: the
   * inner face of a hole a later subtractive brush cut.
   */
  sourceInputIndex?: number;
}

/** One convex piece of a fracture, in modifier frame coordinates. */
export interface PhysicsShatterPiece {
  /** Position in the result list, stable for the same seed and inputs. */
  index: number;
  /** Stable text id made of the input index and the cell index. */
  key: string;
  /** Id of the brush the piece came from. */
  sourceBrushId: string;
  /** Index of that brush in the fracture inputs. */
  sourceIndex: number;
  /** Voronoi site or brick index inside its input brush. */
  cellIndex: number;
  /** Fracture seed that produced the piece. */
  seed: number;
  /** True for bricks mode pieces. */
  isBrick: boolean;
  /** Convex piece geometry. */
  brush: SolidBrush;
  /** Hull vertices as flat x, y, z triples. */
  hull: Float32Array;
  /** Average of the hull vertices: the pivot c of a baked transform. */
  centroid: THREE.Vector3;
  /** Enclosed volume in cubic metres. */
  volume: number;
  /** Origin of each face, in face order. */
  faces: PhysicsShatterFaceOrigin[];
}

/** Outcome of one fracture. */
export interface PhysicsShatterResult {
  /** Pieces in deterministic order. */
  pieces: PhysicsShatterPiece[];
  /** Total volume of the inputs. */
  inputVolume: number;
  /** Volume that later brushes carved away or overlapped. */
  carvedVolume: number;
  /** Number of inputs that make no pieces: subtractive and intersecting ones. */
  carvingInputs: number;
  /** Volume of slivers and failed cells that were dropped. */
  droppedVolume: number;
  /** Number of dropped slivers and failed cells. */
  droppedPieces: number;
  /**
   * Number of bad cells (too thin, too small, a too short edge or too small
   * face) merged into their neighbours while healing.
   */
  repairedPieces: number;
  /** Number of pieces still short of the bounds after healing; kept anyway. */
  unsoundPieces: number;
  /** True when Max Pieces limited the result: fewer, larger pieces were made. */
  limited: boolean;
}
