import * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { PAINT_TEXELS_PER_UNIT, PAINT_TILE_CONTENT_TEXELS, PAINT_TILE_GUTTER_TEXELS } from '@/paint/paint_constants.js';
import { type PaintCanvasFrame, paintCanvasFrameFromPlane } from '@/paint/canvas/paint_canvas_frame.js';
import { paintCanvasTileIndex } from '@/paint/canvas/paint_canvas_tile.js';
import { PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import { type PaintImage, type PaintImageSource, paintImageSample } from '@/paint/raster/paint_image.js';
import type { PaintLayerProvider } from '@/paint/scene/paint_scene_system.js';
import { paintResultToBrush } from '@/paint/scene/paint_scene_system.js';
import { type PaintOverlaySource, paintOverlayFacingSigns } from '@/paint/overlay/paint_overlay_geometry.js';
import { paintStrokeCompare } from '@/paint/stroke/paint_stroke.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import { PaintImageSourceTextures, paintImageRead } from '@/paint/scene/paint_image_source_textures.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';

/** Longest side of a baked export image. */
export const PAINT_EXPORT_MAXIMUM_SIDE = 4096;
/** Texels of margin around every chart, so filtering never reads a neighbor. */
const PAINT_EXPORT_CHART_MARGIN = 2;

/** What the export bake reads besides the model. */
export interface PaintExportBakeOptions {
  /** Stencil, stamp and decal images. */
  readonly images: PaintImageSource;
  /** Decal layers, or null. */
  readonly layers: PaintLayerProvider | null;
  /** Reads the pixels of a material's diffuse map, or null without one. */
  readonly baseImage: (map: THREE.Texture) => PaintImage | null;
  /**
   * Longest side of the baked image; defaults to
   * {@link PAINT_EXPORT_MAXIMUM_SIDE}.
   */
  readonly maximumSide?: number;
}

/** Affine paint of one tile's content texels: A rgb then B rgb per texel. */
type PaintExportTile = Float32Array;

/** One painted brush face: its triangles, canvas, paint and place in the image. */
interface PaintExportChart {
  readonly brush: SolidBrushInstance;
  readonly faceIndex: number;
  readonly frame: PaintCanvasFrame;
  readonly resultToBrush: THREE.Matrix4;
  /** Result triangle indices. */
  readonly triangles: number[];
  /** Painted tiles keyed `x|y`. */
  readonly tiles: Map<string, PaintExportTile>;
  /** Canvas rectangle in texels, margin included. */
  minS: number;
  minT: number;
  width: number;
  height: number;
  /** Placement in the image, in pixels, after packing. */
  x: number;
  y: number;
  /**
   * Maps canvas s, t to the face's original u, v: [a, b, c, d, e, f] for u =
   * a·s + b·t + c, v = d·s + e·t + f.
   */
  uvFromCanvas: readonly number[] | null;
  /** Material index of the face's triangles. */
  materialIndex: number;
}

/**
 * Bakes the paint and decals of a solid model into an export copy of its
 * result: painted faces get UVs into one new image and new materials whose map
 * is that image, holding the face's own texture with the paint applied. Faces
 * without paint, and the original textures, stay as they are.
 *
 * @param model Solid model.
 * @param result Live result mesh.
 * @param exportMesh Export copy of the result (geometry is replaced, never
 *   edited in place).
 * @param options Image sources and limits.
 * @returns True when anything was baked.
 */
export function paintExportBake(
  model: SolidModel,
  result: THREE.Mesh,
  exportMesh: THREE.Mesh,
  options: PaintExportBakeOptions,
): boolean {
  const sourceGeometry = exportMesh.geometry;
  const position = sourceGeometry.getAttribute('position');
  if (position === undefined) return false;
  const sources = paintExportSources(result);
  options.layers?.prepare?.();
  const brushes = new Map<string, SolidBrushInstance>();
  for (const brush of model.getBrushes()) {
    const hasLayers = (options.layers?.layersFor(model, brush).bounds.length ?? 0) > 0;
    if (!brush.paint.isEmpty() || hasLayers) brushes.set(brush.id, brush);
  }
  if (brushes.size === 0) return false;
  const geometry = sourceGeometry.index === null ? sourceGeometry : sourceGeometry.toNonIndexed();
  const triangleCount = Math.floor(geometry.getAttribute('position').count / 3);
  const resultToBrush = new Map<string, THREE.Matrix4>();
  brushes.forEach((brush, id) => resultToBrush.set(id, paintResultToBrush(result, brush)));
  const signs = paintOverlayFacingSigns(
    geometry,
    sources,
    resultToBrush,
    (brushId, face) => brushes.get(brushId)?.brush.planes[face]?.normal ?? null,
  );
  const charts = paintExportCharts(model, geometry, sources, brushes, resultToBrush, signs, triangleCount, options);
  if (charts.length === 0) return false;
  const maximumSide = options.maximumSide ?? PAINT_EXPORT_MAXIMUM_SIDE;
  const packed = paintExportPack(charts, maximumSide);
  const materials = Array.isArray(exportMesh.material) ? exportMesh.material : [exportMesh.material];
  const texture = paintExportImage(charts, packed, materials, options);
  texture.name = `${exportMesh.name || 'Model'}_painted`;
  const painted = new Map<number, number>();
  const nextMaterials = [...materials];
  for (const chart of charts) {
    if (painted.has(chart.materialIndex)) continue;
    painted.set(chart.materialIndex, nextMaterials.length);
    nextMaterials.push(paintExportMaterial(materials[chart.materialIndex] ?? materials[0], texture));
  }
  exportMesh.geometry = paintExportGeometry(geometry, charts, packed, painted, triangleCount);
  exportMesh.material = nextMaterials;
  return true;
}

/**
 * Returns the per-triangle sources of a result mesh.
 *
 * @param result Result mesh.
 * @returns Sources.
 */
function paintExportSources(result: THREE.Mesh): readonly (PaintOverlaySource | undefined)[] {
  const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
  return Array.isArray(sources) ? (sources as (PaintOverlaySource | undefined)[]) : [];
}

/**
 * Collects the painted faces of a result with their rasterized paint.
 *
 * @param model Model.
 * @param geometry Non-indexed result geometry.
 * @param sources Per-triangle sources.
 * @param brushes Brushes with paint or decals.
 * @param resultToBrush Result to brush-local transforms.
 * @param signs Facing signs keyed `brushId|face`.
 * @param triangleCount Triangle count.
 * @param options Bake options.
 * @returns Charts of faces that hold paint.
 */
function paintExportCharts(
  model: SolidModel,
  geometry: THREE.BufferGeometry,
  sources: readonly (PaintOverlaySource | undefined)[],
  brushes: ReadonlyMap<string, SolidBrushInstance>,
  resultToBrush: ReadonlyMap<string, THREE.Matrix4>,
  signs: ReadonlyMap<string, number>,
  triangleCount: number,
  options: PaintExportBakeOptions,
): PaintExportChart[] {
  const byFace = new Map<string, PaintExportChart>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const source = sources[triangle];
    if (source?.brushId === undefined || source.surfaceIndex === undefined || source.derivedId !== undefined) continue;
    const brush = brushes.get(source.brushId);
    const matrix = resultToBrush.get(source.brushId);
    const plane = brush?.brush.planes[source.surfaceIndex];
    if (brush === undefined || matrix === undefined || plane === undefined) continue;
    const key = `${source.brushId}|${source.surfaceIndex}`;
    let chart = byFace.get(key);
    if (chart === undefined) {
      chart = {
        brush,
        faceIndex: source.surfaceIndex,
        // Brush planes store d of n·p + d = 0; canvas frames use n·p = offset.
        frame: paintCanvasFrameFromPlane(plane.normal, -plane.offset),
        resultToBrush: matrix,
        triangles: [],
        tiles: new Map(),
        minS: 0,
        minT: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        uvFromCanvas: null,
        materialIndex: paintExportMaterialIndex(geometry, triangle),
      };
      byFace.set(key, chart);
    }
    chart.triangles.push(triangle);
  }
  const raster = new PaintTileRaster();
  const charts: PaintExportChart[] = [];
  for (const [key, chart] of byFace) {
    paintExportChartRect(chart, geometry);
    paintExportChartRaster(model, chart, signs.get(key) ?? 1, raster, options);
    if (chart.tiles.size === 0) continue;
    chart.uvFromCanvas = paintExportUvFromCanvas(chart, geometry);
    charts.push(chart);
  }
  return charts;
}

/**
 * Returns the material index of a triangle from the geometry groups.
 *
 * @param geometry Geometry.
 * @param triangle Triangle index.
 * @returns Material index.
 */
function paintExportMaterialIndex(geometry: THREE.BufferGeometry, triangle: number): number {
  const vertex = triangle * 3;
  for (const group of geometry.groups) {
    if (vertex >= group.start && vertex < group.start + group.count) return group.materialIndex ?? 0;
  }
  return 0;
}

/**
 * Sets a chart's canvas rectangle from its triangles.
 *
 * @param chart Chart.
 * @param geometry Geometry.
 */
function paintExportChartRect(chart: PaintExportChart, geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let minS = Infinity;
  let minT = Infinity;
  let maxS = -Infinity;
  let maxT = -Infinity;
  for (const triangle of chart.triangles) {
    for (let corner = 0; corner < 3; corner++) {
      point.fromBufferAttribute(position, triangle * 3 + corner).applyMatrix4(chart.resultToBrush);
      const s = point.dot(chart.frame.tangentS) * PAINT_TEXELS_PER_UNIT;
      const t = point.dot(chart.frame.tangentT) * PAINT_TEXELS_PER_UNIT;
      minS = Math.min(minS, s);
      minT = Math.min(minT, t);
      maxS = Math.max(maxS, s);
      maxT = Math.max(maxT, t);
    }
  }
  chart.minS = Math.floor(minS) - PAINT_EXPORT_CHART_MARGIN;
  chart.minT = Math.floor(minT) - PAINT_EXPORT_CHART_MARGIN;
  chart.width = Math.ceil(maxS) + PAINT_EXPORT_CHART_MARGIN - chart.minS;
  chart.height = Math.ceil(maxT) + PAINT_EXPORT_CHART_MARGIN - chart.minT;
}

/**
 * Rasterizes every tile under a chart, keeping the ones that hold paint.
 *
 * @param model Model.
 * @param chart Chart.
 * @param facingSign Facing sign of the face.
 * @param raster Reused raster.
 * @param options Bake options.
 */
function paintExportChartRaster(
  model: SolidModel,
  chart: PaintExportChart,
  facingSign: number,
  raster: PaintTileRaster,
  options: PaintExportBakeOptions,
): void {
  const strokes = [...chart.brush.paint.ordered()].sort(paintStrokeCompare);
  const layers = options.layers?.layersFor(model, chart.brush).layers(chart.faceIndex) ?? [];
  const firstX = paintCanvasTileIndex(chart.minS);
  const lastX = paintCanvasTileIndex(chart.minS + chart.width);
  const firstY = paintCanvasTileIndex(chart.minT);
  const lastY = paintCanvasTileIndex(chart.minT + chart.height);
  for (let tileY = firstY; tileY <= lastY; tileY++) {
    for (let tileX = firstX; tileX <= lastX; tileX++) {
      raster.prepare(chart.frame, tileX, tileY, facingSign);
      raster.rasterStrokes(strokes, options.images);
      raster.resolvePaint();
      raster.compositeLayers(layers);
      if (raster.isIdentity()) continue;
      const tile = new Float32Array(PAINT_TILE_CONTENT_TEXELS * PAINT_TILE_CONTENT_TEXELS * 6);
      for (let y = 0; y < PAINT_TILE_CONTENT_TEXELS; y++) {
        for (let x = 0; x < PAINT_TILE_CONTENT_TEXELS; x++) {
          const from = ((y + PAINT_TILE_GUTTER_TEXELS) * raster.size + x + PAINT_TILE_GUTTER_TEXELS) * 3;
          const to = (y * PAINT_TILE_CONTENT_TEXELS + x) * 6;
          for (let channel = 0; channel < 3; channel++) {
            tile[to + channel] = raster.affineA[from + channel] ?? 1;
            tile[to + 3 + channel] = raster.affineB[from + channel] ?? 0;
          }
        }
      }
      chart.tiles.set(`${tileX}|${tileY}`, tile);
    }
  }
}

/**
 * Fits the face's texture mapping as a function of canvas coordinates, from its
 * largest triangle (faces are planar, so their mapping is affine).
 *
 * @param chart Chart.
 * @param geometry Geometry.
 * @returns Coefficients, or null when the geometry has no UVs.
 */
function paintExportUvFromCanvas(chart: PaintExportChart, geometry: THREE.BufferGeometry): number[] | null {
  const uv = geometry.getAttribute('uv');
  if (uv === undefined) return null;
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let best: number[] | null = null;
  let bestArea = 0;
  for (const triangle of chart.triangles) {
    const st: [number, number][] = [];
    for (let corner = 0; corner < 3; corner++) {
      point.fromBufferAttribute(position, triangle * 3 + corner).applyMatrix4(chart.resultToBrush);
      st.push([
        point.dot(chart.frame.tangentS) * PAINT_TEXELS_PER_UNIT,
        point.dot(chart.frame.tangentT) * PAINT_TEXELS_PER_UNIT,
      ]);
    }
    const [p0, p1, p2] = st as [[number, number], [number, number], [number, number]];
    const ds1 = p1[0] - p0[0];
    const dt1 = p1[1] - p0[1];
    const ds2 = p2[0] - p0[0];
    const dt2 = p2[1] - p0[1];
    const determinant = ds1 * dt2 - ds2 * dt1;
    if (Math.abs(determinant) <= bestArea) continue;
    bestArea = Math.abs(determinant);
    const coefficients: number[] = [];
    for (const component of [0, 1]) {
      const value = (corner: number) => uv.getComponent(triangle * 3 + corner, component);
      const d1 = value(1) - value(0);
      const d2 = value(2) - value(0);
      const a = (d1 * dt2 - d2 * dt1) / determinant;
      const b = (ds1 * d2 - ds2 * d1) / determinant;
      coefficients.push(a, b, value(0) - a * p0[0] - b * p0[1]);
    }
    best = coefficients;
  }
  return best;
}

/** Result of packing charts into one image. */
interface PaintExportPacking {
  readonly width: number;
  readonly height: number;
  /** Image pixels per canvas texel. */
  readonly scale: number;
}

/**
 * Packs charts into rows of one image, shrinking the texel density when they
 * would not fit the maximum side.
 *
 * @param charts Charts; their x and y are set.
 * @param maximumSide Longest image side.
 * @returns Image size and density.
 */
export function paintExportPack(
  charts: readonly Pick<PaintExportChart, 'width' | 'height' | 'x' | 'y'>[],
  maximumSide: number,
): PaintExportPacking {
  const area = charts.reduce((sum, chart) => sum + chart.width * chart.height, 0);
  let scale = Math.min(1, Math.sqrt((maximumSide * maximumSide * 0.7) / Math.max(1, area)));
  for (;;) {
    const packed = paintExportPackAt(charts, maximumSide, scale);
    if (packed !== null) return packed;
    scale *= 0.85;
  }
}

/**
 * Tries to pack charts at a density.
 *
 * @param charts Charts.
 * @param maximumSide Longest image side.
 * @param scale Pixels per texel.
 * @returns Packing, or null when the charts do not fit.
 */
function paintExportPackAt(
  charts: readonly Pick<PaintExportChart, 'width' | 'height' | 'x' | 'y'>[],
  maximumSide: number,
  scale: number,
): PaintExportPacking | null {
  const sizes = charts.map((chart) => ({
    chart,
    width: Math.max(1, Math.ceil(chart.width * scale)),
    height: Math.max(1, Math.ceil(chart.height * scale)),
  }));
  const area = sizes.reduce((sum, size) => sum + size.width * size.height, 0);
  const widest = Math.max(...sizes.map((size) => size.width));
  if (widest > maximumSide) return null;
  const width = Math.min(maximumSide, Math.max(widest, paintExportPowerOfTwo(Math.ceil(Math.sqrt(area)))));
  sizes.sort((left, right) => right.height - left.height);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const size of sizes) {
    if (x + size.width > width) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    size.chart.x = x;
    size.chart.y = y;
    x += size.width;
    rowHeight = Math.max(rowHeight, size.height);
  }
  const height = y + rowHeight;
  return height > maximumSide ? null : { width, height, scale };
}

/**
 * Rounds up to a power of two.
 *
 * @param value Value.
 * @returns Power of two not below the value.
 */
function paintExportPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

/**
 * Fills the baked image: every chart pixel samples the face's own texture
 * through its mapping, times its material color, and applies the paint.
 *
 * @param charts Packed charts.
 * @param packing Image size and density.
 * @param materials Export materials of the mesh.
 * @param options Bake options.
 * @returns Texture whose rows run from the top of the image down.
 */
function paintExportImage(
  charts: readonly PaintExportChart[],
  packing: PaintExportPacking,
  materials: readonly THREE.Material[],
  options: PaintExportBakeOptions,
): THREE.DataTexture {
  const data = new Uint8Array(packing.width * packing.height * 4);
  const sample = new Float32Array(4);
  const affine = new Float32Array(6);
  for (const chart of charts) {
    const material = materials[chart.materialIndex] as
      (THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null }) | undefined;
    const tint = material?.color?.getHex() ?? 0xffffff;
    const tintRgb = [((tint >> 16) & 255) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255];
    const map = material?.map ?? null;
    const base = map === null || chart.uvFromCanvas === null ? null : options.baseImage(map);
    const uv = chart.uvFromCanvas;
    const width = Math.max(1, Math.ceil(chart.width * packing.scale));
    const height = Math.max(1, Math.ceil(chart.height * packing.scale));
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const s = chart.minS + (px + 0.5) / packing.scale;
        const t = chart.minT + (py + 0.5) / packing.scale;
        paintExportAffineAt(chart, s, t, affine);
        if (base !== null && uv !== null) {
          const u = (uv[0] ?? 0) * s + (uv[1] ?? 0) * t + (uv[2] ?? 0);
          const v = (uv[3] ?? 0) * s + (uv[4] ?? 0) * t + (uv[5] ?? 0);
          paintImageSample(base, u, v, sample);
        } else {
          sample.fill(1);
        }
        const offset = ((chart.y + py) * packing.width + chart.x + px) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const color = (sample[channel] ?? 1) * (tintRgb[channel] ?? 1);
          const value = color * (affine[channel] ?? 1) + (affine[3 + channel] ?? 0);
          data[offset + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
        }
        data[offset + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, packing.width, packing.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Reads the paint of a chart at canvas coordinates.
 *
 * @param chart Chart.
 * @param s Canvas s.
 * @param t Canvas t.
 * @param out Receives A rgb then B rgb.
 */
function paintExportAffineAt(chart: PaintExportChart, s: number, t: number, out: Float32Array): void {
  const tileX = paintCanvasTileIndex(s);
  const tileY = paintCanvasTileIndex(t);
  const tile = chart.tiles.get(`${tileX}|${tileY}`);
  if (tile === undefined) {
    out.set([1, 1, 1, 0, 0, 0]);
    return;
  }
  const x = Math.min(PAINT_TILE_CONTENT_TEXELS - 1, Math.floor(s - tileX * PAINT_TILE_CONTENT_TEXELS));
  const y = Math.min(PAINT_TILE_CONTENT_TEXELS - 1, Math.floor(t - tileY * PAINT_TILE_CONTENT_TEXELS));
  const index = (y * PAINT_TILE_CONTENT_TEXELS + x) * 6;
  for (let channel = 0; channel < 6; channel++) out[channel] = tile[index + channel] ?? (channel < 3 ? 1 : 0);
}

/**
 * Creates the painted variant of an export material.
 *
 * @param material Export material.
 * @param texture Baked image.
 * @returns New material with the image as its map and a white color.
 */
function paintExportMaterial(material: THREE.Material | undefined, texture: THREE.Texture): THREE.Material {
  const painted = (material?.clone() ?? new THREE.MeshPhysicalMaterial()) as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
  };
  if (painted.color !== undefined) painted.color.set(0xffffff);
  painted.map = texture;
  painted.name = `${material?.name || 'Material'} Painted`;
  painted.needsUpdate = true;
  return painted;
}

/**
 * Rebuilds the geometry: painted triangles move to the painted materials with
 * UVs into the baked image; everything else is copied unchanged.
 *
 * @param geometry Non-indexed source geometry.
 * @param charts Packed charts.
 * @param packing Image size and density.
 * @param painted Painted material index per original material index.
 * @param triangleCount Triangle count.
 * @returns New geometry.
 */
function paintExportGeometry(
  geometry: THREE.BufferGeometry,
  charts: readonly PaintExportChart[],
  packing: PaintExportPacking,
  painted: ReadonlyMap<number, number>,
  triangleCount: number,
): THREE.BufferGeometry {
  const chartOf = new Map<number, PaintExportChart>();
  for (const chart of charts) for (const triangle of chart.triangles) chartOf.set(triangle, chart);
  const order: { triangle: number; material: number }[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const chart = chartOf.get(triangle);
    const material =
      chart === undefined ? paintExportMaterialIndex(geometry, triangle) : (painted.get(chart.materialIndex) ?? 0);
    order.push({ triangle, material });
  }
  order.sort((left, right) => left.material - right.material || left.triangle - right.triangle);
  const output = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const source = attribute as THREE.BufferAttribute;
    const array = new Float32Array(triangleCount * 3 * source.itemSize);
    order.forEach(({ triangle }, slot) => {
      for (let corner = 0; corner < 3; corner++) {
        for (let component = 0; component < source.itemSize; component++) {
          array[(slot * 3 + corner) * source.itemSize + component] = source.getComponent(
            triangle * 3 + corner,
            component,
          );
        }
      }
    });
    output.setAttribute(name, new THREE.BufferAttribute(array, source.itemSize, source.normalized));
  }
  const uv = output.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(triangleCount * 6), 2);
  if (output.getAttribute('uv') === undefined) output.setAttribute('uv', uv);
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  order.forEach(({ triangle }, slot) => {
    const chart = chartOf.get(triangle);
    if (chart === undefined) return;
    for (let corner = 0; corner < 3; corner++) {
      point.fromBufferAttribute(position, triangle * 3 + corner).applyMatrix4(chart.resultToBrush);
      const s = point.dot(chart.frame.tangentS) * PAINT_TEXELS_PER_UNIT;
      const t = point.dot(chart.frame.tangentT) * PAINT_TEXELS_PER_UNIT;
      const x = chart.x + (s - chart.minS) * packing.scale;
      const y = chart.y + (t - chart.minT) * packing.scale;
      uv.setXY(slot * 3 + corner, x / packing.width, 1 - y / packing.height);
    }
  });
  let start = 0;
  for (let slot = 1; slot <= order.length; slot++) {
    if (slot < order.length && order[slot]?.material === order[start]?.material) continue;
    output.addGroup(start * 3, (slot - start) * 3, order[start]?.material ?? 0);
    start = slot;
  }
  return output;
}

/**
 * Bakes the paint of the solid model under a root into its export copy, with
 * the editor's texture images and the decal volumes of its scene.
 *
 * @param solidRoot Solid model root.
 * @param result Live result mesh.
 * @param exportMesh Export copy of the result.
 * @returns True when anything was baked.
 */
export function paintExportBakeSolid(solidRoot: THREE.Object3D, result: THREE.Mesh, exportMesh: THREE.Mesh): boolean {
  const model = SolidModelRegistry.get(solidRoot);
  if (model === undefined) return false;
  const images = new PaintImageSourceTextures();
  return paintExportBake(model, result, exportMesh, {
    images,
    layers: new PaintDecalProvider(() => modifierVolumeSceneRoot(solidRoot), images),
    baseImage: (map) => paintImageRead(map.image, PAINT_EXPORT_MAXIMUM_SIDE),
  });
}
