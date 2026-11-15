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
import { physicsShatterPieceCreate } from './physics_shatter_piece.js';

/** Smallest kept piece, as a share of one typical piece's volume. */
const PHYSICS_SHATTER_MIN_PIECE_SHARE = 1e-3;

/** Smallest kept piece in cubic metres, whatever the settings. */
const PHYSICS_SHATTER_MIN_PIECE_VOLUME = 1e-7;

/** Running state of one fracture. */
interface PhysicsShatterRun {
  settings: PhysicsShatterSettings;
  result: PhysicsShatterResult;
  volumes: number[];
}

/**
 * Breaks convex brushes into convex pieces, the same for the same seed,
 * settings and inputs. Glass mode cuts seeded Voronoi cells; bricks mode cuts a
 * staggered brick bond. Slivers below a minimum volume are dropped and
 * counted.
 *
 * @param inputs Convex brushes in the modifier frame, in a stable order.
 * @param settings Fracture settings.
 * @returns Pieces and bookkeeping.
 */
export function physicsShatterFracture(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
): PhysicsShatterResult {
  const volumes = inputs.map((input) => physicsShatterBrushVolume(input.brush));
  const inputVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  const result = { pieces: [], inputVolume, droppedVolume: 0, droppedPieces: 0, limited: false };
  const run: PhysicsShatterRun = { settings, result, volumes };
  inputs.forEach((input, sourceIndex) => physicsShatterFractureInput(run, input, sourceIndex));
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
  const share = physicsShatterPieceShare(run, sourceIndex);
  const cells = physicsShatterCellsOf(run, input.brush, sourceIndex, share);
  const isBrick = run.settings.mode === 'bricks';
  const source = { sourceBrushId: input.sourceBrushId, sourceIndex, seed: run.settings.seed, isBrick };
  const minimum = physicsShatterMinimumVolume(run.settings);
  for (const cell of cells) {
    const piece = cell.brush
      ? physicsShatterPieceCreate(cell.brush, cell.origins, cell.cellIndex, source, minimum)
      : null;
    if (piece) run.result.pieces.push(piece);
    else physicsShatterDrop(run, cell.brush);
  }
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
