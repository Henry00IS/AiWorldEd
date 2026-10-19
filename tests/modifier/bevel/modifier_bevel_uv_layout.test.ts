import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import {
  authoredKeepsItsTexture,
  boxAndVolume,
  boxInstance,
  curveSpreads,
  derive,
  derivedLayout,
  edgeMatchesWorldLength,
  edgeMeetsParent,
  farthestVertex,
  generatedUsesTexture,
  layoutVolume,
  placeLayout,
  planeTangent,
  posedLayout,
  rowLength,
  stepUvLength,
  stretchCoversCurveOnce,
  stretchCoversFace,
  tileFollowsWorldEdge,
  trimAlongSpan,
  trimCoversCurveOnce,
  trimWidthStaysOneCopy,
  viewMatches,
  worldFaceNormal,
} from './modifier_bevel_uv_layout_fixture.js';
import {
  axisMatchesDominantNormal,
  localAxisKeepsOverhead,
  localViewFollowsScale,
  localViewIgnoresMove,
  localViewSticks,
  lowSegmentCoversOnce,
  worldViewFollowsMove,
  worldViewMoves,
} from './modifier_bevel_uv_layout_measure.js';

describe('bevel uv layouts', () => {
  it('tiles along the bevel in world units and meets the parent face', () => {
    const placed = placeLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE);
    const edge = placed.record.chamferEdge;
    if (!edge) throw new Error('expected a bevel edge');
    const length = edge.pointA.distanceTo(edge.pointB);
    expect(Math.abs(placed.atA.v - placed.atB.v)).toBeLessThan(1e-3);
    expect(Math.abs(Math.abs(placed.atA.u - placed.atB.u) - length)).toBeLessThan(1e-3);
    expect(placed.maxV - placed.minV).toBeGreaterThan(0.01);
    expect(placed.maxV - placed.minV).toBeLessThan(0.2);
    expect(edgeMeetsParent(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC)).toBe(true);
  });

  it('repeats trim along the length when U scale shrinks the tile', () => {
    expect(trimAlongSpan(0.5)).toBeCloseTo(trimAlongSpan(1) * 2, 2);
  });

  it('fits one texture across the bevel and tiles the length', () => {
    const placed = placeLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
    const edge = placed.record.chamferEdge;
    if (!edge) throw new Error('expected a bevel edge');
    const span = placed.maxV - placed.minV;
    expect(Math.abs(placed.atA.v - placed.atB.v)).toBeLessThan(1e-3);
    expect(Math.abs(Math.abs(placed.atA.u - placed.atB.u) - edge.pointA.distanceTo(edge.pointB))).toBeLessThan(1e-3);
    expect(span).toBeGreaterThan(0.99);
    expect(span).toBeLessThan(1.01);
  });

  it('stretches one texture copy over a generated face', () => {
    const placed = placeLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH);
    expect(placed.minU).toBeGreaterThan(-1e-3);
    expect(placed.minV).toBeGreaterThan(-1e-3);
    expect(placed.maxU).toBeGreaterThan(0.9);
    expect(placed.maxV).toBeGreaterThan(0.99);
    expect(placed.maxU).toBeLessThan(1.01);
    expect(placed.maxV).toBeLessThan(1.01);
  });

  it('projects the parent texture without folding it around the bevel', () => {
    const { instance, derived, index } = derivedLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT);
    const record = derived.faces[index];
    const parent = instance.getFaceSurface(record?.parentSurfaceIndex ?? 0);
    const surface = modifierBevelResolveDerivedSurface(instance, derived, index);
    const far = farthestVertex(instance, derived, index);
    expect(surface.uv.project(far).u).toBeCloseTo(parent.uv.project(far).u, 4);
    expect(surface.uv.project(far).v).toBeCloseTo(parent.uv.project(far).v, 4);
  });

  it('places a world-unit grid on the face plane', () => {
    const { instance, derived, index } = derivedLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC);
    const surface = modifierBevelResolveDerivedSurface(instance, derived, index);
    const normal = derived.localBrush.planes[index]?.normal;
    if (!normal) throw new Error('expected a normal');
    expect(rowLength(surface)).toBeCloseTo(1, 4);
    expect(Math.abs(surface.uv.u.x * normal.x + surface.uv.u.y * normal.y + surface.uv.u.z * normal.z)).toBeLessThan(
      1e-4,
    );
  });

  it('keeps tile and trim spacing in world units when the brush scale changes', () => {
    const scale = new THREE.Vector3(2, 0.5, 1.5);
    expect(edgeMatchesWorldLength(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE, scale)).toBe(true);
    expect(edgeMatchesWorldLength(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, scale)).toBe(true);
    expect(trimWidthStaysOneCopy(scale)).toBe(true);
    expect(tileFollowsWorldEdge(scale)).toBe(true);
    expect(stretchCoversFace(scale)).toBe(true);
  });

  it('keeps a cubic grid in world units when the brush moves and scales', () => {
    const placed = posedLayout(
      MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
      new THREE.Vector3(2, 1.5, 0.5),
      new THREE.Vector3(0.4, -0.2, 0.3),
    );
    expect(stepUvLength(placed, planeTangent(worldFaceNormal(placed)))).toBeCloseTo(1, 3);
    expect(stepUvLength(placed, worldFaceNormal(placed))).toBeLessThan(1e-3);
  });

  it('projects world X and Z onto an unrotated bevel', () => {
    expect(viewMatches(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD, 'x', 'z')).toBe(true);
  });

  it('projects world X and Y from the front and world Z and Y from the side', () => {
    expect(viewMatches(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT, 'x', 'y')).toBe(true);
    expect(viewMatches(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE, 'z', 'y')).toBe(true);
  });

  it('sizes tile, trim, stretch, and cubic to the whole curve', () => {
    expect(curveSpreads(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE)).toBe(true);
    expect(curveSpreads(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC)).toBe(true);
    expect(trimCoversCurveOnce()).toBe(true);
    expect(stretchCoversCurveOnce()).toBe(true);
    expect(lowSegmentCoversOnce(2)).toBe(true);
    expect(lowSegmentCoversOnce(3)).toBe(true);
  });

  it('picks overhead, front, or side from the face normal', () => {
    expect(axisMatchesDominantNormal()).toBe(true);
  });

  it('keeps brush-space views still when the brush turns and scales the tile count', () => {
    expect(localViewSticks(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD)).toBe(true);
    expect(localViewSticks(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT)).toBe(true);
    expect(localViewSticks(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE)).toBe(true);
    expect(worldViewMoves(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD)).toBe(true);
    expect(localViewFollowsScale()).toBe(true);
    expect(localViewIgnoresMove()).toBe(true);
    expect(worldViewFollowsMove()).toBe(true);
    expect(localAxisKeepsOverhead()).toBe(true);
  });

  it('paints generated faces with the volume texture and leaves authored faces', () => {
    const { instance, volume } = boxAndVolume();
    ModifierVolumeBevel.writeTextureId(volume, 'bevel-trim');
    const derived = derive(instance, volume);
    expect(generatedUsesTexture(instance, derived, 'bevel-trim')).toBe(true);
    expect(authoredKeepsItsTexture(instance, derived, 'bevel-trim')).toBe(true);
  });

  it('lets the higher outliner volume choose the texture', () => {
    const instance = boxInstance();
    const root = new THREE.Group();
    const top = layoutVolume(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
    const lower = layoutVolume(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE);
    ModifierVolumeBevel.writeUvFlow(top, MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    ModifierVolumeBevel.writeUvFlow(lower, MODIFIER_VOLUME_BEVEL_UV_LARGEST);
    ModifierVolumeBevel.writeTextureId(top, 'top-texture');
    ModifierVolumeBevel.writeTextureId(lower, 'lower-texture');
    root.add(top);
    root.add(lower);
    const derived = modifierBevelDeriveBrush(instance, [lower, top]);
    expect(derived?.textureId).toBe('top-texture');
    expect(derived?.layout).toBe(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
  });

  it('rebuilds the cached chamfer when the layout or texture changes', () => {
    const { instance, volume } = boxAndVolume();
    const first = modifierBevelDerivedFromCache(instance, [volume]);
    ModifierVolumeBevel.writeUvLayout(volume, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
    const second = modifierBevelDerivedFromCache(instance, [volume]);
    ModifierVolumeBevel.writeTextureId(volume, 'bevel-trim');
    const third = modifierBevelDerivedFromCache(instance, [volume]);
    expect(second?.rebuilt).toBe(true);
    expect(third?.rebuilt).toBe(true);
    expect(first?.derived).not.toBe(second?.derived);
    expect(second?.derived).not.toBe(third?.derived);
  });
});
