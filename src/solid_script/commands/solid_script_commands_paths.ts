import * as THREE from 'three';
import { solidScriptBodyPrism } from '@/solid_script/language/solid_script_body.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOptional } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathMesh, solidScriptPathSweep } from '@/solid_script/language/solid_script_path.js';
import {
  solidScriptPolygonArea,
  solidScriptPolygonConvexIndices,
  type SolidScriptPoint2,
} from '@/solid_script/language/solid_script_polygon.js';
import { solidScriptSweepScaled, solidScriptSweepUps } from '@/solid_script/language/solid_script_sweep_scale.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import {
  solidScriptPathSample,
  solidScriptPathSampleNormals,
  solidScriptPathSampleTilts,
} from '@/solid_script/language/solid_script_path_model.js';
import { SolidScriptPathElement } from '@/solid_script/language/solid_script_value.js';

/** Most sides of a round Sweep Along Path profile. */
const SOLID_SCRIPT_SWEEP_SIDES_MAX = 64;

/**
 * Reads the profile: the listed points, or a round one of Radius and Sides.
 *
 * @param run Running line.
 * @returns Profile corners, counter-clockwise.
 */
function solidScriptSweepProfile(run: SolidScriptBlockRun): THREE.Vector2[] {
  const listed = run.value('profile') as number[][];
  if (listed.length > 0) {
    if (listed.length < 3) throw new Error(`Profile needs at least 3 points, not ${listed.length}`);
    const flat = listed.map(([x = 0, y = 0]): SolidScriptPoint2 => [x, y]);
    if (Math.abs(solidScriptPolygonArea(flat)) <= 1e-12)
      throw new Error('Profile encloses nothing to sweep; give it corners that do not all lie on one line');
    const corners = flat.map(([x, y]) => new THREE.Vector2(x, y));
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
    id: 'sweep_along_path',
    builtKind: 'Mesh',
    named: true,
    label: 'Sweep Along Path',
    category: 'Paths',
    description: 'Sweep a profile along a path',
    manual:
      'Sweeps a flat profile along a Path, like a pipe, rail or moulding. The profile is a circle of Radius and Sides, or the x, y points in Profile, where x runs to the side of the path and y up. Scale sizes the profile at each path point, worked out once per point with [$Point], [$Index] and [$Count], so a horn or a vine can taper, and Twist turns it by that many degrees about the path at each point, so a rope or a twisted bar spirals. Up is the way the up side of the profile faces on the stretch from each path point, also worked out per point, such as 0, 1, 0 to keep a rail level on a winding path; left off, the profile turns as little as it can from one stretch to the next; a twisted stretch bends its sides, so As Mesh suits Twist best. Each stretch of the path becomes one solid, and the joints are cut on the mitre between two stretches so the pieces meet exactly. A dented profile splits into convex pieces as a solid; with As Mesh on, the whole sweep is one mesh instead and keeps any profile, and Fill Caps off leaves the ends of an open path open, like a tube. A closed Path, such as a Square or a Path with Closed on, joins its last point back to the first; a list of points stays open. Example: a Path, or Resample of a few points, Radius 0.05, gives a round handrail.',
    stops: [
      'A Path with fewer than 2 different points, or 3 when it is closed.',
      'A Profile with fewer than 3 points, or points that are not x, y.',
      `Sides below 3 or above ${SOLID_SCRIPT_SWEEP_SIDES_MAX}, or a Radius that is not above 0.`,
      'A Scale below 0.',
    ],
    parameters: [
      solidScriptParameter(
        'path',
        'Path',
        'points3',
        '[0, 0, 0], [1, 0, 0], [2, 1, 0]',
        'The Path the profile follows, or a list of points, such as [Path].',
      ),
      solidScriptParameter('radius', 'Radius', 'number', '0.1', 'Radius of the round profile in metres, such as 0.1.'),
      solidScriptParameter(
        'sides',
        'Sides',
        'count',
        '8',
        `Sides of the round profile, 3 to ${SOLID_SCRIPT_SWEEP_SIDES_MAX}, such as 8.`,
      ),
      solidScriptParameterOptional(
        'profile',
        'Profile',
        'points2',
        'Optional: a closed 2D Path such as [Ring], or x, y points such as [0, 0], [0.2, 0], [0.2, 0.1]; a third number of a point is ignored.',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'scale',
          'Scale',
          'number',
          '1',
          'Size of the profile at each path point, 1 as it is, such as 0.5 or [=1 - [$Index] / [$Count]] to taper toward the end.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'twist',
          'Twist',
          'number',
          '0',
          'Degrees the profile turns about the path at each path point, such as 90 or [=[$Index] * 15] for a twisted rope.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        {
          ...solidScriptParameterOptional(
            'up',
            'Up',
            'vector3',
            "Way the profile's up side faces on the stretch from each path point, such as 0, 0, 1. Left off, the profile turns as little as it can along the path.",
          ),
          direction: true,
        },
        'Point',
      ),
      solidScriptParameter(
        'mesh',
        'As Mesh',
        'boolean',
        'No',
        'Yes: build one mesh. No: one solid per stretch. Type Yes or No, such as Yes.',
      ),
      solidScriptParameter(
        'caps',
        'Fill Caps',
        'boolean',
        'Yes',
        'With As Mesh, Yes: close both ends of an open path with a face. No: leave the mesh open there, like a tube. Type Yes or No, such as No.',
      ),
    ],
    listing: (read) => [
      'Sweep Along Path',
      'Along ',
      read.value('path'),
      ...solidScriptListingOptions([
        read.changed('profile') ? ['Profile ', read.value('profile')] : ['Radius ', read.value('radius')],
        read.changed('scale') && ['Scale ', read.value('scale')],
        read.changed('twist') && ['Twist ', read.value('twist')],
        read.text('up').trim() !== '' && ['Up ', read.value('up')],
        read.on('mesh') && ['As Mesh'],
        read.on('mesh') && !read.on('caps') && ['Open Ends'],
      ]),
    ],
    execute: (run) => {
      const given = run.values('path');
      const drawn = given.length === 1 && given[0] instanceof SolidScriptPathElement ? given[0] : undefined;
      const points = drawn ? solidScriptPathSample(drawn.path) : (run.value('path') as number[][]);
      const path = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const profile = solidScriptSweepProfile(run);
      const closed = drawn?.path.closed ?? false;
      const rings = solidScriptSweepScaled(
        run,
        solidScriptPathSweep(
          path,
          profile,
          closed,
          solidScriptSweepUps(run, path, closed, drawn ? solidScriptPathSampleNormals(drawn.path) : undefined),
        ),
        path,
        closed,
        drawn ? solidScriptPathSampleTilts(drawn.path) : [],
      );
      if (run.fields().flag('mesh'))
        return run.mesh(solidScriptPathMesh(rings, closed, 'Sweep Along Path', run.fields().flag('caps')));
      const parts = solidScriptPolygonConvexIndices(profile.map((point): SolidScriptPoint2 => [point.x, point.y]));
      return rings.slice(1).flatMap((ring, index) => {
        const before = rings[index];
        if (!before) return [];
        return parts.flatMap((part) =>
          run.solid(
            solidScriptBodyPrism(
              part.map((corner) => before[corner]!),
              part.map((corner) => ring[corner]!),
              'Sweep Along Path',
            ),
          ),
        );
      });
    },
  }),
];
