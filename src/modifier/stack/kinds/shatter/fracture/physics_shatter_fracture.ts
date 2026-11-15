import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterPiece,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from './physics_shatter_types.js';
import { physicsShatterBrushVolume } from './physics_shatter_geometry.js';
import { physicsShatterSites } from './physics_shatter_sites.js';
import {
  PHYSICS_SHATTER_METRIC_EUCLIDEAN,
  PhysicsShatterVoronoiPattern,
  type PhysicsShatterCell,
} from './physics_shatter_voronoi.js';
import { PhysicsShatterBrickPattern } from './physics_shatter_bricks.js';
import type { PhysicsShatterPattern } from './physics_shatter_pattern.js';
import { physicsShatterPieceCreate, type PhysicsShatterPieceSource } from './physics_shatter_piece.js';
import {
  physicsShatterCarve,
  physicsShatterCutters,
  physicsShatterInputMakesPieces,
  type PhysicsShatterCutter,
} from './physics_shatter_carve.js';
import {
  physicsShatterPieceBoundsFor,
  physicsShatterPieceShape,
  physicsShatterPieceShapeSound,
  type PhysicsShatterPieceBounds,
} from './physics_shatter_quality.js';

/** Smallest kept piece, as a share of one typical piece's volume. */
const PHYSICS_SHATTER_MIN_PIECE_SHARE = 1e-3;

/** Smallest kept piece in cubic metres, whatever the settings. */
const PHYSICS_SHATTER_MIN_PIECE_VOLUME = 1e-7;

/** Most heal rounds per input; each round merges every bad cell found. */
const PHYSICS_SHATTER_REPAIR_ROUNDS = 40;

/** Most tries to fit Max Pieces by making fewer, larger pieces. */
const PHYSICS_SHATTER_FIT_TRIES = 5;

/**
 * Lloyd rounds that even out Voronoi sites before carving, so few cells have
 * short edges.
 */
const PHYSICS_SHATTER_RELAX_ROUNDS = 1;

/** Bookkeeping of a fracture before any input is cut. */
const PHYSICS_SHATTER_EMPTY_RESULT = {
  carvedVolume: 0,
  droppedVolume: 0,
  droppedPieces: 0,
  repairedPieces: 0,
  unsoundPieces: 0,
  limited: false,
} as const;

/** Running state of one fracture. */
interface PhysicsShatterRun {
  settings: PhysicsShatterSettings;
  result: PhysicsShatterResult;
  volumes: number[];
  cutters: PhysicsShatterCutter[];
  /** Share of each input's piece allowance used by this try. */
  scale: number;
}

/** Where the pieces of one input come from and what they must meet. */
interface PhysicsShatterInputRun {
  source: PhysicsShatterPieceSource;
  cutters: PhysicsShatterCutter[];
  minimum: number;
  bounds: PhysicsShatterPieceBounds;
}

/** One cell after carving: its built fragments and whether any is bad. */
interface PhysicsShatterCarvedCell {
  cell: PhysicsShatterCell;
  fragments: { brush: SolidBrush; origins: readonly number[]; suffix: string }[];
  /** Volume of fragments that could not be built. */
  failedVolume: number;
  /** Carved volume: the cell minus its fragments. */
  carvedVolume: number;
  /** Smallest bad fragment volume, or -1 when the cell is sound. */
  badVolume: number;
  /** True when a fragment is too small, too thin or broken. */
  small: boolean;
  /** The worst bad fragment with its face origins. */
  worst?: { brush: SolidBrush; origins: readonly number[] };
}

/**
 * Breaks convex brushes into convex pieces, the same for the same seed,
 * settings and inputs. Glass mode cuts seeded Voronoi cells; bricks mode cuts a
 * staggered brick bond. Inputs combine in CSG order: every later brush carves
 * the cells of the earlier ones it overlaps, so overlapping additive brushes
 * make no doubled pieces and subtractive brushes leave their holes.
 *
 * No piece is ever dropped to clean up: a cell whose piece would be too thin,
 * too small, or have a too short edge or too small face is merged into its
 * neighbours, which grow over its space, until every piece is sound. When
 * carving would make more than Max Pieces, the whole fracture is made again
 * with fewer, larger pieces.
 *
 * @param inputs Convex brushes in the modifier frame, in CSG order.
 * @param settings Fracture settings.
 * @returns Pieces and bookkeeping.
 */
export function physicsShatterFracture(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
): PhysicsShatterResult {
  const limit = Math.max(1, settings.maxPieces);
  let scale = 1;
  let result = physicsShatterFractureOnce(inputs, settings, scale);
  for (let fit = 1; fit < PHYSICS_SHATTER_FIT_TRIES && result.pieces.length > limit; fit++) {
    scale *= (limit / result.pieces.length) * 0.97;
    result = physicsShatterFractureOnce(inputs, settings, scale);
    result.limited = true;
  }
  if (result.pieces.length > limit) result.limited = true;
  result.pieces.forEach((piece: PhysicsShatterPiece, index) => (piece.index = index));
  return result;
}

/**
 * Runs one fracture with a given share of the piece allowance.
 *
 * @param inputs Inputs in CSG order.
 * @param settings Fracture settings.
 * @param scale Share of each input's allowance to use.
 * @returns Pieces and bookkeeping.
 */
function physicsShatterFractureOnce(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
  scale: number,
): PhysicsShatterResult {
  const volumes = inputs.map((input) =>
    physicsShatterInputMakesPieces(input) ? physicsShatterBrushVolume(input.brush) : 0,
  );
  const inputVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  const carvingInputs = inputs.filter((input) => !physicsShatterInputMakesPieces(input)).length;
  const result = { ...PHYSICS_SHATTER_EMPTY_RESULT, pieces: [], inputVolume, carvingInputs };
  const run: PhysicsShatterRun = { settings, result, volumes, cutters: physicsShatterCutters(inputs), scale };
  inputs.forEach((input, sourceIndex) => physicsShatterFractureInput(run, input, sourceIndex));
  return result;
}

/**
 * Fractures one input, heals its bad cells and appends its pieces.
 *
 * @param run Fracture state.
 * @param input Input brush.
 * @param sourceIndex Input index.
 */
function physicsShatterFractureInput(run: PhysicsShatterRun, input: PhysicsShatterInput, sourceIndex: number): void {
  if (!physicsShatterInputMakesPieces(input)) return;
  const isBrick = run.settings.mode === 'bricks';
  const source = { sourceBrushId: input.sourceBrushId, sourceIndex, seed: run.settings.seed, isBrick };
  const box = new THREE.Box3().setFromPoints(input.brush.vertices);
  const cutters = run.cutters.filter((cutter) => cutter.index > sourceIndex && cutter.box.intersectsBox(box));
  const bounds = physicsShatterPieceBoundsFor(
    physicsShatterPieceSize(run.settings),
    physicsShatterPieceShape(input.brush),
  );
  const job = { source, cutters, minimum: physicsShatterMinimumVolume(run.settings), bounds };
  const pattern = physicsShatterPatternOf(run, input.brush, sourceIndex, bounds);
  const carved = physicsShatterHeal(run, job, pattern);
  for (const entry of carved) physicsShatterKeepCell(run, job, entry);
}

/**
 * Carves the pattern's cells and merges bad ones into their neighbours, round
 * after round, until every cell is sound or nothing more can be merged.
 *
 * @param run Fracture state.
 * @param job Input being fractured.
 * @param pattern Pattern of the input.
 * @returns Final carved cells in cell order.
 */
function physicsShatterHeal(
  run: PhysicsShatterRun,
  job: PhysicsShatterInputRun,
  pattern: PhysicsShatterPattern,
): PhysicsShatterCarvedCell[] {
  const memo = new Map<PhysicsShatterCell, PhysicsShatterCarvedCell>();
  for (let round = 0; ; round++) {
    const carved = pattern.cells().map((cell) => {
      let entry = memo.get(cell);
      if (!entry) {
        entry = physicsShatterCarveCell(job, cell);
        memo.set(cell, entry);
      }
      return entry;
    });
    const bad = carved.filter((entry) => entry.badVolume >= 0);
    if (bad.length === 0 || round >= PHYSICS_SHATTER_REPAIR_ROUNDS) return carved;
    bad.sort((left, right) => left.badVolume - right.badVolume || left.cell.cellIndex - right.cell.cellIndex);
    const cells = bad.map((entry) => ({ cellIndex: entry.cell.cellIndex, small: entry.small, piece: entry.worst }));
    if (!pattern.repair(cells)) return carved;
    run.result.repairedPieces += bad.length;
  }
}

/**
 * Carves one cell with the later inputs and checks every fragment.
 *
 * @param job Input being fractured.
 * @param cell Cell.
 * @returns Carved cell.
 */
function physicsShatterCarveCell(job: PhysicsShatterInputRun, cell: PhysicsShatterCell): PhysicsShatterCarvedCell {
  const entry: PhysicsShatterCarvedCell = {
    cell,
    fragments: [],
    failedVolume: 0,
    carvedVolume: 0,
    badVolume: -1,
    small: false,
  };
  if (!cell.brush) {
    entry.badVolume = 0;
    entry.small = true;
    return entry;
  }
  const polytopes = job.cutters.length > 0 ? physicsShatterCarve(cell.brush, cell.origins, job.cutters) : null;
  if (!polytopes) entry.fragments.push({ brush: cell.brush, origins: cell.origins, suffix: '' });
  else {
    let after = 0;
    polytopes.forEach((polytope, index) => {
      const built = polytope.toBrush();
      const suffix = polytopes.length > 1 ? `.${index}` : '';
      if (built) {
        entry.fragments.push({ ...built, suffix });
        after += physicsShatterBrushVolume(built.brush);
      } else {
        entry.failedVolume += Math.max(0, polytope.volume());
        after += Math.max(0, polytope.volume());
        entry.badVolume = 0;
        entry.small = true;
      }
    });
    entry.carvedVolume = Math.max(0, physicsShatterBrushVolume(cell.brush) - after);
  }
  for (const fragment of entry.fragments) {
    const verdict = physicsShatterFragmentVerdict(job, fragment.brush);
    if (verdict === 'sound') continue;
    const volume = physicsShatterBrushVolume(fragment.brush);
    if (entry.badVolume < 0 || volume < entry.badVolume) entry.worst = fragment;
    entry.badVolume = entry.badVolume < 0 ? volume : Math.min(entry.badVolume, volume);
    if (verdict === 'small') entry.small = true;
  }
  return entry;
}

/**
 * Judges a fragment: sound, small (too small, too thin, bulging or invalid) or
 * edgy (only a short edge or small face).
 *
 * @param job Input being fractured.
 * @param brush Fragment.
 * @returns Verdict.
 */
function physicsShatterFragmentVerdict(job: PhysicsShatterInputRun, brush: SolidBrush): 'sound' | 'small' | 'edgy' {
  const shape = physicsShatterPieceShape(brush);
  if (!(shape.volume >= job.minimum) || shape.thickness < job.bounds.thickness) return 'small';
  if (!SolidBrushValidator.validateGenerated(brush).valid) return 'small';
  return physicsShatterPieceShapeSound(shape, job.bounds) ? 'sound' : 'edgy';
}

/**
 * Returns whether a fragment is a sound piece.
 *
 * @param job Input being fractured.
 * @param brush Fragment.
 * @returns True when it is big, thick and clean enough.
 */
function physicsShatterFragmentSound(job: PhysicsShatterInputRun, brush: SolidBrush): boolean {
  return physicsShatterFragmentVerdict(job, brush) === 'sound';
}

/**
 * Keeps the fragments of a final cell as pieces. A fragment that still fails
 * after healing is kept all the same and counted, never dropped; only a
 * fragment that cannot be built at all is lost.
 *
 * @param run Fracture state.
 * @param job Input being fractured.
 * @param entry Carved cell.
 */
function physicsShatterKeepCell(
  run: PhysicsShatterRun,
  job: PhysicsShatterInputRun,
  entry: PhysicsShatterCarvedCell,
): void {
  run.result.carvedVolume += entry.carvedVolume;
  if (entry.failedVolume > 0 || !entry.cell.brush) {
    run.result.droppedPieces++;
    run.result.droppedVolume += entry.failedVolume;
  }
  for (const fragment of entry.fragments) {
    const piece = physicsShatterPieceCreate(fragment.brush, fragment.origins, entry.cell.cellIndex, job.source, 0);
    if (!piece) {
      run.result.droppedPieces++;
      run.result.droppedVolume += physicsShatterBrushVolume(fragment.brush);
      continue;
    }
    if (!physicsShatterFragmentSound(job, fragment.brush)) run.result.unsoundPieces++;
    piece.key += fragment.suffix;
    run.result.pieces.push(piece);
  }
}

/**
 * Builds the pattern of one input.
 *
 * @param run Fracture state.
 * @param brush Input brush.
 * @param sourceIndex Input index.
 * @param bounds Piece bounds of the input.
 * @returns Pattern.
 */
function physicsShatterPatternOf(
  run: PhysicsShatterRun,
  brush: SolidBrush,
  sourceIndex: number,
  bounds: PhysicsShatterPieceBounds,
): PhysicsShatterPattern {
  const { settings } = run;
  const share = physicsShatterPieceShare(run, sourceIndex);
  if (settings.mode === 'bricks') {
    const bricks = new PhysicsShatterBrickPattern(brush, settings, sourceIndex, share, bounds.thickness);
    if (bricks.limited) run.result.limited = true;
    return bricks;
  }
  const volume = run.volumes[sourceIndex] ?? 0;
  const wanted = Math.round(volume / Math.pow(Math.max(1e-3, settings.crackSize), 3));
  if (wanted > share) run.result.limited = true;
  const count = Math.max(1, Math.floor(Math.min(share, wanted) * Math.min(1, run.scale)));
  const sites = physicsShatterSites(brush, count, settings, sourceIndex);
  const pattern = new PhysicsShatterVoronoiPattern(brush, sites, PHYSICS_SHATTER_METRIC_EUCLIDEAN);
  pattern.relax(PHYSICS_SHATTER_RELAX_ROUNDS);
  return pattern;
}

/**
 * Splits Max Pieces between the inputs by volume, at least one each.
 *
 * @param run Fracture state.
 * @param sourceIndex Input index.
 * @returns Piece allowance of the input.
 */
function physicsShatterPieceShare(run: PhysicsShatterRun, sourceIndex: number): number {
  const volume = run.volumes[sourceIndex] ?? 0;
  const total = run.result.inputVolume;
  const fraction = total > 0 ? volume / total : 1 / Math.max(1, run.volumes.length);
  return Math.max(1, Math.floor(Math.max(1, run.settings.maxPieces) * fraction * Math.min(1, run.scale)));
}

/**
 * Returns the pattern's typical piece size: the crack size, or the smaller
 * brick side.
 *
 * @param settings Fracture settings.
 * @returns Size in metres.
 */
export function physicsShatterPieceSize(settings: PhysicsShatterSettings): number {
  return settings.mode === 'bricks' ? Math.min(settings.brickLength, settings.brickHeight) : settings.crackSize;
}

/**
 * Returns the smallest piece volume kept for the settings.
 *
 * @param settings Fracture settings.
 * @returns Minimum volume in cubic metres.
 */
function physicsShatterMinimumVolume(settings: PhysicsShatterSettings): number {
  const typical =
    settings.mode === 'bricks'
      ? settings.brickLength * settings.brickHeight * settings.brickHeight
      : Math.pow(settings.crackSize, 3);
  return Math.max(PHYSICS_SHATTER_MIN_PIECE_VOLUME, PHYSICS_SHATTER_MIN_PIECE_SHARE * typical);
}
