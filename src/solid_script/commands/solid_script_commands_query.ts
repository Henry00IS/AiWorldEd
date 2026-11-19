import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWriteValue } from './solid_script_face_of.js';
import { solidScriptFindOn } from '@/solid_script/language/solid_script_find.js';
import { solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';

/** Face commands that look up or cut existing shapes. */
export const SOLID_SCRIPT_COMMANDS_QUERY: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'find_on',
    label: 'Find On',
    category: 'Faces',
    description: 'Find the closest point on faces, or the first hit along a ray',
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and writes what it finds. How Closest (the default) picks the nearest point to From on any of those faces. Along Ray follows Direction from From and picks the first face it meets. Into gets the point, Distance how far it is, Normal the way the face looks, Face the face, and Hit whether a face was found. Example: Cube, Select Faces All, Find On Closest From 0, 2, 0 Into [Spot] Face [Top] Hit [Found].',
    stops: ['No faces.', 'A From or Direction that is not x, y, z.', 'A Direction of 0, 0, 0, when How is Along Ray.'],
    parameters: [
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'Closest',
        'How to look: Closest for the nearest point to From, or Along Ray for the first face the ray meets.',
        [
          { word: 'Closest', detail: 'The nearest point to From on any face' },
          {
            word: 'Along Ray',
            detail: 'The first face the ray from From along Direction meets',
          },
        ],
      ),
      solidScriptParameter(
        'from',
        'From',
        'vector3',
        '0, 0, 0',
        'Point to measure from, or the start of the ray, in metres.',
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'direction',
          'Direction',
          'vector3',
          '0, 1, 0',
          'The way the ray travels, when How is Along Ray.',
        ),
        'how',
        ['Along Ray'],
      ),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
      {
        ...solidScriptParameterInto('the hit point, a Vector', 'Vector', 'hit point'),
        hint: 'Variable to write the point to, a vector. Empty writes none.',
      },
      {
        ...solidScriptParameterInto('how far the hit is, in metres, a Number', 'Number', 'distance'),
        key: 'distance',
        label: 'Distance',
      },
      {
        ...solidScriptParameterInto('the way the face looks, a Vector', 'Vector', 'face direction'),
        key: 'normal',
        label: 'Normal',
      },
      { ...solidScriptParameterInto('the face that was hit, a Face', 'Face', 'hit face'), key: 'face', label: 'Face' },
      {
        ...solidScriptParameterInto('whether a face was hit, a Yes/No', 'Yes/No', 'whether it hit'),
        key: 'hit',
        label: 'Hit',
      },
    ],
    listing: (read) => {
      const how = read.text('how').trim();
      const ray = how.toLowerCase() === 'along ray';
      return [
        'Find On',
        ...(how === '' || how.toLowerCase() === 'closest' ? [] : [' ', read.value('how')]),
        ' From ',
        read.value('from'),
        ...(ray ? [' Direction ', read.value('direction')] : []),
        ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
        ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
        ...(read.text('distance') === '' ? [] : [' Distance ', read.variable('distance')]),
        ...(read.text('normal') === '' ? [] : [' Normal ', read.variable('normal')]),
        ...(read.text('face') === '' ? [] : [' Face ', read.variable('face')]),
        ...(read.text('hit') === '' ? [] : [' Hit ', read.variable('hit')]),
      ];
    },
    execute: (run) => {
      const found = solidScriptFindOn(run, solidScriptFaceTargets(run, 'Find On'));
      solidScriptFaceWriteValue(run, 'hit', found.hit);
      if (found.hit && found.position && found.distance !== undefined && found.normal && found.face) {
        solidScriptFaceWriteValue(run, 'into', solidScriptMemberVector(found.position));
        solidScriptFaceWriteValue(run, 'distance', found.distance);
        solidScriptFaceWriteValue(run, 'normal', solidScriptMemberVector(found.normal));
        solidScriptFaceWriteValue(run, 'face', run.elements.face(found.face));
        run.selectedSet('faces', [run.elements.face(found.face)]);
      }
      return [];
    },
  }),
];
