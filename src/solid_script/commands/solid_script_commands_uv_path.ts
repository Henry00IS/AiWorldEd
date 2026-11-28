import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import { solidScriptUvsSize, solidScriptUvsWriteLeaf } from './solid_script_commands_uvs.js';
import { SOLID_SCRIPT_UV_PROJECT_OF, SOLID_SCRIPT_UV_PROJECT_SIZE } from './solid_script_commands_uv_project.js';
import {
  solidScriptUvPathSpace,
  solidScriptUvPathSurfaces,
  type SolidScriptUvPathSpace,
} from './solid_script_uv_path.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptValueTruthy } from '@/solid_script/language/solid_script_value.js';

/** Label of the block, for messages. */
const SOLID_SCRIPT_UV_PATH_LABEL = 'Project Path UVs';

/** Runs the texture along a path, U along it and V across it. */
export const SOLID_SCRIPT_COMMAND_UV_PATH = new SolidScriptCommand({
  id: 'project_path_uvs',
  edits: true,
  label: SOLID_SCRIPT_UV_PATH_LABEL,
  category: 'UVs',
  description: 'Run a texture along a path and across it',
  synonyms: ['project uvs', 'uv along path', 'texture along curve', 'follow path uvs'],
  manual: `Gives faces texture coordinates that run along Path and across it, the way the built-in swept generators such as Torus, Pipe and Curved Stairs texture theirs, so the texture flows from one solid to the next. Path lists the points the shape follows, one where each solid starts and ends, so it has one point more than there are solids; give the solids in Of in the same order. Each solid joins the cross-section at its two path points. Tube Yes wraps the texture around a round cross-section in whole repeats, such as a ring; No keeps walls upright and level faces flat, such as stairs. A path that closes on itself gets whole repeats along it so the seam closes. An empty Path changes nothing. Size is about the metres of one texture repeat. ${SOLID_SCRIPT_UV_PROJECT_OF} Example: build each slice of a ring as a Polyhedron, add its start point to a list, then Project Path UVs Path [Points] Tube Yes Of [Slices].`,
  stops: [
    'No faces.',
    'A Size of 0 or less.',
    'A Path with fewer points than the solids plus one.',
    'A solid that does not join two matching cross-sections at its path points.',
  ],
  parameters: [
    SOLID_SCRIPT_UV_PROJECT_SIZE,
    solidScriptParameter(
      'path',
      'Path',
      'points3',
      '',
      'Points the shape follows, one where each solid starts and ends, such as [Points].',
    ),
    solidScriptParameter(
      'tube',
      'Tube',
      'boolean',
      'No',
      'Yes: wrap around a round cross-section, such as a ring. No: keep walls upright and floors flat. Type Yes or No.',
    ),
    solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
    solidScriptParameterOf('objects in path order', '$Selected.Faces'),
  ],
  listing: (read) => [SOLID_SCRIPT_UV_PATH_LABEL, ' Size ', read.value('size'), ...solidScriptListingOf(read)],
  execute: (run) => {
    solidScriptUvsPath(run, solidScriptFaceTargets(run, SOLID_SCRIPT_UV_PATH_LABEL));
    return [];
  },
});

/**
 * Runs the texture of the given faces along Path and writes it onto each solid.
 * An empty Path leaves the faces as they are.
 *
 * @param run Running line.
 * @param faces Faces to map; their solids, in order, follow the path.
 */
function solidScriptUvsPath(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const size = solidScriptUvsSize(run, SOLID_SCRIPT_UV_PATH_LABEL);
  const tube = solidScriptValueTruthy(run.value('tube'));
  const path = (run.value('path') as number[][]).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
  const groups = solidScriptFaceGroups(faces, (face) => face.leaf);
  if (path.length === 0) {
    for (const leaf of groups.keys()) run.leafReplace(leaf, { ...run.leafLatest(leaf) });
    return;
  }
  const leaves = [...groups.keys()].filter((leaf): leaf is SolidScriptShapeSolid => leaf.kind === 'solid');
  if (leaves.length < groups.size) throw new Error(`${SOLID_SCRIPT_UV_PATH_LABEL} works on solids, not meshes`);
  const space = solidScriptUvPathSpace(leaves, path, size, tube);
  leaves.forEach((leaf, index) => solidScriptUvsPathWrite(run, leaf, groups.get(leaf) ?? [], space, index));
}

/**
 * Writes the along-path texture of one solid's faces.
 *
 * @param run Running line.
 * @param leaf Solid.
 * @param faces Faces of the solid to map.
 * @param space Path the solids follow.
 */
function solidScriptUvsPathWrite(
  run: SolidScriptBlockRun,
  leaf: SolidScriptShapeSolid,
  faces: readonly SolidScriptFaceFacts[],
  space: SolidScriptUvPathSpace,
  index: number,
): void {
  const lookup = solidScriptUvPathSurfaces(leaf, space, index);
  solidScriptUvsWriteLeaf(run, leaf, faces, (face) => {
    const mapped = lookup(face);
    if (!mapped) throw new Error(`${SOLID_SCRIPT_UV_PATH_LABEL} could not place a face on the path`);
    return mapped;
  });
}
