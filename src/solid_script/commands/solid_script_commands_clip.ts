import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptBrushTargets } from './solid_script_brush_of.js';
import { solidScriptClipLeaf, solidScriptClipPlane } from '@/solid_script/language/solid_script_clip.js';

/** Commands that cut existing brushes and meshes with a plane. */
export const SOLID_SCRIPT_COMMANDS_CLIP: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'clip',
    edits: true,
    label: 'Clip',
    category: 'Transforms',
    description: 'Cut objects with a plane',
    manual:
      'Cuts the objects in Of, or [$Selected.Objects] when Of is empty, with a plane. Through is a point on the plane. Normal is the way the part you cut away faces; the part on the other side stays. A solid stays a convex solid. A mesh stays a mesh, and a closed mesh gets a new face over the cut. The faces Clip makes over the cut get the tag Cut, so a later Where can pick them with [=HasTag([$Face.Tags], "Cut")] or skip them. Without Into the cut happens where the solid already is; with Into the original stays and the clipped copy is only in that variable. Example: Cube, then Clip Through 0, 0, 0 Normal 0, 1, 0 keeps the lower half.',
    stops: [
      'No solids.',
      'A Through or Normal that is not x, y, z.',
      'A Normal of 0, 0, 0.',
      'A plane that cuts an object away entirely, or leaves it flat.',
    ],
    parameters: [
      solidScriptParameter(
        'through',
        'Through',
        'vector3',
        '0, 0, 0',
        'A point on the plane, in metres, such as 0, 1, 0.',
      ),
      solidScriptParameter(
        'normal',
        'Normal',
        'vector3',
        '0, 1, 0',
        'The way the part you cut away faces, such as 0, 1, 0 to cut away the top.',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('objects', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Clip',
      ' Through ',
      read.value('through'),
      ' Normal ',
      read.value('normal'),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const plane = solidScriptClipPlane(run);
      for (const leaf of solidScriptBrushTargets(run, 'Clip')) {
        const clipped = solidScriptClipLeaf(run.leafLatest(leaf), plane, 'Clip');
        if (clipped !== leaf) run.leafReplace(leaf, clipped);
      }
      return [];
    },
  }),
];
