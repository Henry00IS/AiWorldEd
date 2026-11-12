import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveMarkerSwitch } from '@/curve/model/curve_markers.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_PROPS_CONTAINERS } from '@/curve/model/curve_preset_props_containers.js';
import { CURVE_PRESETS_PROPS_TOOLS } from '@/curve/model/curve_preset_props_tools.js';
import { CURVE_PRESETS_STRUCTURES } from '@/curve/model/curve_preset_structures.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { stackFixture } from '../../modifier/stack/modifier_stack_fixture.js';

/**
 * Every prop and structure preset added with the cross, bar and stadium
 * sections.
 */
const CURVE_PRESETS_PROPS: readonly CurvePreset[] = [
  ...CURVE_PRESETS_STRUCTURES,
  ...CURVE_PRESETS_PROPS_CONTAINERS,
  ...CURVE_PRESETS_PROPS_TOOLS,
];

/**
 * Builds a preset as a column and returns its valid pieces.
 *
 * @param preset Preset.
 * @returns Number of pieces and whether all are valid.
 */
function buildColumn(preset: CurvePreset): { pieces: number; valid: boolean } {
  const profile = curveEncode(curvePresetBuild(preset));
  const pieces = stackFixture([{ kind: 'column', parameters: { profile, sides: '16' } }], 1)
    .compile()
    .instances.slice(1);
  return {
    pieces: pieces.length,
    valid: pieces.every((piece) => SolidBrushValidator.validateGenerated(piece.brush).valid),
  };
}

/**
 * Returns the section types a preset's built curve uses.
 *
 * @param preset Preset.
 * @returns Section types, round included.
 */
function sectionsOf(preset: CurvePreset): Set<string> {
  return new Set(curvePresetBuild(preset).segments.map((segment) => segment.section ?? 'round'));
}

describe('prop and structure presets', () => {
  it('offers every preset in the column profile picker', () => {
    const field = modifierStackKindFind('column')?.fields.find((candidate) => candidate.key === 'profile');
    const offered = new Set((field?.curvePresets ?? []).map((preset) => preset.id));
    for (const preset of CURVE_PRESETS_PROPS) expect(offered.has(preset.id)).toBe(true);
  });

  it.each(CURVE_PRESETS_PROPS)('$label builds valid pieces and states its real size', (preset) => {
    const built = buildColumn(preset);
    expect(built.pieces).toBeGreaterThan(0);
    expect(built.valid).toBe(true);
    expect(preset.tooltip).toMatch(/\d m\b/);
  });

  it.each([
    ['syringe', ['cross', 'stadium']],
    ['flathead_screwdriver', ['polygon', 'bar']],
    ['phillips_screwdriver', ['polygon', 'cross']],
    ['sword', ['bar']],
    ['bridge_pier', ['stadium']],
    ['cruciform_pier', ['cross', 'square']],
  ])('%s uses its signature sections', (id, sections) => {
    const preset = CURVE_PRESETS_PROPS.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Missing preset ${id}`);
    const used = sectionsOf(preset);
    for (const section of sections) expect(used.has(section)).toBe(true);
  });

  it('builds the Phillips screwdriver from its template curve, Base and Top parked', () => {
    const template =
      '{"points":[[0,0.75,0,0,0,0.2],[0.03,0.95,0,0,0,0],[0.36,1,0,0,0.06,0],[0.44,0.62,0,0,0,0],[0.46,0.5,0,0,0,0],[0.46,0.34,0,0,0,0],[0.48,0.24,0,0,0,0],[0.9,0.24,0,0,0,0],[0.91,0.24,0,0,0,0],[0.92,0.24,0,0,0,0],[1,0.03,0,0,0,0]],"segments":[["quadratic",8,"polygon",8],["linear",8,"polygon",8],["quadratic",8,"polygon",8],["linear",8,"polygon",8],["linear",8],["linear",8],["linear",8],["linear",8],["linear",8,"cross",0,0,0,0,0,0.3,0,0,0,null,1],["linear",8,"cross",0,0,0,0,0,0.22,0,0,0,null,1]],"markers":{"bottom":0.03,"top":0.9}}';
    const preset = CURVE_PRESETS_PROPS.find((candidate) => candidate.id === 'phillips_screwdriver');
    if (!preset) throw new Error('Missing preset phillips_screwdriver');
    const curve = curvePresetBuild(preset);
    expect(curve.markers?.bottom).toBeUndefined();
    expect(curveEncode(curveMarkerSwitch(curveMarkerSwitch(curve, 'bottom', true), 'top', true))).toBe(template);
  });
});
