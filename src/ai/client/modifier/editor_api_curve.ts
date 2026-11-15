import { curveDecode, curveEncode, curveFromData, curveToData } from '@/curve/model/curve_codec.js';
import { curveConstrain, curveMoveHandle, curveMovePoint } from '@/curve/model/curve_constrain.js';
import {
  curveDeletePoint,
  curveFlip,
  curveInsertPoint,
  curveMirror,
  curveSegmentDetailSet,
  curveSegmentModeSet,
  curveSegmentPropertySet,
  curveSegmentSectionSet,
} from '@/curve/model/curve_edit.js';
import { curveSegmentBlendSet } from '@/curve/model/curve_blend.js';
import {
  curveMarkerHeightSet,
  curveMarkerSet,
  curveMarkerSwitch,
  type CurveMarkerSide,
} from '@/curve/model/curve_markers.js';
import {
  CURVE_SEGMENT_MODES,
  curveFromPolyline,
  type Curve,
  type CurveSegmentMode,
  type CurveSegmentSection,
} from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import {
  CURVE_SECTION_CHOICES,
  type CurveSectionParameter,
  type CurveSideChoice,
} from '@/curve/model/curve_section.js';
import {
  curveLayerCompose,
  curveLayerView,
  curveSegmentFixedDepthSet,
  curveSegmentSideSet,
  type CurveLayerKind,
} from '@/curve/model/curve_side.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackEntry, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import { failResult, okResult } from '@/ai/client/editor_api_result.js';
import { svgPathCurve } from '@/ai/client/tools/geometry/svg/svg_path_curve.js';
import type { EditorApiModifier } from './editor_api_modifier.js';
import { modifierHolderFind, type ModifierHolder } from './editor_api_modifier_lookup.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';

/** Which curve parameter of which modifier a curve tool works on. */
export interface CurveTargetArgs {
  objectId: string;
  modifierId: string;
  key: string;
  /** 'secondary' edits the -X side line of custom-sided segments. */
  layer?: string;
}

/** Segment settings curve_segment_set accepts. */
export interface CurveSegmentArgs {
  indices: number[];
  mode?: string;
  detail?: number;
  section?: string;
  side?: string;
  fixedDepth?: boolean;
  blend?: boolean;
  properties?: Partial<Record<CurveSectionParameter, number>>;
}

/** Numeric section properties a segment accepts. */
const CURVE_SECTION_PARAMETERS: readonly CurveSectionParameter[] = [
  'cornerSize',
  'cornerSides',
  'polygonSides',
  'armWidth',
  'armWidthEnd',
  'straight',
  'twist',
  'rotation',
];

/**
 * Reads and edits curve parameters (column profiles and the like) point by
 * point.
 */
export class EditorApiCurve {
  /**
   * Creates the curve part.
   *
   * @param host Injected editor systems.
   * @param modifiers Modifier part that owns stack edits.
   */
  constructor(
    private readonly host: EditorApiHost,
    private readonly modifiers: EditorApiModifier,
  ) {}

  /**
   * Returns a curve with every point, handle, segment and marker.
   *
   * @param target Curve parameter.
   * @returns Curve description.
   */
  curveGet(target: CurveTargetArgs): McpToolResult {
    const found = this.curveFind(target);
    if (typeof found === 'string') return failResult(found);
    return okResult(
      `Curve ${target.key} with ${found.curve.points.length} points`,
      this.curveDescribe(found.curve, found.field),
    );
  }

  /**
   * Lists the presets a curve parameter offers.
   *
   * @param target Curve parameter.
   * @returns Preset ids, labels, groups and hints.
   */
  presetList(target: CurveTargetArgs): McpToolResult {
    const found = this.curveFind(target);
    if (typeof found === 'string') return failResult(found);
    const presets = (found.field.curvePresets ?? []).map((preset) => ({
      id: preset.id,
      label: preset.label,
      group: preset.group ?? '',
      hint: preset.tooltip,
    }));
    return okResult(`${presets.length} preset(s)`, { presets });
  }

  /**
   * Replaces a whole curve from curve data.
   *
   * @param target Curve parameter.
   * @param data Curve data as curve_get returns it in data.
   * @returns Updated curve.
   */
  curveSet(target: CurveTargetArgs, data: unknown): McpToolResult {
    return this.curveEdit(target, () => {
      const curve = curveFromData(data);
      if (!curve)
        throw new Error(
          'curve must be {points: [[x, y, inX, inY, outX, outY], ...], segments: [[mode, detail, ...], ...]}',
        );
      return curve;
    });
  }

  /**
   * Replaces a curve line from SVG path data.
   *
   * @param target Curve parameter and layer.
   * @param path SVG path data in curve units, y up.
   * @returns Updated curve.
   */
  pathSet(target: CurveTargetArgs, path: string): McpToolResult {
    return this.layerEdit(target, (view) => {
      const line = svgPathCurve(path);
      return curveConstrain({ ...view, points: line.points, segments: line.segments });
    });
  }

  /**
   * Inserts a point on the curve at x, optionally moving it to y.
   *
   * @param target Curve parameter and layer.
   * @param x Position along the curve, 0..1.
   * @param y Optional value, 0..1.
   * @returns Updated curve.
   */
  pointAdd(target: CurveTargetArgs, x: number, y: number | undefined): McpToolResult {
    return this.layerEdit(target, (view) => {
      const inserted = curveInsertPoint(view, x);
      return y === undefined ? inserted.curve : curveMovePoint(inserted.curve, inserted.index, x, y);
    });
  }

  /**
   * Moves a point and/or its handles. Handles are absolute positions.
   *
   * @param target Curve parameter and layer.
   * @param index Point index.
   * @param move New x, y and handle positions.
   * @param move.x New x.
   * @param move.y New y.
   * @param move.handleIn Absolute position of the incoming handle.
   * @param move.handleOut Absolute position of the outgoing handle.
   * @returns Updated curve.
   */
  pointSet(
    target: CurveTargetArgs,
    index: number,
    move: { x?: number; y?: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } },
  ): McpToolResult {
    return this.layerEdit(target, (view) => {
      const point = view.points[index];
      if (!point) throw new Error(`No point ${index}; the curve has ${view.points.length} points (0-based)`);
      let curve = curveMovePoint(view, index, move.x ?? point.x, move.y ?? point.y);
      if (move.handleIn) curve = curveMoveHandle(curve, index, 'in', move.handleIn.x, move.handleIn.y);
      if (move.handleOut) curve = curveMoveHandle(curve, index, 'out', move.handleOut.x, move.handleOut.y);
      return curve;
    });
  }

  /**
   * Deletes an inner point.
   *
   * @param target Curve parameter and layer.
   * @param index Point index.
   * @returns Updated curve.
   */
  pointDelete(target: CurveTargetArgs, index: number): McpToolResult {
    return this.layerEdit(target, (view) => {
      if (index <= 0 || index >= view.points.length - 1)
        throw new Error('Only inner points can be deleted; the end points stay');
      return curveDeletePoint(view, index);
    });
  }

  /**
   * Changes bend mode, detail and cross-section settings of segments.
   *
   * @param target Curve parameter.
   * @param args Segment indices and settings.
   * @returns Updated curve.
   */
  segmentSet(target: CurveTargetArgs, args: CurveSegmentArgs): McpToolResult {
    return this.curveEdit(target, (input) => {
      const indices = this.segmentIndices(input, args.indices);
      let curve = this.segmentShapeApply(input, indices, args);
      if (args.side !== undefined)
        curve = curveSegmentSideSet(
          curve,
          indices,
          this.choice('side', args.side, ['mirror', 'negative', 'positive', 'custom']) as CurveSideChoice,
        );
      if (args.fixedDepth !== undefined) curve = curveSegmentFixedDepthSet(curve, indices, args.fixedDepth);
      if (args.blend !== undefined) curve = curveSegmentBlendSet(curve, indices, args.blend);
      for (const [property, value] of Object.entries(args.properties ?? {})) {
        if (!CURVE_SECTION_PARAMETERS.includes(property as CurveSectionParameter))
          throw new Error(`Unknown section property ${property}. Properties: ${CURVE_SECTION_PARAMETERS.join(', ')}`);
        curve = curveSegmentPropertySet(curve, indices, property as CurveSectionParameter, Number(value));
      }
      return curve;
    });
  }

  /**
   * Applies one of the curve parameter's presets.
   *
   * @param target Curve parameter.
   * @param presetId Preset id from curve_preset_list.
   * @returns Updated curve.
   */
  presetApply(target: CurveTargetArgs, presetId: string): McpToolResult {
    return this.curveEdit(target, (_curve, field) => {
      const preset = field.curvePresets?.find((candidate) => candidate.id === presetId);
      if (!preset) throw new Error(`No preset ${presetId}; call curve_preset_list`);
      return curvePresetBuild(preset);
    });
  }

  /**
   * Switches, moves or sizes a Base or Top marker.
   *
   * @param target Curve parameter.
   * @param side 'bottom' (Base) or 'top' (Top).
   * @param change Enabled flag, x place and fixed height in metres.
   * @param change.enabled Switches the marker on or off.
   * @param change.x Place along the curve, 0..1.
   * @param change.height Fixed height in metres of the base or top part.
   * @returns Updated curve.
   */
  markerSet(
    target: CurveTargetArgs,
    side: string,
    change: { enabled?: boolean; x?: number; height?: number },
  ): McpToolResult {
    return this.curveEdit(target, (input) => {
      const marker = this.choice('side', side, ['bottom', 'top']) as CurveMarkerSide;
      let curve = change.enabled === undefined ? input : curveMarkerSwitch(input, marker, change.enabled);
      if (change.x !== undefined) curve = curveMarkerSet(curve, marker, change.x);
      if (change.height !== undefined) curve = curveMarkerHeightSet(curve, marker, change.height);
      return curve;
    });
  }

  /**
   * Mirrors the curve left to right, or flips it upside down.
   *
   * @param target Curve parameter.
   * @param flip True flips values; false mirrors positions.
   * @returns Updated curve.
   */
  curveReflect(target: CurveTargetArgs, flip: boolean): McpToolResult {
    return this.curveEdit(target, (curve) => (flip ? curveFlip(curve) : curveMirror(curve)));
  }

  /**
   * Applies mode, detail and section to segments.
   *
   * @param input Curve.
   * @param indices Segment indices.
   * @param args Requested settings.
   * @returns Curve.
   */
  private segmentShapeApply(input: Curve, indices: number[], args: CurveSegmentArgs): Curve {
    let curve = input;
    if (args.mode !== undefined) {
      const mode = this.choice('mode', args.mode, CURVE_SEGMENT_MODES) as CurveSegmentMode;
      for (const index of indices) curve = curveSegmentModeSet(curve, index, mode);
    }
    if (args.detail !== undefined)
      for (const index of indices) curve = curveSegmentDetailSet(curve, index, Math.round(args.detail));
    if (args.section !== undefined) {
      const section = this.choice(
        'section',
        args.section,
        CURVE_SECTION_CHOICES.map((choice) => choice.value),
      ) as CurveSegmentSection;
      curve = curveSegmentSectionSet(curve, indices, section);
    }
    return curve;
  }

  /**
   * Checks segment indices.
   *
   * @param curve Curve.
   * @param indices Requested indices.
   * @returns Indices.
   */
  private segmentIndices(curve: Curve, indices: number[]): number[] {
    if (!Array.isArray(indices) || indices.length === 0) throw new Error('indices must list segment numbers');
    const bad = indices.filter((index) => !curve.segments[index]);
    if (bad.length > 0)
      throw new Error(
        `No segment ${bad.join(', ')}; segment i joins points i and i+1 (${curve.segments.length} segments)`,
      );
    return indices;
  }

  /**
   * Checks a choice argument.
   *
   * @param name Argument name.
   * @param value Requested value.
   * @param allowed Allowed values.
   * @returns Value.
   */
  private choice(name: string, value: string, allowed: readonly string[]): string {
    if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
    return value;
  }

  /**
   * Edits the primary or secondary line of a curve.
   *
   * @param target Curve parameter and layer.
   * @param change Edits the line view.
   * @returns Updated curve.
   */
  private layerEdit(target: CurveTargetArgs, change: (view: Curve) => Curve): McpToolResult {
    const layer: CurveLayerKind = target.layer === 'secondary' ? 'secondary' : 'primary';
    return this.curveEdit(target, (curve) => curveLayerCompose(curve, layer, change(curveLayerView(curve, layer))));
  }

  /**
   * Runs one undoable curve edit.
   *
   * @param target Curve parameter.
   * @param change Builds the next curve; throws to refuse.
   * @returns Updated curve.
   */
  private curveEdit(
    target: CurveTargetArgs,
    change: (curve: Curve, field: ModifierStackField) => Curve,
  ): McpToolResult {
    let edited: Curve | null = null;
    let fieldFound: ModifierStackField | null = null;
    const result = this.modifiers.entryParametersEdit(target.objectId, target.modifierId, (entry, holder) => {
      const found = this.curveOf(entry, holder, target.key);
      edited = change(found.curve, found.field);
      fieldFound = found.field;
      return { ...entry.parameters, [target.key]: curveEncode(edited) };
    });
    if (!result.ok || !edited || !fieldFound) return result;
    return { ...result, data: this.curveDescribe(edited, fieldFound) };
  }

  /**
   * Resolves the curve a target names.
   *
   * @param target Curve parameter.
   * @returns Curve and field, or an error message.
   */
  private curveFind(target: CurveTargetArgs): { curve: Curve; field: ModifierStackField } | string {
    const holder = modifierHolderFind(this.host.worldObject, target.objectId);
    if (typeof holder === 'string') return holder;
    const entry = this.entryOf(holder, target.modifierId);
    if (!entry) return `No modifier ${target.modifierId} on ${holder.object.name}`;
    try {
      return this.curveOf(entry, holder, target.key);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Finds an entry of a holder's stack.
   *
   * @param holder Holder.
   * @param modifierId Modifier id.
   * @returns Entry, or undefined.
   */
  private entryOf(holder: ModifierHolder, modifierId: string): ModifierStackEntry | undefined {
    const stack = this.modifiers.stackRead(holder.object);
    return stack.modifiers.find((entry) => entry.id === modifierId);
  }

  /**
   * Reads the curve stored in a curve field, or the curve its row shows when
   * none is stored.
   *
   * @param entry Stack entry.
   * @param holder Holder.
   * @param key Curve field key.
   * @returns Curve and field.
   */
  private curveOf(
    entry: ModifierStackEntry,
    holder: ModifierHolder,
    key: string,
  ): { curve: Curve; field: ModifierStackField } {
    const kind = modifierStackKindFind(entry.kind);
    const curveFields = kind?.fields.filter((field) => field.type === 'curve') ?? [];
    const field = curveFields.find((candidate) => candidate.key === key);
    if (!kind || !field)
      throw new Error(
        `${entry.name} has no curve parameter "${key}". Curve parameters: ${curveFields.map((candidate) => candidate.key).join(', ') || 'none'}`,
      );
    const parameters = kind.normalizeParameters(entry.parameters);
    const curve =
      curveDecode(parameters[key]) ??
      curveDecode(kind.curveFallback(key, parameters, holder.object)) ??
      curveFromPolyline([
        [0, 1],
        [1, 1],
      ]);
    return { curve, field };
  }

  /**
   * Describes a curve readably.
   *
   * @param curve Curve.
   * @param field Its field.
   * @returns Points with absolute handles, segments, markers and raw data.
   */
  private curveDescribe(curve: Curve, field: ModifierStackField): Record<string, unknown> {
    return {
      hint: field.hint ?? '',
      points: curve.points.map((point, index) => ({
        index,
        x: point.x,
        y: point.y,
        handleIn: { x: point.x + point.in.x, y: point.y + point.in.y },
        handleOut: { x: point.x + point.out.x, y: point.y + point.out.y },
      })),
      segments: curve.segments.map((segment, index) => ({ index, from: index, to: index + 1, ...segment })),
      markers: curve.markers ?? null,
      hasSecondary: Boolean(curve.secondary),
      data: curveToData(curve),
      presetCount: field.curvePresets?.length ?? 0,
    };
  }
}
