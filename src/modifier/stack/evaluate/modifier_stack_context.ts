import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type {
  ModifierStackEntry,
  ModifierStackStepReport,
  ModifierStackUnit,
} from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackBudget } from './modifier_stack_budget.js';
import type { ModifierStackRecords } from './modifier_stack_records.js';

/** Everything one modifier needs while it evaluates inside one volume. */
export interface ModifierStackContext {
  /** Scene modifier volume that owns the stack. */
  volume: THREE.Object3D;
  /** Modifier being evaluated. */
  step: ModifierStackEntry;
  /** Authored solid model root. */
  solidRoot: THREE.Object3D;
  /** Group whose world matrix equals the solid root's; derived nodes live here. */
  staging: THREE.Object3D;
  /** Shared derived-brush allowance. */
  budget: ModifierStackBudget;
  /** True when this solid receives brushes that generators create. */
  ownsGenerated: boolean;
  /** Returns the jointly chamfered stand-in of an authored brush, or the brush. */
  authoredBevel: (brush: SolidBrushInstance) => SolidBrushInstance;
  /** Cap pieces the stack names, by object id; missing caps are absent. */
  caps: ReadonlyMap<string, ModifierStackUnit>;
  /** Presentation data collected for this solid. */
  records: ModifierStackRecords;
  /** Status written by the modifier. */
  report: ModifierStackStepReport;
}
