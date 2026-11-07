import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { MODIFIER_VOLUME_BLACKLIST_KEY } from '@/modifier/volume/modifier_volume_blacklist.js';
import { MODIFIER_BEVEL_OPTIONS_KEY } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { modifierBevelCreateStandIn } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackBevelProxy } from '@/modifier/stack/evaluate/modifier_stack_bevel_proxy.js';
import { modifierStackBevelShapeValid } from '@/modifier/stack/evaluate/modifier_stack_validity.js';

/** Feedback when a bevel would turn a copy into an invalid brush. */
export const MODIFIER_STACK_BEVEL_REJECTED = 'Some copies were kept unbevelled because their bevel would be invalid.';

/**
 * Chamfers or rounds every convex edge of the input that lies inside the
 * volume. Authored brushes touched by several bevel modifiers are chamfered
 * once with all of them; derived brushes are chamfered by this step alone.
 */
export class ModifierStackKindBevel extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_BEVEL;
  readonly label = 'Bevel';
  readonly category: ModifierStackCategory = 'shape';
  readonly description = 'Chamfers or rounds convex edges inside the volume, with full UV and trim control.';
  readonly fields: readonly ModifierStackField[] = [];

  /**
   * Normalizes bevel settings through the bevel settings codec.
   *
   * @param input Stored parameters.
   * @returns Complete bevel settings record.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const carrier = new THREE.Object3D();
    carrier.userData = { ...input };
    ModifierVolumeBevel.writeSettings(carrier, ModifierVolumeBevel.readSettings(carrier));
    delete carrier.userData[MODIFIER_VOLUME_BLACKLIST_KEY];
    return carrier.userData;
  }

  /**
   * Starts new bevels with overlap clamping on, like Blender; older saves keep
   * the value they stored.
   *
   * @returns New-modifier parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { [MODIFIER_BEVEL_OPTIONS_KEY]: { clampOverlap: true } };
  }

  /**
   * Returns the width and segment summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const carrier = new THREE.Object3D();
    carrier.userData = { ...parameters };
    const settings = ModifierVolumeBevel.readSettings(carrier);
    const unit = settings.options?.widthMode === 'percent' ? '%' : ' m';
    return `${settings.distance}${unit} · ${settings.segments} seg`;
  }

  /**
   * Chamfers every brush of the working set.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Units whose brushes are replaced by chamfered stand-ins.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const proxy = modifierStackBevelProxy(context.volume, context.step);
    return units.map((unit) => ({
      ...unit,
      brushes: unit.brushes.map((brush) =>
        unit.authored && !unit.reshaped ? context.authoredBevel(brush) : this.bevelDerived(brush, proxy, context),
      ),
    }));
  }

  /**
   * Chamfers one derived brush with this step's proxy.
   *
   * @param brush Derived brush.
   * @param proxy Step proxy volume.
   * @param context Evaluation context.
   * @returns Stand-in, or the brush when no edge lies inside the volume.
   */
  private bevelDerived(
    brush: SolidBrushInstance,
    proxy: THREE.Object3D,
    context: ModifierStackContext,
  ): SolidBrushInstance {
    const result = modifierBevelDerivedFromCache(brush, [proxy]);
    if (!result) return brush;
    if (!modifierStackBevelShapeValid(result.derived)) return this.bevelRejected(brush, context);
    context.records.bevelSet(brush.id, { derived: result.derived, presentation: brush });
    return modifierBevelCreateStandIn(brush, result.derived);
  }

  /**
   * Keeps a copy unbevelled because its bevel would be an invalid brush, and
   * says so in the step's feedback.
   *
   * @param brush Copy that stays as it is.
   * @param context Evaluation context.
   * @returns The unchanged copy.
   */
  private bevelRejected(brush: SolidBrushInstance, context: ModifierStackContext): SolidBrushInstance {
    if (!context.report.error.includes(MODIFIER_STACK_BEVEL_REJECTED))
      context.report.error = `${context.report.error} ${MODIFIER_STACK_BEVEL_REJECTED}`.trim();
    return brush;
  }
}
