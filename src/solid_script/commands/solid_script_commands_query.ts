import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWriteValue } from './solid_script_face_of.js';
import { solidScriptFindOn, type SolidScriptFindHit } from '@/solid_script/language/solid_script_find.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';

/**
 * Marks a result field of Find On as written once per item when From or
 * Direction is a list.
 *
 * @param parameter Result field.
 * @returns Field.
 */
function solidScriptFindEach(parameter: SolidScriptCommandParameter): SolidScriptCommandParameter {
  const writes = parameter.writes;
  if (!writes || writes.gives.rule !== 'kind') return parameter;
  return { ...parameter, writes: { ...writes, gives: { ...writes.gives, each: ['from', 'direction'] } } };
}

/** Face commands that look up or cut existing shapes. */
export const SOLID_SCRIPT_COMMANDS_QUERY: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'find_on',
    label: 'Find On',
    category: 'Faces',
    description: 'Find the closest point on faces, or the first hit along a ray',
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and writes what it finds. How Closest (the default) picks the nearest point to From on any of those faces. Along Ray follows Direction from From and picks the first face it meets. Into gets the point, Distance how far it is, Normal the way the face looks, Face the face, and Hit whether a face was found. A list of points in From, or of directions in Direction, finds once per item: then Into, Distance, Normal and Hit are lists with one entry per item (a miss gives 0, 0, 0, 0 and No), and Face gets the faces that were hit. Example: Cube, Select Faces All, Find On Closest From 0, 2, 0 Into [Spot] Face [Top] Hit [Found].',
    stops: [
      'No faces.',
      'A From or Direction that is not x, y, z.',
      'A Direction of 0, 0, 0, when How is Along Ray.',
      'Lists in From and Direction of different lengths.',
    ],
    parameters: [
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'Closest',
        'How to look: Closest for the nearest point to From, or Along Ray for the first face the ray meets. Type Closest or Along Ray, such as Closest.',
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
        'points3',
        '0, 0, 0',
        'Point to measure from, or the start of the ray, in metres, such as 0, 2, 0; a list of points, such as [Spots], finds once per point.',
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'direction',
          'Direction',
          'points3',
          '0, 1, 0',
          'The way the ray travels, when How is Along Ray, such as 0, -1, 0 to go down; a list, such as [Normals], casts one ray per direction.',
        ),
        'how',
        ['Along Ray'],
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
      solidScriptFindEach({
        ...solidScriptParameterInto('the hit point, a Vector', 'Vector', 'hit point', 'label'),
        hint: 'Variable to write the point to, a vector, such as Hit; left off writes none.',
      }),
      solidScriptFindEach({
        ...solidScriptParameterInto('how far the hit is, in metres, a Number', 'Number', 'distance', 'label'),
        key: 'distance',
        label: 'Distance',
      }),
      solidScriptFindEach({
        ...solidScriptParameterInto('the way the face looks, a Vector', 'Vector', 'face direction', 'label'),
        key: 'normal',
        label: 'Normal',
      }),
      {
        ...solidScriptParameterInto('the face that was hit, a Face', 'Face', 'hit face', 'label'),
        key: 'face',
        label: 'Face',
      },
      solidScriptFindEach({
        ...solidScriptParameterInto('whether a face was hit, a Yes/No', 'Yes/No', 'whether it hit', 'label'),
        key: 'hit',
        label: 'Hit',
      }),
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
        ...solidScriptListingOf(read),
        ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
        ...(read.text('distance') === '' ? [] : [' Distance ', read.value('distance')]),
        ...(read.text('normal') === '' ? [] : [' Normal ', read.value('normal')]),
        ...(read.text('face') === '' ? [] : [' Face ', read.value('face')]),
        ...(read.text('hit') === '' ? [] : [' Hit ', read.value('hit')]),
      ];
    },
    execute: (run) => {
      const found = solidScriptFindOn(run, solidScriptFaceTargets(run, 'Find On'));
      if (found.listed) return solidScriptFindWriteLists(run, found.hits);
      const [hit] = found.hits;
      solidScriptFaceWriteValue(run, 'hit', hit?.hit ?? false);
      if (hit?.hit && hit.position && hit.distance !== undefined && hit.normal && hit.face) {
        solidScriptFaceWriteValue(run, 'into', solidScriptMemberVector(hit.position));
        solidScriptFaceWriteValue(run, 'distance', hit.distance);
        solidScriptFaceWriteValue(run, 'normal', solidScriptMemberVector(hit.normal));
        solidScriptFaceWriteValue(run, 'face', run.elements.face(hit.face));
        run.selectedSet('faces', [run.elements.face(hit.face)]);
      }
      return [];
    },
  }),
];

/**
 * Writes the finds of a list, one entry per item: a miss gives 0, 0, 0, a
 * distance of 0 and Hit No; Face gets the faces that were hit, which also
 * become [$Selected.Faces].
 *
 * @param run Running line.
 * @param hits One find per item.
 * @returns No new shapes.
 */
function solidScriptFindWriteLists(run: SolidScriptBlockRun, hits: readonly SolidScriptFindHit[]): [] {
  const zero = new THREE.Vector3();
  solidScriptFaceWriteValue(
    run,
    'hit',
    hits.map((hit) => hit.hit),
  );
  solidScriptFaceWriteValue(
    run,
    'into',
    hits.map((hit) => solidScriptMemberVector(hit.position ?? zero)),
  );
  solidScriptFaceWriteValue(
    run,
    'distance',
    hits.map((hit) => hit.distance ?? 0),
  );
  solidScriptFaceWriteValue(
    run,
    'normal',
    hits.map((hit) => solidScriptMemberVector(hit.normal ?? zero)),
  );
  const faces = hits.flatMap((hit) => (hit.face ? [run.elements.face(hit.face)] : []));
  solidScriptFaceWriteValue(run, 'face', faces);
  run.selectedSet('faces', faces);
  return [];
}
