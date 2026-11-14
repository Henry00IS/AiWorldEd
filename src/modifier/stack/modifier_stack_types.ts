import type { CurvePreset } from '@/curve/model/curve_preset.js';
import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** Scalar value stored by a field-based modifier. */
export type ModifierStackValue = number | string | boolean;

/** Special purpose of a stack node; plain volumes have none. */
export type ModifierStackRole = 'generator' | 'decal';

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
  /**
   * 'generator' marks a standalone generator node: its first modifier builds
   * pieces in its box, it captures nothing, and volumes still affect it.
   * 'decal' marks a decal projector: its first modifier projects an image onto
   * the surfaces in its box; it captures nothing and never shapes solids.
   */
  role?: ModifierStackRole;
}

/** One labeled choice of a choice field. */
export interface ModifierStackChoice {
  /** Stored value. */
  value: string;
  /** Visible label. */
  label: string;
  /** Hover text explaining the choice, shown on the option and the select. */
  title?: string;
}

/** Declarative inspector property of a field-based modifier. */
export interface ModifierStackField {
  /** Parameter key. */
  key: string;
  /** Visible caption. */
  label: string;
  /** Editor type. */
  type: 'number' | 'choice' | 'boolean' | 'object' | 'curve' | 'texture';
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
  /** Presets a curve field's editor offers. */
  curvePresets?: readonly CurvePreset[];
  /** True shows Base and Top marker toggles beside a curve field's preview. */
  curveMarkers?: boolean;
  /**
   * Makes a number field edit the fixed Base or Top height stored in a curve
   * field; its own stored value only applies to curves without one.
   */
  curveHeight?: { curve: string; side: 'bottom' | 'top' };
  /** Returns whether the field applies to the current parameters. */
  visible?: (parameters: Record<string, unknown>) => boolean;
  /** True keeps the value stored but never shows a row for it. */
  hidden?: boolean;
}

/** A named set of parameters a modifier's inspector offers to apply at once. */
export interface ModifierStackPreset {
  /** Stable id. */
  id: string;
  /** Menu label. */
  label: string;
  /** Hover help: what the preset builds and where it fits. */
  tooltip: string;
  /** Optional picker group. */
  group?: string;
  /**
   * Parameters the preset sets; keys other presets set fall back to their
   * defaults.
   */
  parameters: Readonly<Record<string, ModifierStackValue>>;
}

/** A connected set of brushes that moves and copies as one operand. */
export interface ModifierStackUnit {
  /** Hierarchy node placed in the compile tree: a brush mesh or a group. */
  tree: THREE.Object3D;
  /** Brush instances under the tree, in evaluation order. */
  brushes: SolidBrushInstance[];
  /** True while the unit is the authored scene operand itself. */
  authored: boolean;
  /**
   * True when a modifier changed the shape of the authored brushes, whose
   * brushes are then stand-ins that replace them in the CSG.
   */
  reshaped?: boolean | undefined;
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
