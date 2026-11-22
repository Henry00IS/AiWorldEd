import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/**
 * Reads the Angle of a Shade Smooth line.
 *
 * @param run Running line.
 * @returns Degrees, 0 to 180.
 */
function solidScriptShadeSmoothAngle(run: SolidScriptBlockRun): number {
  const angle = run.fields().number('angle', 60);
  if (!(angle >= 0 && angle <= 180)) throw new Error(`Angle must be 0 to 180 degrees, not ${angle}`);
  return angle;
}

/**
 * Gives the faces of a Shade Smooth line their smooth shading.
 *
 * @param run Running line.
 * @returns Nothing new in the result.
 */
function solidScriptShadeSmoothRun(run: SolidScriptBlockRun): [] {
  const angle = solidScriptShadeSmoothAngle(run);
  const targets = solidScriptFaceTargets(run, 'Shade Smooth', 'objects');
  for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf)) {
    if (leaf.kind !== 'solid') throw new Error('Shade Smooth works on solids for now, not meshes');
    const added = faces.map((face) => ({ point: face.center.clone(), normal: face.normal.clone(), angle }));
    run.leafReplace(leaf, { ...leaf, faceSmooth: [...(leaf.faceSmooth ?? []), ...added] });
  }
  return [];
}

/** Shade Smooth: soft shading across the edges between faces. */
export const SOLID_SCRIPT_COMMANDS_SHADING: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'shade_smooth',
    edits: true,
    label: 'Shade Smooth',
    category: 'Faces',
    description: 'Shade faces smooth, keeping sharp edges hard',
    manual:
      'Shades faces smoothly into each other, so a round shape built of flat faces looks round. Faces that meet at less than Angle degrees blend; sharper edges stay hard, so 60 smooths a Cylinder but keeps its rim. Angle 0 makes faces flat again, and 180 smooths every edge. Of gives the objects, or single faces; empty uses [$Selected.Objects]. The 🔁 Where keeps the faces it holds for, such as [=Abs([$Face.Normal.Y]) < 0.5] for the sides only. Smooth solids blend with each other where they meet, so a shape made of several pieces looks like one. It works on solids, and the faces keep it when the solid is moved, turned or scaled. Example: Sphere, Select Objects, Shade Smooth.',
    stops: [
      'No objects or faces.',
      'Faces of a mesh. Shade Smooth works on solids for now.',
      'An Angle below 0 or above 180.',
    ],
    parameters: [
      solidScriptParameter(
        'angle',
        'Angle',
        'number',
        '60',
        'Faces meeting at less than this many degrees shade smoothly, such as 30. 0 keeps them flat.',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] < 0.5]'),
      solidScriptParameterOf('objects or faces', '$Selected.Objects'),
    ],
    listing: (read) => [
      'Shade Smooth',
      ...(read.changed('angle') ? [' Angle ', read.value('angle')] : []),
      ...(read.text('where') === '' ? [] : [' Where ', read.value('where')]),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => solidScriptShadeSmoothRun(run),
  }),
];
