import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import { solidScriptUvsBoxMap } from '@/solid_script/language/solid_script_uvs.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/** Box UVs, a face command that keeps brushes as brushes. */
export const SOLID_SCRIPT_COMMANDS_BOX_UVS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'box_uvs',
    edits: true,
    label: 'Box UVs',
    category: 'Faces',
    description: 'Give faces even texture coordinates, as if wrapped in a box',
    manual:
      'Gives the faces Select Faces picked, or those in Of, texture coordinates projected from the side each face faces most, like wrapping it in a box of texture, so the texture keeps one size everywhere. Empty Of uses [$Selected.Faces]. Brushes stay convex brushes; meshes stay meshes. Size is how many metres one texture repeat covers. Example: Cube, Select Faces All, Box UVs with size 2 shows the texture every two metres on each side.',
    stops: ['No faces.', 'A Size of 0 or less.'],
    parameters: [
      solidScriptParameter('size', 'Size', 'number', '1', 'Metres covered by one texture repeat, such as 1.'),
      solidScriptParameterOf('faces, brushes or meshes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Box UVs',
      'Size ',
      read.value('size'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      const size = solidScriptValueNumber(run.value('size'));
      if (size === undefined || !Number.isFinite(size)) throw new Error('Size must give a number');
      if (!(size > 0)) throw new Error(`Size must be greater than 0, not ${size}`);
      for (const [leaf, group] of solidScriptFaceGroups(solidScriptFaceTargets(run, 'Box UVs'), (face) => face.leaf)) {
        run.leafReplace(leaf, solidScriptUvsBoxMap(run.leafLatest(leaf), group, size));
      }
      return [];
    },
  }),
];
