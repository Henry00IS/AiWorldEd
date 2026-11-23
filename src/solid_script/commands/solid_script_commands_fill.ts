import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFillPaths, type SolidScriptFillRule } from '@/solid_script/language/solid_script_fill_paths.js';
import { solidScriptFillPoints } from '@/solid_script/language/solid_script_fill_points.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptScaleFacesVector } from './solid_script_scale_faces_how.js';
import { SolidScriptPathElement, solidScriptValueText } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads the loops of a Fill Paths line: each Path in Paths, or one loop of the
 * points written there.
 *
 * @param run Running line.
 * @returns Loops.
 */
function solidScriptFillLoops(run: SolidScriptBlockRun): THREE.Vector3[][] {
  const given = run.values('paths');
  const toVector = ([x = 0, y = 0, z = 0]: readonly number[]): THREE.Vector3 => new THREE.Vector3(x, y, z);
  if (given.length > 0 && given.every((value) => value instanceof SolidScriptPathElement))
    return given.map((path) => solidScriptPathSample((path as SolidScriptPathElement).path).map(toVector));
  const points = run.value('paths');
  if (!Array.isArray(points) || !points.every(Array.isArray))
    throw new Error('Fill Paths needs Paths, or points such as [0, 0, 0], [2, 0, 0], [2, 0, 2]');
  return [(points as number[][]).map(toVector)];
}

/**
 * Fill Paths and Fill Points: flat meshes of triangles from paths or loose
 * points.
 */
export const SOLID_SCRIPT_COMMANDS_FILL: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'fill_paths',
    label: 'Fill Paths',
    category: 'Paths',
    description: 'Fill closed paths with a flat mesh',
    manual:
      'Builds a flat mesh of triangles that fills closed paths, for a floor, a pond or a terrain patch. Paths holds Paths, such as the list Path From Edges writes, or the points of one closed loop. A path inside another is a hole, one inside that is filled again, and so on; with Rule Non-Zero a path inside one running the same way is filled too, and only one running the other way cuts a hole. Paths that cross each other are not split where they cross. Every path is laid flat in the plane of the biggest one, and the mesh faces the way that path runs round; Flip Faces turns it over. Example: Path From Points [0, 0, 0], [0, 0, 4], [4, 0, 4], [4, 0, 0] Closed Into [Floor], a smaller Path Into [Hole], then Fill Paths [Floor], [Hole] gives a floor with a hole.',
    stops: [
      'No closed path with 3 points or more, or paths that enclose no area.',
      'A Rule other than Even-Odd or Non-Zero.',
    ],
    parameters: [
      solidScriptParameter(
        'paths',
        'Paths',
        'points3',
        '[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]',
        'Closed Paths to fill, such as [Floor], [Hole], or the points of one loop, such as [0, 0, 0], [0, 0, 2], [2, 0, 2].',
      ),
      solidScriptParameterWords(
        'rule',
        'Rule',
        'text',
        'Even-Odd',
        'Which areas are filled: Even-Odd makes every path inside a filled one a hole; Non-Zero fills inside a path that runs the same way as the one round it, and cuts a hole only where one runs the other way. Type one, such as Non-Zero.',
        [
          { word: 'Even-Odd', detail: 'A path inside a filled one is a hole' },
          { word: 'Non-Zero', detail: 'A hole only where a path runs the other way' },
        ],
      ),
    ],
    listing: (read) => [
      'Fill Paths',
      ' ',
      read.value('paths'),
      ...(read.changed('rule') ? [' Rule ', read.value('rule')] : []),
    ],
    execute: (run) => run.mesh(solidScriptFillPaths(solidScriptFillLoops(run), 'Fill Paths', solidScriptFillRule(run))),
  }),
  new SolidScriptCommand({
    id: 'fill_points',
    label: 'Fill Points',
    category: 'Points',
    description: 'Fill loose points with a flat mesh of triangles',
    manual:
      'Builds a mesh of triangles between loose points, such as scattered points or a list of spots, covering the convex hull round all of them, for terrain, a broken floor or a low-poly patch. The points are laid flat on the plane facing Normal to pick the triangles, and keep their place, so heights stay. No triangle has another point inside the circle through its corners, which keeps triangles as even as the points allow. Points at the same place on the plane are kept once. Groups gives each point a group, and every group is filled on its own; a group with fewer than 3 points that are not in one line is left out. Edges gives pairs of point numbers, from 0, that stay edges of the mesh, such as a road or a cliff line; an edge through another point is kept as two, and only edges between points of one group are kept. Faces Regions joins the triangles between Edges and the border into one face each, Triangles (the default) keeps triangles. The faces look along Normal. Example: Scatter Points on a plane Into [Spots], then Fill Points [Spots].',
    stops: [
      'Fewer than 3 points, or points that are all in one line on the plane.',
      'More than 5000 points.',
      'A Normal of 0, 0, 0.',
      'Edges that are not pairs of point numbers, or that cross each other.',
      'Faces other than Triangles or Regions.',
    ],
    parameters: [
      solidScriptParameter(
        'points',
        'Points',
        'points3',
        '[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2], [1, 0, 1]',
        'The points to join with triangles, such as [Points], or a list such as [0, 0, 0], [2, 0, 0], [1, 0, 2].',
      ),
      solidScriptParameter(
        'normal',
        'Normal',
        'vector3',
        '0, 1, 0',
        'The way the plane and the faces look, such as 0, 1, 0 for points on the ground.',
      ),
      solidScriptParameterOptional(
        'groups',
        'Groups',
        'value',
        'A group per point, such as [Ids]; each group is filled on its own. Empty fills all points together.',
      ),
      solidScriptParameterOptional(
        'edges',
        'Edges',
        'value',
        'Pairs of point numbers, from 0, that stay edges of the mesh, such as [=List(List(0, 2), List(1, 3))]; an edge through another point is kept as two. Empty keeps none.',
      ),
      solidScriptParameterWords(
        'faces',
        'Faces',
        'text',
        'Triangles',
        'Triangles fills with triangles; Regions joins the triangles between Edges and the border into one face each. Type one, such as Regions.',
        [
          { word: 'Triangles', detail: 'Fill with triangles' },
          { word: 'Regions', detail: 'One face between Edges and the border' },
        ],
      ),
    ],
    listing: (read) => [
      'Fill Points',
      ' ',
      read.value('points'),
      ' Normal ',
      read.value('normal'),
      ...(read.changed('groups') ? [' Groups ', read.value('groups')] : []),
      ...(read.changed('edges') ? [' Edges ', read.value('edges')] : []),
      ...(read.changed('faces') ? [' Faces ', read.value('faces')] : []),
    ],
    execute: (run) => {
      const points = run.value('points');
      const normal = solidScriptScaleFacesVector(run.value('normal'), 'Normal') ?? new THREE.Vector3(0, 1, 0);
      if (!Array.isArray(points) || !points.every(Array.isArray))
        throw new Error('Fill Points needs points, such as [0, 0, 0], [2, 0, 0], [1, 0, 2]');
      const places = (points as number[][]).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
      const groups = run.value('groups');
      const keys = Array.isArray(groups) ? groups.map((group) => solidScriptValueText(group)) : null;
      return run.mesh(
        solidScriptFillPoints(places, normal, 'Fill Points', {
          groups: keys,
          edges: solidScriptFillEdges(run, places.length),
          regions: solidScriptFillFaces(run),
        }),
      );
    },
  }),
];

/**
 * Reads Fill Paths' Rule, Even-Odd when empty.
 *
 * @param run Running line.
 * @returns Even-Odd or Non-Zero.
 */
function solidScriptFillRule(run: SolidScriptBlockRun): SolidScriptFillRule {
  const text = (run.text('rule').trim() || 'Even-Odd').toLowerCase();
  if (text === 'even-odd') return 'Even-Odd';
  if (text === 'non-zero') return 'Non-Zero';
  throw new Error(`Fill Paths needs Even-Odd or Non-Zero in Rule, not ${run.text('rule')}`);
}

/**
 * Reads Fill Points' Edges: pairs of point numbers from 0.
 *
 * @param run Running line.
 * @param count Number of points.
 * @returns Pairs, none when empty.
 */
function solidScriptFillEdges(run: SolidScriptBlockRun, count: number): [number, number][] {
  if (run.source('edges').trim() === '') return [];
  const edges = run.value('edges');
  const pairs = Array.isArray(edges) ? edges.map((edge) => (Array.isArray(edge) ? edge : [])) : [];
  const fits = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
  if (!Array.isArray(edges) || pairs.some((pair) => pair.length !== 2 || !pair.every(fits)))
    throw new Error(`Fill Points needs Edges of two point numbers from 0 to ${count - 1}, such as [=List(List(0, 2))]`);
  return pairs.map(([a, b]) => [a as number, b as number]);
}

/**
 * Reads Fill Points' Faces.
 *
 * @param run Running line.
 * @returns True for Regions.
 */
function solidScriptFillFaces(run: SolidScriptBlockRun): boolean {
  const text = (run.text('faces').trim() || 'Triangles').toLowerCase();
  if (text === 'regions' || text === 'triangles') return text === 'regions';
  throw new Error(`Fill Points needs Triangles or Regions in Faces, not ${run.text('faces')}`);
}
