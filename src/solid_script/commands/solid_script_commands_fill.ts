import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptFillPaths } from '@/solid_script/language/solid_script_fill_paths.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';
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

/** Fill Paths: fills closed paths with triangles, with holes. */
export const SOLID_SCRIPT_COMMANDS_FILL: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'fill_paths',
    label: 'Fill Paths',
    category: 'Meshes',
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
];
