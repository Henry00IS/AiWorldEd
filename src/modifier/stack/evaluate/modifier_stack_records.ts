import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** Bevel result of one derived brush and the brush its surfaces resolve from. */
export interface ModifierStackBevelRecord {
  /** Chamfer records keyed by derived face index. */
  derived: ModifierBevelDerivedBrush;
  /** Unchamfered input whose faces the derived faces inherit from. */
  presentation: SolidBrushInstance;
}

/**
 * Collects presentation data produced while evaluating stacks for one solid:
 * which brush resolves the surfaces of each derived id, and which bevel records
 * shade it.
 */
export class ModifierStackRecords {
  private readonly bevels = new Map<string, ModifierStackBevelRecord>();
  private readonly normals = new Map<string, ModifierBevelDerivedBrush>();
  private readonly derivedBrushes = new Map<string, SolidBrushInstance>();

  /**
   * Remembers a chamfered derived brush.
   *
   * @param id Derived brush id.
   * @param record Bevel result and its unchamfered input.
   */
  bevelSet(id: string, record: ModifierStackBevelRecord): void {
    this.bevels.set(id, record);
    this.normals.delete(id);
  }

  /**
   * Returns the bevel result of a derived brush.
   *
   * @param id Derived brush id.
   * @returns Record, or undefined when the brush was not chamfered.
   */
  bevelGet(id: string): ModifierStackBevelRecord | undefined {
    return this.bevels.get(id);
  }

  /**
   * Remembers that a copy carries the smooth-strip shading of its source.
   *
   * @param copyId Copy id.
   * @param sourceId Source id whose chamfer the copy repeats.
   */
  normalsInherit(copyId: string, sourceId: string): void {
    const derived = this.bevels.get(sourceId)?.derived ?? this.normals.get(sourceId);
    if (derived) this.normals.set(copyId, derived);
  }

  /**
   * Returns every inherited shading record.
   *
   * @returns Map from copy id to the chamfer it repeats.
   */
  normalsAll(): ReadonlyMap<string, ModifierBevelDerivedBrush> {
    return this.normals;
  }

  /**
   * Returns every chamfered derived brush.
   *
   * @returns Map from derived id to its bevel record.
   */
  bevelsAll(): ReadonlyMap<string, ModifierStackBevelRecord> {
    return this.bevels;
  }

  /**
   * Remembers the brush that resolves surfaces for a derived id.
   *
   * @param brush Final derived brush.
   */
  derivedAdd(brush: SolidBrushInstance): void {
    this.derivedBrushes.set(brush.id, this.bevels.get(brush.id)?.presentation ?? brush);
  }

  /**
   * Returns the presentation brush of every derived id.
   *
   * @returns Map from derived id to the brush that resolves its surfaces.
   */
  derivedAll(): ReadonlyMap<string, SolidBrushInstance> {
    return this.derivedBrushes;
  }
}
