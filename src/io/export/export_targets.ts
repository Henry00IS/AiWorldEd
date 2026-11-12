import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type {
  BuiltInCoordinateSpaceId,
  CoordinateSpaceDefinition,
} from '@/settings/coordinate/coordinate_space_types.js';
import type { ExportSpace, MetricUnit } from '@/io/coordinates/export_space.js';

/** A program models are exported for: its axes and units. */
export interface ExportTarget {
  /** Target id ("godot", …), also the id of its coordinate space preset. */
  id: BuiltInCoordinateSpaceId;
  label: string;
  space: ExportSpace;
  /**
   * Axes and unit of OBJ files for the program. OBJ files name no axes, so a
   * program that converts them on import from axes other than its own (Blender
   * reads them +Y up) gets them in those axes; otherwise the same as `space`.
   */
  objSpace: ExportSpace;
}

/** Axes of a coordinate space, without its preset id. */
type ExportTargetAxes = Pick<CoordinateSpaceDefinition, 'up' | 'right' | 'forward'>;

/** Id of the default target. */
export const EXPORT_TARGET_DEFAULT_ID = 'godot';

/**
 * Targets: id, label, length unit and the axes the program's OBJ importer reads
 * by default when they differ from its own; the axes are the preset of the same
 * id. Blender's OBJ importer and exporter default to Forward Axis -Z and Up
 * Axis Y: the model's top is file +Y, its front file +Z and its right file -X.
 */
const EXPORT_TARGETS: readonly {
  id: BuiltInCoordinateSpaceId;
  label: string;
  unit: MetricUnit;
  objAxes?: ExportTargetAxes;
}[] = [
  { id: 'godot', label: 'Godot (Default)', unit: 'meter' },
  { id: 'unity', label: 'Unity', unit: 'meter' },
  { id: 'blender', label: 'Blender', unit: 'meter', objAxes: { up: '+y', right: '-x', forward: '+z' } },
  { id: 'unreal', label: 'Unreal Engine', unit: 'centimeter' },
];

/**
 * Lists the export targets.
 *
 * @returns Targets in menu order.
 */
export function exportTargetList(): ExportTarget[] {
  return EXPORT_TARGETS.map((entry) => {
    const coordinateSpace = getBuiltInCoordinateSpace(entry.id)!;
    return {
      id: entry.id,
      label: entry.label,
      space: { coordinateSpace, metricUnit: entry.unit },
      objSpace: { coordinateSpace: { ...coordinateSpace, ...entry.objAxes }, metricUnit: entry.unit },
    };
  });
}

/**
 * Finds a target by id, falling back to the default target.
 *
 * @param id Target id.
 * @returns Target.
 */
export function exportTargetFind(id: string): ExportTarget {
  const targets = exportTargetList();
  return targets.find((target) => target.id === id) ?? targets[0]!;
}
