import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOptional } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathMesh, solidScriptPathSweep } from '@/solid_script/language/solid_script_path.js';

/** Most sides of a round Curve To Mesh profile. */
const SOLID_SCRIPT_SWEEP_SIDES_MAX = 64;

/**
 * Reads the profile: the listed outline, or a round one of Radius and Sides.
 *
 * @param run Running line.
 * @returns Profile corners, counter-clockwise.
 */
function solidScriptSweepProfile(run: SolidScriptBlockRun): THREE.Vector2[] {
  // The points fields already read x, y and x, y, z points.
  const listed = run.value('profile') as number[][];
  if (listed.length > 0) {
    if (listed.length < 3) throw new Error(`Profile needs at least 3 points, not ${listed.length}`);
    const corners = listed.map(([x, y]) => new THREE.Vector2(x, y));
    return THREE.ShapeUtils.isClockWise(corners) ? corners.reverse() : corners;
  }
  const fields = run.fields();
  const radius = fields.positive('radius', fields.number('radius', 0.1));
  const sides = Math.round(fields.number('sides', 8));
  if (sides < 3 || sides > SOLID_SCRIPT_SWEEP_SIDES_MAX)
    throw fields.error('sides', `must be 3 to ${SOLID_SCRIPT_SWEEP_SIDES_MAX}`, sides);
  return Array.from({ length: sides }, (_, index) => {
    const angle = ((index + 0.5) * Math.PI * 2) / sides;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

/** Commands that build along paths. */
export const SOLID_SCRIPT_COMMANDS_PATHS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'curve_to_mesh',
    named: true,
    label: 'Curve To Mesh',
    category: 'Meshes',
    description: 'Sweep a profile along a path',
    manual:
      'Sweeps a flat profile along a path of points, like a pipe, rail or moulding. The profile is a circle of Radius and Sides, or the x, y outline in Profile, where x runs to the side of the path and y up. Each stretch of the path becomes one solid, and the joints are cut on the mitre between two stretches so the pieces meet exactly. A dented profile fills in as a solid; with As Mesh on, the whole sweep is one mesh instead and keeps any profile. Closed joins the last point back to the first. Example: a path from resample of a few points, Radius 0.05, gives a round handrail.',
    stops: [
      'A Path with fewer than 2 different points, or 3 when Closed.',
      'A Profile with fewer than 3 points, or points that are not x, y.',
      `Sides below 3 or above ${SOLID_SCRIPT_SWEEP_SIDES_MAX}, or a Radius that is not above 0.`,
    ],
    parameters: [
      solidScriptParameter(
        'path',
        'Path',
        'points3',
        '[0, 0, 0], [1, 0, 0], [2, 1, 0]',
        'Points the profile follows, such as a list variable [Path].',
      ),
      solidScriptParameter('radius', 'Radius', 'number', '0.1', 'Radius of the round profile in metres.'),
      solidScriptParameter(
        'sides',
        'Sides',
        'count',
        '8',
        `Sides of the round profile, 3 to ${SOLID_SCRIPT_SWEEP_SIDES_MAX}.`,
      ),
      solidScriptParameterOptional(
        'profile',
        'Profile',
        'points2',
        'Optional: an x, y outline swept instead of the circle, written as vectors whose z is ignored, such as [0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0].',
      ),
      solidScriptParameter('closed', 'Closed', 'boolean', 'No', 'Yes: join the last point back to the first.'),
      solidScriptParameter('mesh', 'As Mesh', 'boolean', 'No', 'Yes: build one mesh. No: one solid per stretch.'),
    ],
    listing: (read) => [
      'Curve To Mesh',
      'along ',
      read.value('path'),
      ...solidScriptListingOptions([
        read.changed('profile') ? ['Profile ', read.value('profile')] : ['Radius ', read.value('radius')],
        read.on('closed') && ['Closed'],
        read.on('mesh') && ['As Mesh'],
      ]),
    ],
    execute: (run) => {
      const path = (run.value('path') as number[][]).map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const profile = solidScriptSweepProfile(run);
      const fields = run.fields();
      const closed = fields.flag('closed');
      const rings = solidScriptPathSweep(path, profile, closed);
      if (fields.flag('mesh')) return run.mesh(solidScriptPathMesh(rings, closed, 'Curve To Mesh'));
      return rings.slice(1).flatMap((ring, index) => run.solid([...rings[index]!, ...ring]));
    },
  }),
];
