import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { VMF_INCHES_TO_METERS } from './vmf_coordinates.js';
import { VmfBrushFromSides, VmfBuiltBrush } from './vmf_brush_from_sides.js';
import { isSkippedVolumeMaterial } from './policy_vmf_material.js';
import { VmfParser } from './vmf_parser.js';
import { VmfEntity, VmfSolid, VmfWorld } from './vmf_types.js';
import { forBatchesAsync, yieldToBrowser } from '@/utils/async_yield.js';

/** Options controlling VMF → solid model import. */
export interface VmfImportOptions {
  /** Inches to meters (default 1/32). */
  unitScale?: number;
  /** Display name for the solid model root. */
  modelName?: string;
  /** When true, also import brush entities (func_detail, etc.). */
  includeEntitySolids?: boolean;
  /** When true, skip tools volume brushes (triggers, skip, etc.). */
  skipVolumeMaterials?: boolean;
  /**
   * When true (default), recompiles the solid CSG result after import. Disable
   * for very large maps and call model.rebuild() when ready.
   */
  rebuild?: boolean;
  /**
   * Optional progress callback (0..1, status label). Used by async import so
   * the browser can paint a progress bar between batches.
   */
  onProgress?: (ratio: number, label: string) => void;
  /** Async import: runs once every brush is in place, before the CSG rebuild. */
  beforeRebuild?: ((model: SolidModel) => void) | undefined;
}

/** Summary of a completed VMF import. */
export interface VmfImportResult {
  /** Solid model containing all imported brushes. */
  model: SolidModel;
  /** Number of VMF solids successfully converted. */
  importedBrushCount: number;
  /** Number of solids skipped (tools volumes or build failures). */
  skippedBrushCount: number;
  /** Parsed skybox material name when present. */
  skyName: string;
}

/** Entity classnames that never contribute geometry to the solid model. */
const SKIPPED_ENTITY_CLASSNAMES = new Set([
  'func_areaportal',
  'func_areaportalwindow',
  'func_capturezone',
  'func_changeclass',
  'func_combine_ball_spawner',
  'func_dustcloud',
  'func_dustmotes',
  'func_nobuild',
  'func_nogrenades',
  'func_occluder',
  'func_precipitation',
  'func_proprespawnzone',
  'func_regenerate',
  'func_respawnroom',
  'func_smokevolume',
  'func_viscluster',
]);

/** Imports Source Engine 2006 VMF maps into a solid model of convex brushes. */
export class VmfSolidImporter {
  private readonly parser = new VmfParser();
  private readonly brushBuilder = new VmfBrushFromSides();

  /**
   * Parses VMF text and builds a solid model with all importable brushes.
   *
   * @param source VMF file contents.
   * @param options Import options.
   * @returns Import result with model and counts.
   */
  importFromText(source: string, options: VmfImportOptions = {}): VmfImportResult {
    const world = this.parser.parse(source);
    return this.importWorld(world, options);
  }

  /**
   * Async import that yields between brush batches and CSG rebuild so the UI
   * can update a progress bar without freezing the browser.
   *
   * @param source VMF file contents.
   * @param options Import options (including onProgress).
   * @returns Import result with model and counts.
   */
  async importFromTextAsync(source: string, options: VmfImportOptions = {}): Promise<VmfImportResult> {
    const report = options.onProgress ?? (() => undefined);
    report(0.02, 'Parsing VMF…');
    await yieldToBrowser();
    const world = this.parser.parse(source);
    report(0.08, 'Collecting solids…');
    await yieldToBrowser();
    return this.importWorldAsync(world, options);
  }

  /**
   * Builds a solid model from an already-parsed VMF world.
   *
   * @param world Parsed world document.
   * @param options Import options.
   * @returns Import result with model and counts.
   */
  importWorld(world: VmfWorld, options: VmfImportOptions = {}): VmfImportResult {
    const unitScale = options.unitScale ?? VMF_INCHES_TO_METERS;
    const skipVolumes = options.skipVolumeMaterials !== false;
    const includeEntities = options.includeEntitySolids !== false;
    const model = new SolidModel(options.modelName ?? this.defaultModelName(world));
    const collected = this.collectSolids(world, includeEntities);
    const built = this.buildAllInstances(collected.solids, unitScale, skipVolumes, collected.skippedCount);
    model.addBrushInstancesBatch(built.instances, 2, options.rebuild !== false);
    return {
      model,
      importedBrushCount: built.imported,
      skippedBrushCount: built.skipped,
      skyName: world.skyName,
    };
  }

  /**
   * Async world import with batched brush construction and progressive CSG.
   *
   * @param world Parsed world document.
   * @param options Import options.
   * @returns Import result with model and counts.
   */
  async importWorldAsync(world: VmfWorld, options: VmfImportOptions = {}): Promise<VmfImportResult> {
    const report = options.onProgress ?? (() => undefined);
    const unitScale = options.unitScale ?? VMF_INCHES_TO_METERS;
    const skipVolumes = options.skipVolumeMaterials !== false;
    const includeEntities = options.includeEntitySolids !== false;
    const model = new SolidModel(options.modelName ?? this.defaultModelName(world));
    const collected = this.collectSolids(world, includeEntities);
    const built = await this.buildAllInstancesAsync(
      collected.solids,
      unitScale,
      skipVolumes,
      collected.skippedCount,
      (ratio, label) => report(0.08 + ratio * 0.52, label),
    );
    model.addBrushInstancesBatch(built.instances, 2, false);
    options.beforeRebuild?.(model);
    if (options.rebuild !== false && built.instances.length > 0) {
      await model.rebuildAsync((ratio, label) => report(0.6 + ratio * 0.4, label));
    } else {
      report(1, 'Done');
    }
    return {
      model,
      importedBrushCount: built.imported,
      skippedBrushCount: built.skipped,
      skyName: world.skyName,
    };
  }

  /**
   * Converts every collected solid into brush instances.
   *
   * @param solids Solids to attempt.
   * @param unitScale Unit scale.
   * @param skipVolumes Whether tools volumes are skipped.
   * @param alreadySkipped Solids already skipped by entity policy.
   * @returns Instances and import counters.
   */
  private buildAllInstances(
    solids: VmfSolid[],
    unitScale: number,
    skipVolumes: boolean,
    alreadySkipped: number,
  ): {
    instances: SolidBrushInstance[];
    imported: number;
    skipped: number;
  } {
    const instances: SolidBrushInstance[] = [];
    let imported = 0;
    let skipped = alreadySkipped;
    for (const solid of solids) {
      const built = this.tryBuildSolid(solid, unitScale, skipVolumes);
      if (!built) {
        skipped += 1;
        continue;
      }
      instances.push(this.createInstance(built, imported + 1));
      imported += 1;
    }
    return { instances, imported, skipped };
  }

  /**
   * Converts solids in batches, yielding so the UI can paint progress.
   *
   * @param solids Solids to attempt.
   * @param unitScale Unit scale.
   * @param skipVolumes Whether tools volumes are skipped.
   * @param alreadySkipped Solids already skipped by entity policy.
   * @param onProgress Progress for the build phase (0..1, label).
   * @returns Instances and import counters.
   */
  private async buildAllInstancesAsync(
    solids: VmfSolid[],
    unitScale: number,
    skipVolumes: boolean,
    alreadySkipped: number,
    onProgress?: (ratio: number, label: string) => void,
  ): Promise<{
    instances: SolidBrushInstance[];
    imported: number;
    skipped: number;
  }> {
    const instances: SolidBrushInstance[] = [];
    let imported = 0;
    let skipped = alreadySkipped;
    const total = Math.max(1, solids.length);
    await forBatchesAsync(
      solids.length,
      16,
      (start, end) => {
        for (let index = start; index < end; index++) {
          const solid = solids[index];
          if (!solid) {
            skipped += 1;
            continue;
          }
          const built = this.tryBuildSolid(solid, unitScale, skipVolumes);
          if (!built) {
            skipped += 1;
            continue;
          }
          instances.push(this.createInstance(built, imported + 1));
          imported += 1;
        }
      },
      (ratio) =>
        onProgress?.(ratio, `Building brushes ${Math.min(solids.length, Math.round(ratio * total))}/${solids.length}`),
    );
    return { instances, imported, skipped };
  }

  /**
   * Attempts to convert one solid, applying material skip policy.
   *
   * @param solid Source solid.
   * @param unitScale Unit scale.
   * @param skipVolumes Whether to skip tools volume materials.
   * @returns Built brush or null.
   */
  private tryBuildSolid(solid: VmfSolid, unitScale: number, skipVolumes: boolean): VmfBuiltBrush | null {
    if (solid.sides.length === 0) return null;
    const firstSide = solid.sides[0];
    if (!firstSide) return null;
    if (skipVolumes && isSkippedVolumeMaterial(firstSide.material)) {
      return null;
    }
    return this.brushBuilder.build(solid, unitScale);
  }

  /**
   * Creates a named brush instance with UV mappings from a built solid.
   *
   * @param built Built brush data.
   * @param ordinal 1-based brush index for naming.
   * @returns Solid brush instance with hull preview mesh.
   */
  private createInstance(built: VmfBuiltBrush, ordinal: number): SolidBrushInstance {
    const name = built.solidId >= 0 ? `Solid ${built.solidId}` : `Solid ${String(ordinal).padStart(2, '0')}`;
    const id = `vmf-solid-${built.solidId}-${ordinal}`;
    const instance = new SolidBrushInstance(id, name, built.brush, SolidOperation.Additive);
    instance.position.copy(built.worldCenter);
    for (let index = 0; index < built.faceMappings.length; index++) {
      const mapping = built.faceMappings[index];
      if (!mapping) continue;
      instance.setFaceMapping(index, mapping);
    }
    const preview = SolidBrushVisual.createHullPreview(name, built.brush, SolidOperation.Additive);
    instance.attachMesh(preview);
    return instance;
  }

  /**
   * Collects world solids and optional entity solids for import.
   *
   * @param world Parsed world.
   * @param includeEntities Whether entity brushwork is included.
   * @returns Solids to attempt plus count of policy-skipped entity solids.
   */
  private collectSolids(world: VmfWorld, includeEntities: boolean): { solids: VmfSolid[]; skippedCount: number } {
    const solids = world.solids.slice();
    if (!includeEntities) {
      return { solids, skippedCount: this.countAllEntitySolids(world) };
    }
    let skippedCount = 0;
    for (const entity of world.entities) {
      if (this.shouldSkipEntity(entity)) {
        skippedCount += entity.solids.length;
        continue;
      }
      for (const solid of entity.solids) {
        solids.push(solid);
      }
    }
    return { solids, skippedCount };
  }

  /**
   * Counts every solid nested under entities.
   *
   * @param world Parsed world.
   * @returns Entity solid count.
   */
  private countAllEntitySolids(world: VmfWorld): number {
    let count = 0;
    for (const entity of world.entities) {
      count += entity.solids.length;
    }
    return count;
  }

  /**
   * Returns true when the entity classname is excluded from brush import.
   *
   * @param entity Entity record.
   * @returns True when all of its solids should be ignored.
   */
  private shouldSkipEntity(entity: VmfEntity): boolean {
    return SKIPPED_ENTITY_CLASSNAMES.has(entity.className.toLowerCase());
  }

  /**
   * Builds a default solid model name from world metadata.
   *
   * @param world Parsed world.
   * @returns Display name.
   */
  private defaultModelName(world: VmfWorld): string {
    if (world.skyName.length > 0) return `VMF (${world.skyName})`;
    return 'VMF Import';
  }
}
