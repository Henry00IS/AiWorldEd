import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterPiece,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from './physics_shatter_types.js';
import { physicsShatterBrushVolume } from './physics_shatter_geometry.js';
import { physicsShatterSites } from './physics_shatter_sites.js';
import { physicsShatterVoronoiCells, type PhysicsShatterCell } from './physics_shatter_voronoi.js';
import { physicsShatterBrickCells } from './physics_shatter_bricks.js';
import { physicsShatterPieceCreate, type PhysicsShatterPieceSource } from './physics_shatter_piece.js';
import {
  physicsShatterCarve,
  physicsShatterCutters,
  physicsShatterInputMakesPieces,
  type PhysicsShatterCutter,
} from './physics_shatter_carve.js';

/** Smallest kept piece, as a share of one typical piece's volume. */
const PHYSICS_SHATTER_MIN_PIECE_SHARE = 1e-3;

/** Smallest kept piece in cubic metres, whatever the settings. */
const PHYSICS_SHATTER_MIN_PIECE_VOLUME = 1e-7;

/** Bookkeeping of a fracture before any input is cut. */
const PHYSICS_SHATTER_EMPTY_RESULT = {
  carvedVolume: 0,
  droppedVolume: 0,
  droppedPieces: 0,
  limited: false,
} as const;

/** Running state of one fracture. */
interface PhysicsShatterRun {
  settings: PhysicsShatterSettings;
  result: PhysicsShatterResult;
  volumes: number[];
  cutters: PhysicsShatterCutter[];
}

/** Where the pieces of one input come from. */
interface PhysicsShatterInputRun {
  source: PhysicsShatterPieceSource;
  cutters: PhysicsShatterCutter[];
  minimum: number;
}

/**
 * Breaks convex brushes into convex pieces, the same for the same seed,
 * settings and inputs. Glass mode cuts seeded Voronoi cells; bricks mode cuts a
 * staggered brick bond. Inputs combine in CSG order: every later brush carves
 * the cells of the earlier ones it overlaps, so overlapping additive brushes
 * make no doubled pieces and subtractive brushes leave their holes. Slivers
 * below a minimum volume are dropped and counted.
 *
 * @param inputs Convex brushes in the modifier frame, in CSG order.
 * @param settings Fracture settings.
 * @returns Pieces and bookkeeping.
 */
export function physicsShatterFracture(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
): PhysicsShatterResult {
  const volumes = inputs.map((input) =>
    physicsShatterInputMakesPieces(input) ? physicsShatterBrushVolume(input.brush) : 0,
  );
  const inputVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  const carvingInputs = inputs.filter((input) => !physicsShatterInputMakesPieces(input)).length;
  const result = { ...PHYSICS_SHATTER_EMPTY_RESULT, pieces: [], inputVolume, carvingInputs };
  const run: PhysicsShatterRun = { settings, result, volumes, cutters: physicsShatterCutters(inputs) };
  inputs.forEach((input, sourceIndex) => physicsShatterFractureInput(run, input, sourceIndex));
  physicsShatterLimitPieces(run);
  result.pieces.forEach((piece: PhysicsShatterPiece, index) => (piece.index = index));
  return result;
}

/**
 * Fractures one input and appends its pieces.
 *
 * @param run Fracture state.
 * @param input Input brush.
 * @param sourceIndex Input index.
 */
function physicsShatterFractureInput(run: PhysicsShatterRun, input: PhysicsShatterInput, sourceIndex: number): void {
  if (!physicsShatterInputMakesPieces(input)) return;
  const share = physicsShatterPieceShare(run, sourceIndex);
  const cells = physicsShatterCellsOf(run, input.brush, sourceIndex, share);
  const isBrick = run.settings.mode === 'bricks';
  const source = { sourceBrushId: input.sourceBrushId, sourceIndex, seed: run.settings.seed, isBrick };
  const box = new THREE.Box3().setFromPoints(input.brush.vertices);
  const cutters = run.cutters.filter((cutter) => cutter.index > sourceIndex && cutter.box.intersectsBox(box));
  const job = { source, cutters, minimum: physicsShatterMinimumVolume(run.settings) };
  for (const cell of cells) {
    if (cell.brush) physicsShatterCellPieces(run, job, cell.brush, cell);
    else physicsShatterDrop(run, null);
  }
}

/**
 * Carves one cell with the later inputs and keeps its fragments as pieces. A
 * fragment's key gets a suffix only when the cell broke into several.
 *
 * @param run Fracture state.
 * @param job Input being fractured.
 * @param brush Cell geometry.
 * @param cell Cell with its index and face origins.
 */
function physicsShatterCellPieces(
  run: PhysicsShatterRun,
  job: PhysicsShatterInputRun,
  brush: SolidBrush,
  cell: PhysicsShatterCell,
): void {
  const fragments = job.cutters.length > 0 ? physicsShatterCarve(brush, cell.origins, job.cutters) : null;
  if (!fragments) return physicsShatterKeep(run, job, { brush, origins: cell.origins }, cell.cellIndex, '');
  const before = physicsShatterBrushVolume(brush);
  let after = 0;
  fragments.forEach((fragment, index) => {
    const built = fragment.toBrush();
    after += built ? physicsShatterBrushVolume(built.brush) : Math.max(0, fragment.volume());
    const suffix = fragments.length > 1 ? `.${index}` : '';
    if (built) physicsShatterKeep(run, job, built, cell.cellIndex, suffix);
    else physicsShatterDropVolume(run, fragment.volume());
  });
  run.result.carvedVolume += Math.max(0, before - after);
}

/**
 * Keeps a cell or fragment as a piece, or drops it as a sliver.
 *
 * @param run Fracture state.
 * @param job Input being fractured.
 * @param built Geometry with its face origins.
 * @param cellIndex Site or brick index.
 * @param suffix Key suffix of a fragment.
 */
function physicsShatterKeep(
  run: PhysicsShatterRun,
  job: PhysicsShatterInputRun,
  built: { brush: SolidBrush; origins: readonly number[] },
  cellIndex: number,
  suffix: string,
): void {
  const piece = physicsShatterPieceCreate(built.brush, built.origins, cellIndex, job.source, job.minimum);
  if (!piece) return physicsShatterDrop(run, built.brush);
  piece.key += suffix;
  run.result.pieces.push(piece);
}

/**
 * Keeps at most Max Pieces pieces; carving can split cells beyond it.
 *
 * @param run Fracture state.
 */
function physicsShatterLimitPieces(run: PhysicsShatterRun): void {
  const limit = Math.max(1, run.settings.maxPieces);
  if (run.result.pieces.length <= limit) return;
  run.result.pieces.length = limit;
  run.result.limited = true;
}

/**
 * Cuts one input with the chosen pattern.
 *
 * @param run Fracture state.
 * @param brush Input brush.
 * @param sourceIndex Input index.
 * @param share Most pieces this input may make.
 * @returns Cells in deterministic order.
 */
function physicsShatterCellsOf(
  run: PhysicsShatterRun,
  brush: SolidBrush,
  sourceIndex: number,
  share: number,
): PhysicsShatterCell[] {
  const { settings } = run;
  if (settings.mode === 'bricks') return physicsShatterBrickCellsLimited(run, brush, sourceIndex, share);
  const volume = run.volumes[sourceIndex] ?? 0;
  const wanted = Math.round(volume / Math.pow(Math.max(1e-3, settings.crackSize), 3));
  if (wanted > share) run.result.limited = true;
  const sites = physicsShatterSites(brush, Math.max(1, Math.min(share, wanted)), settings, sourceIndex);
  return physicsShatterVoronoiCells(brush, sites);
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
  return Math.max(1, Math.floor(Math.max(1, run.settings.maxPieces) * fraction));
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

/**
 * Counts a refused cell.
 *
 * @param run Fracture state.
 * @param brush Refused geometry, or null when the cut failed.
 */
function physicsShatterDrop(run: PhysicsShatterRun, brush: SolidBrush | null): void {
  run.result.droppedPieces++;
  if (brush) run.result.droppedVolume += physicsShatterBrushVolume(brush);
}

/**
 * Counts a fragment that collapsed when welded, by its own volume.
 *
 * @param run Fracture state.
 * @param volume Fragment volume.
 */
function physicsShatterDropVolume(run: PhysicsShatterRun, volume: number): void {
  run.result.droppedPieces++;
  run.result.droppedVolume += Math.max(0, volume);
}

/**
 * Cuts one input into bricks, keeping at most its share and flagging the result
 * as limited when more bricks would fit.
 *
 * @param run Fracture state.
 * @param brush Input brush.
 * @param sourceIndex Input index.
 * @param share Most pieces this input may make.
 * @returns Brick cells, bottom row first.
 */
function physicsShatterBrickCellsLimited(
  run: PhysicsShatterRun,
  brush: SolidBrush,
  sourceIndex: number,
  share: number,
): PhysicsShatterCell[] {
  const cells = physicsShatterBrickCells(brush, run.settings, sourceIndex, share + 1);
  if (cells.length > share) run.result.limited = true;
  return cells.slice(0, share);
}
