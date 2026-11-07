import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** Scalar value stored by a field-based modifier. */
export type ModifierStackValue = number | string | boolean;

/** One modifier in a volume's ordered stack. */
export interface ModifierStackEntry {
  /** Stable id unique inside the owning volume. */
  id: string;
  /** Installed modifier kind id. */
  kind: string;
  /** Display name shown in the modifier header. */
  name: string;
  /** False mutes the modifier, like the outliner eye. */
  enabled: boolean;
  /** True when the inspector panel is unfolded. */
  expanded: boolean;
  /** Kind-specific plain JSON settings. */
  parameters: Record<string, unknown>;
}

/** Serialized authored state of one modifier volume. Outputs are never saved. */
export interface ModifierStackSettings {
  /** Stack format version. */
  version: 2;
  /** False disables the whole volume. */
  enabled: boolean;
  /** Compound captures whole top-level groups; brush captures single brushes. */
  grouping: 'compound' | 'brush';
  /** Authored object ids the volume ignores. */
  excludedIds: string[];
  /** Modifiers evaluated exactly in this order. */
  modifiers: ModifierStackEntry[];
}

/** One labeled choice of a choice field. */
export interface ModifierStackChoice {
  /** Stored value. */
  value: string;
  /** Visible label. */
  label: string;
}

/** Declarative inspector property of a field-based modifier. */
export interface ModifierStackField {
  /** Parameter key. */
  key: string;
  /** Visible caption. */
  label: string;
  /** Editor type. */
  type: 'number' | 'choice' | 'boolean' | 'object';
  /** Value used when missing or invalid. */
  default: ModifierStackValue;
  /** Allowed values of a choice field. */
  choices?: readonly ModifierStackChoice[];
  /** Inclusive numeric minimum. */
  min?: number;
  /** Inclusive numeric maximum. */
  max?: number;
  /** True rounds numbers to whole values. */
  integer?: boolean;
  /** Arrow-key step of a number field. */
  step?: number;
  /** Subheading the field is grouped under. */
  group?: string;
  /** Hover text explaining the field. */
  hint?: string;
  /** Returns whether the field applies to the current parameters. */
  visible?: (parameters: Record<string, unknown>) => boolean;
}

/** A connected set of brushes that moves and copies as one operand. */
export interface ModifierStackUnit {
  /** Hierarchy node placed in the compile tree: a brush mesh or a group. */
  tree: THREE.Object3D;
  /** Brush instances under the tree, in evaluation order. */
  brushes: SolidBrushInstance[];
  /** True while the unit is the authored scene operand itself. */
  authored: boolean;
  /** Authored node uuid that derived units are placed after, or null. */
  origin: string | null;
  /** Where a generated unit goes in scene order: the owning volume's place. */
  slot?: ModifierStackUnitSlot | undefined;
}

/** Scene-order position of a volume inside its solid's hierarchy. */
export interface ModifierStackUnitSlot {
  /** Uuid of the volume's parent node. */
  parent: string;
  /** Uuid of the brush or group just before the volume, or null when first. */
  after: string | null;
}

/** Per-step evaluation status shown in the inspector. */
export interface ModifierStackStepReport {
  /** Brushes leaving the step. */
  outputs: number;
  /** Problem description, or empty. */
  error: string;
}
