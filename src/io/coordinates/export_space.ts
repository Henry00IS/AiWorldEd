import type { CoordinateSpaceDefinition } from '@/settings/coordinate/coordinate_space_types.js';

/** Metric length units a model file can be written in. */
export type MetricUnit = 'centimeter' | 'meter';

/** Axes and length unit a model file is written in. */
export interface ExportSpace {
  coordinateSpace: CoordinateSpaceDefinition;
  /** Length of one file unit. */
  metricUnit: MetricUnit;
}
