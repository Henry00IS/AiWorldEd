import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { solidBrushShapeCreate, type SolidBrushShape } from '@/solid/brush/solid_brush_shape.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierGeneratorNodeSize } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';

/** Icon frame size in SVG units. */
const MODIFIER_GENERATOR_ICON_SIZE = 24;

/** Free border around the drawing, in SVG units. */
const MODIFIER_GENERATOR_ICON_MARGIN = 2;

/**
 * Direction towards the viewer: a three-quarter view from above, looking along
 * +Z so stairs and ramps that rise along +Z show their steps.
 */
const MODIFIER_GENERATOR_ICON_VIEW = new THREE.Vector3(1.25, 0.9, -1).normalize();

/** Settings that show a kind's character better than its defaults. */
const MODIFIER_GENERATOR_ICON_PARAMETERS: Readonly<Record<string, Record<string, unknown>>> = {
  hollowBox: { openTop: true },
};

/** Direction towards the light: from above, slightly left of the viewer. */
const MODIFIER_GENERATOR_ICON_LIGHT = new THREE.Vector3(0.55, 1, 0.35).normalize();

/** Markup already drawn, per kind. */
const modifierGeneratorIconCache = new Map<string, string>();

/** Edges whose faces meet at more than this angle are drawn, in radians. */
const MODIFIER_GENERATOR_ICON_HARD_EDGE = THREE.MathUtils.degToRad(35);

/** Grid face centres round to when matching faces between pieces. */
const MODIFIER_GENERATOR_ICON_KEY_GRID = 1e4;

/** One piece as it appears in the icon. */
interface ModifierGeneratorIconPiece {
  /** Corners of each visible face on the icon plane, before fitting. */
  faces: THREE.Vector2[][];
  /** Fill opacity of each visible face, from the light. */
  shades: number[];
  /** Outline and crease edges on the icon plane, before fitting. */
  edges: [THREE.Vector2, THREE.Vector2][];
  /** Distance towards the viewer; nearer pieces paint last. */
  depth: number;
}

/**
 * Returns the icon of a generator kind, drawn from the pieces it builds with
 * its default settings in a new node's box. Faces fill and outline in
 * currentColor, so the icon follows the theme text colour. Unknown kinds get
 * the box brush icon.
 *
 * @param kind Generator kind id.
 * @returns SVG markup.
 */
export function modifierGeneratorIconSvg(kind: string): string {
  const cached = modifierGeneratorIconCache.get(kind);
  if (cached) return cached;
  const generator = modifierStackKindFind(kind);
  if (!(generator instanceof ModifierStackKindGenerator)) return modifierGeneratorIconBrushSvg('box');
  const size = new THREE.Vector3(...modifierGeneratorNodeSize(kind));
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), size);
  const markup = modifierGeneratorIconDraw(
    generator.previewPieces(MODIFIER_GENERATOR_ICON_PARAMETERS[kind] ?? {}, box),
  );
  modifierGeneratorIconCache.set(kind, markup);
  return markup;
}

/**
 * Returns the icon of a plain brush shape in the same style, drawn from the
 * brush itself.
 *
 * @param shape Brush shape.
 * @returns SVG markup.
 */
export function modifierGeneratorIconBrushSvg(shape: SolidBrushShape): string {
  const key = `brush:${shape}`;
  const cached = modifierGeneratorIconCache.get(key);
  if (cached) return cached;
  const markup = modifierGeneratorIconDraw([solidBrushShapeCreate(shape, new THREE.Vector3(2, 2, 2))]);
  modifierGeneratorIconCache.set(key, markup);
  return markup;
}

/**
 * Draws pieces as shaded faces fitted into the icon frame, far pieces first.
 * Each piece lays an opaque backing in the tile colour, then its faces shaded
 * by the light, then its outline and creases.
 *
 * @param pieces Convex pieces.
 * @returns SVG markup.
 */
function modifierGeneratorIconDraw(pieces: readonly SolidBrush[]): string {
  const hidden = modifierGeneratorIconSharedFaces(pieces);
  const drawn = pieces
    .map((piece, index) => modifierGeneratorIconPieceOf(piece, index, hidden))
    .sort((a, b) => a.depth - b.depth);
  const fit = modifierGeneratorIconFit(drawn.flatMap((piece) => piece.faces.flat()));
  const size = MODIFIER_GENERATOR_ICON_SIZE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">`,
    ...drawn.map((piece) => modifierGeneratorIconPieceSvg(piece, fit)),
    '</svg>',
  ].join('');
}

/**
 * Writes one piece: backing, shaded faces and edges.
 *
 * @param piece Projected piece.
 * @param fit Icon plane to SVG coordinates.
 * @returns SVG markup.
 */
function modifierGeneratorIconPieceSvg(
  piece: ModifierGeneratorIconPiece,
  fit: (point: THREE.Vector2) => string,
): string {
  const loop = (points: readonly THREE.Vector2[]) => `M${points.map(fit).join('L')}Z`;
  const backing = `<path d="${piece.faces.map(loop).join('')}" fill="var(--generator-icon-backing, none)"/>`;
  const faces = piece.faces.map(
    (points, index) =>
      `<polygon points="${points.map(fit).join(' ')}" fill="currentColor" fill-opacity="${(piece.shades[index] ?? 0).toFixed(2)}"/>`,
  );
  const lines = piece.edges.map(([from, to]) => `M${fit(from)}L${fit(to)}`).join('');
  const edges = lines
    ? `<path d="${lines}" fill="none" stroke="currentColor" stroke-opacity="0.8" stroke-width="0.6" stroke-linecap="round"/>`
    : '';
  return backing + faces.join('') + edges;
}

/**
 * Returns the faces two pieces share back to back, keyed by piece and face
 * index; they sit inside the shape and are never drawn.
 *
 * @param pieces Convex pieces.
 * @returns Keys of inner faces.
 */
function modifierGeneratorIconSharedFaces(pieces: readonly SolidBrush[]): Set<string> {
  const owners = new Map<string, string[]>();
  pieces.forEach((piece, pieceIndex) =>
    piece.faces.forEach((face, faceIndex) => {
      const corners = piece.getFaceVertexIndices(face).flatMap((vertex) => piece.vertices[vertex] ?? []);
      const key = modifierGeneratorIconKey(modifierGeneratorIconCentre(corners));
      owners.set(key, [...(owners.get(key) ?? []), `${pieceIndex}:${faceIndex}`]);
    }),
  );
  return new Set([...owners.values()].filter((keys) => keys.length > 1).flat());
}

/**
 * Projects the visible faces and drawn edges of one piece.
 *
 * @param piece Convex piece.
 * @param pieceIndex Index of the piece.
 * @param hidden Keys of inner faces.
 * @returns Projected piece.
 */
function modifierGeneratorIconPieceOf(
  piece: SolidBrush,
  pieceIndex: number,
  hidden: Set<string>,
): ModifierGeneratorIconPiece {
  const index = (face: number) => `${pieceIndex}:${face}`;
  const visible = piece.faces.map((_, face) => modifierGeneratorIconFacing(piece, face) && !hidden.has(index(face)));
  const loops = piece.faces.map((face) => piece.getFaceVertexIndices(face));
  const shown = visible.flatMap((drawn, face) => (drawn ? [face] : []));
  return {
    faces: shown.map((face) => (loops[face] ?? []).map((vertex) => modifierGeneratorIconPoint(piece, vertex))),
    shades: shown.map((face) => modifierGeneratorIconShade(piece.planes[face]?.normal)),
    edges: modifierGeneratorIconEdges(piece, loops, visible, (face) => hidden.has(index(face))),
    depth: modifierGeneratorIconCentre(piece.vertices).dot(MODIFIER_GENERATOR_ICON_VIEW),
  };
}

/**
 * Lists the edges of visible faces worth a line: the outline against a face
 * turned away, and creases sharper than the hard edge angle. Edges against an
 * inner face stay open so neighbouring pieces read as one surface.
 *
 * @param piece Convex piece.
 * @param loops Vertex indices of every face.
 * @param visible Whether each face is drawn.
 * @param inner Whether a face is shared with another piece.
 * @returns Edges on the icon plane.
 */
function modifierGeneratorIconEdges(
  piece: SolidBrush,
  loops: readonly number[][],
  visible: readonly boolean[],
  inner: (face: number) => boolean,
): [THREE.Vector2, THREE.Vector2][] {
  const sides = modifierGeneratorIconEdgeFaces(loops);
  const edges: [THREE.Vector2, THREE.Vector2][] = [];
  for (const [key, faces] of sides) {
    const [first, second] = faces;
    if (first === undefined || second === undefined || !(visible[first] || visible[second])) continue;
    if (inner(first) || inner(second)) continue;
    const crease =
      (piece.planes[first]?.normal.angleTo(piece.planes[second]?.normal ?? new THREE.Vector3()) ?? 0) >
      MODIFIER_GENERATOR_ICON_HARD_EDGE;
    if (visible[first] !== visible[second] || crease) {
      const [from, to] = key.split('-').map(Number);
      edges.push([modifierGeneratorIconPoint(piece, from ?? 0), modifierGeneratorIconPoint(piece, to ?? 0)]);
    }
  }
  return edges;
}

/**
 * Maps every edge of a brush to the faces on either side.
 *
 * @param loops Vertex indices of every face.
 * @returns Faces per edge, keyed by the sorted vertex pair.
 */
function modifierGeneratorIconEdgeFaces(loops: readonly number[][]): Map<string, number[]> {
  const sides = new Map<string, number[]>();
  loops.forEach((loop, face) =>
    loop.forEach((vertex, corner) => {
      const next = loop[(corner + 1) % loop.length] ?? vertex;
      const key = `${Math.min(vertex, next)}-${Math.max(vertex, next)}`;
      sides.set(key, [...(sides.get(key) ?? []), face]);
    }),
  );
  return sides;
}

/**
 * Returns whether a face turns towards the viewer.
 *
 * @param piece Convex piece.
 * @param face Face index.
 * @returns True when visible from the icon view.
 */
function modifierGeneratorIconFacing(piece: SolidBrush, face: number): boolean {
  return (piece.planes[face]?.normal.dot(MODIFIER_GENERATOR_ICON_VIEW) ?? 0) > 1e-6;
}

/**
 * Returns the fill opacity of a face lit from above.
 *
 * @param normal Outward face normal.
 * @returns Opacity from 0.2 to 0.85.
 */
function modifierGeneratorIconShade(normal: THREE.Vector3 | undefined): number {
  return 0.2 + 0.65 * Math.max(0, normal?.dot(MODIFIER_GENERATOR_ICON_LIGHT) ?? 0);
}

/**
 * Projects one brush vertex onto the icon plane.
 *
 * @param piece Convex piece.
 * @param vertex Vertex index.
 * @returns Icon plane position.
 */
function modifierGeneratorIconPoint(piece: SolidBrush, vertex: number): THREE.Vector2 {
  return modifierGeneratorIconProject(piece.vertices[vertex] ?? new THREE.Vector3());
}

/**
 * Returns the mean of points.
 *
 * @param points Points.
 * @returns Centre.
 */
function modifierGeneratorIconCentre(points: readonly THREE.Vector3[]): THREE.Vector3 {
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
}

/**
 * Returns a key of a position rounded to a fine grid.
 *
 * @param point Position.
 * @returns Key.
 */
function modifierGeneratorIconKey(point: THREE.Vector3): string {
  return point
    .toArray()
    .map((value) => Math.round(value * MODIFIER_GENERATOR_ICON_KEY_GRID) + 0)
    .join(',');
}

/**
 * Projects a point onto the icon plane, Y pointing down the screen.
 *
 * @param point Point in frame coordinates.
 * @returns Icon plane position.
 */
function modifierGeneratorIconProject(point: THREE.Vector3): THREE.Vector2 {
  const view = MODIFIER_GENERATOR_ICON_VIEW;
  const right = new THREE.Vector3(view.z, 0, -view.x).normalize();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(view, -view.y).normalize();
  return new THREE.Vector2(point.dot(right), -point.dot(up));
}

/**
 * Returns how to place icon plane points so the drawing fills the frame,
 * centred, keeping its proportions.
 *
 * @param points Every drawn point.
 * @returns Formatter from icon plane point to SVG coordinates.
 */
function modifierGeneratorIconFit(points: readonly THREE.Vector2[]): (point: THREE.Vector2) => string {
  const bounds = new THREE.Box2().setFromPoints([...points]);
  const extent = bounds.getSize(new THREE.Vector2());
  const room = MODIFIER_GENERATOR_ICON_SIZE - 2 * MODIFIER_GENERATOR_ICON_MARGIN;
  const scale = room / Math.max(extent.x, extent.y, 1e-6);
  const centre = bounds.getCenter(new THREE.Vector2());
  const half = MODIFIER_GENERATOR_ICON_SIZE / 2;
  const clamp = (value: number) => Math.min(MODIFIER_GENERATOR_ICON_SIZE, Math.max(0, value)).toFixed(2);
  return (point) => `${clamp(half + (point.x - centre.x) * scale)},${clamp(half + (point.y - centre.y) * scale)}`;
}
