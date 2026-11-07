import type { Box3, Matrix4 } from 'three';

/** Scalar settings remain plain JSON for history and scene files. */
export type GeneratorValue = number | string | boolean;
/** Serialized authored generator only; outputs are never saved. */
export interface GeneratorSettings {
  version: 1;
  kind: string;
  enabled: boolean;
  count: number;
  space: 'volume' | 'world';
  grouping: 'compound' | 'brush';
  uv: 'copied' | 'world';
  excludedIds: string[];
  parameters: Record<string, GeneratorValue>;
}
/** Context shared by all transform strategies. */
export interface GeneratorContext {
  settings: GeneratorSettings;
  bounds: Box3;
}
/** Declarative inspector property. */
export interface GeneratorField {
  key: string;
  label: string;
  type: 'number' | 'choice' | 'boolean';
  default: GeneratorValue;
  choices?: readonly string[];
  min?: number;
  max?: number;
  visible?: (settings: GeneratorSettings) => boolean;
}
/** Independently discoverable volume strategy. */
export interface GeneratorKind {
  id: string;
  label: string;
  fields: readonly GeneratorField[];
  count?: number;
  transform: (index: number, context: GeneratorContext) => Matrix4;
}
