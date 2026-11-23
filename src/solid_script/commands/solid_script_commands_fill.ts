import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptFillPaths } from '@/solid_script/language/solid_script_fill_paths.js';
import { solidScriptFillPoints } from '@/solid_script/language/solid_script_fill_points.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptScaleFacesVector } from './solid_script_scale_faces_how.js';
import { SolidScriptPathElement } from '@/solid_script/language/solid_script_value.js';

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
      'Builds a flat mesh of triangles that fills closed paths, for a floor, a pond or a terrain patch. Paths holds Paths, such as the list Path From Edges writes, or the points of one closed loop. A path inside another is a hole, one inside that is filled again, and so on. Every path is laid flat in the plane of the biggest one, and the mesh faces the way that path runs round; Flip Faces turns it over. Example: Path From Points [0, 0, 0], [0, 0, 4], [4, 0, 4], [4, 0, 0] Closed Into [Floor], a smaller Path Into [Hole], then Fill Paths [Floor], [Hole] gives a floor with a hole.',
    stops: ['No closed path with 3 points or more, or paths that enclose no area.'],
    parameters: [
      solidScriptParameter(
        'paths',
        'Paths',
        'points3',
        '[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]',
        'Closed Paths to fill, such as [Floor], [Hole], or the points of one loop, such as [0, 0, 0], [0, 0, 2], [2, 0, 2].',
      ),
    ],
    listing: (read) => ['Fill Paths', ' ', read.value('paths')],
    execute: (run) => run.mesh(solidScriptFillPaths(solidScriptFillLoops(run), 'Fill Paths')),
  }),
  new SolidScriptCommand({
    id: 'fill_points',
    label: 'Fill Points',
    category: 'Points',
    description: 'Fill loose points with a flat mesh of triangles',
    manual:
      'Builds a mesh of triangles between loose points, such as scattered points or a list of spots, covering the convex hull round all of them, for terrain, a broken floor or a low-poly patch. The points are laid flat on the plane facing Normal to pick the triangles, and keep their place, so heights stay. No triangle has another point inside the circle through its corners, which keeps triangles as even as the points allow. Points at the same place on the plane are kept once. The faces look along Normal. Example: Scatter Points on a plane Into [Spots], then Fill Points [Spots].',
    stops: [
      'Fewer than 3 points, or points that are all in one line on the plane.',
      'More than 5000 points.',
      'A Normal of 0, 0, 0.',
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
    ],
    listing: (read) => ['Fill Points', ' ', read.value('points'), ' Normal ', read.value('normal')],
    execute: (run) => {
      const points = run.value('points');
      const normal = solidScriptScaleFacesVector(run.value('normal'), 'Normal') ?? new THREE.Vector3(0, 1, 0);
      if (!Array.isArray(points) || !points.every(Array.isArray))
        throw new Error('Fill Points needs points, such as [0, 0, 0], [2, 0, 0], [1, 0, 2]');
      const places = (points as number[][]).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
      return run.mesh(solidScriptFillPoints(places, normal, 'Fill Points'));
    },
  }),
];
