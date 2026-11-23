import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWhen,
  solidScriptParameterWrites,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWriteValue } from './solid_script_face_of.js';
import { solidScriptFaceEach } from './solid_script_face_each.js';
import {
  solidScriptFindOn,
  solidScriptFindWord,
  type SolidScriptFindFound,
  type SolidScriptFindHit,
} from '@/solid_script/language/solid_script_find.js';
import {
  SOLID_SCRIPT_FIND_BLENDS,
  solidScriptFindBlendValues,
  solidScriptFindCornerWeights,
} from '@/solid_script/language/solid_script_find_blend.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptFaceCornersOfFace } from '@/solid_script/language/solid_script_members_face_corner.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
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
    category: 'Data',
    description: 'Find the closest point on faces, or the first hit along a ray',
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and writes what it finds. How Closest (the default) picks the nearest point to From on any of those faces. Target, for Closest, measures to the face surfaces (Faces, the default), their edges (Edges) or their corners (Corners). Along Ray follows Direction from From and picks the first face it meets. At UV reads the first two numbers of From as texture coordinates and finds the first face whose UVs hold them, blending its corners into the point; overlapping UVs give the first face. A find further than Max Distance is a miss. Sample is read on the face found, with [$Face], and written to Sampled, such as [=[$Face.Texture]]. Blend Corners reads Sample at every corner of that face instead, with [$FaceCorner], and blends the numbers or vectors by where the point lies, such as [=[$FaceCorner.UV]] for the texture coordinates there. Into gets the point, Distance how far it is, Normal the way the face looks, Face the face, and Hit whether a face was found. A list of points in From, or of directions in Direction, finds once per item: then Into, Distance, Normal and Hit are lists with one entry per item (a miss gives 0, 0, 0, 0 and No), and Face gets the faces that were hit. Example: Cube, Select Faces All, Find On Closest From 0, 2, 0 Into [Spot] Face [Top] Hit [Found].',
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
        'How to look: Closest for the nearest point to From, Along Ray for the first face the ray meets, or At UV for the point whose texture coordinates are the first two numbers of From. Type Closest, Along Ray or At UV, such as Closest.',
        [
          { word: 'Closest', detail: 'The nearest point to From on any face' },
          {
            word: 'Along Ray',
            detail: 'The first face the ray from From along Direction meets',
          },
          { word: 'At UV', detail: 'The point whose texture coordinates are the U and V of From' },
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
      solidScriptParameterWhen(
        solidScriptParameterWords(
          'target',
          'Target',
          'text',
          'Faces',
          'What Closest measures to: Faces for the nearest point on a face, Edges for the nearest point on a face edge, or Corners for the nearest corner. Type Faces, Edges or Corners, such as Faces.',
          [
            { word: 'Faces', detail: 'The nearest point on any face' },
            { word: 'Edges', detail: 'The nearest point on any face edge' },
            { word: 'Corners', detail: 'The nearest corner of any face' },
          ],
        ),
        'how',
        ['Closest'],
      ),
      solidScriptParameterOptional(
        'max_distance',
        'Max Distance',
        'number',
        'Furthest a find may be, in metres, such as 10; anything further is a miss. Empty finds at any distance.',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'sample',
          'Sample',
          'value',
          'A value read on the face found, written to Sampled, such as [=[$Face.Texture]] or [=[$Face.Data.Heat]]; a miss gives nothing.',
        ),
        'Face',
      ),
      solidScriptParameterWords(
        'blend',
        'Blend',
        'text',
        'Face',
        'How Sample is read: Face reads it once on the face found; Corners reads it at every corner of that face, with [$FaceCorner], and blends the numbers or vectors by how near the point lies to each corner. Type Face or Corners, such as Corners.',
        [
          { word: 'Face', detail: 'Read Sample once on the face found' },
          { word: 'Corners', detail: 'Read Sample at each corner and blend by where the point lies' },
        ],
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
      solidScriptParameterWrites(
        solidScriptParameterOptional(
          'sampled',
          'Sampled',
          'name',
          'Variable to write the Sample read on the face found to, one per item for a list, such as Ground; left off writes none.',
        ),
        { rule: 'value', field: 'sample', what: 'read on the face found by **{command}**' },
      ),
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
        ...(ray || ['', 'faces'].includes(read.text('target').trim().toLowerCase())
          ? []
          : [' Target ', read.value('target')]),
        ...(read.text('max_distance') === '' ? [] : [' Max Distance ', read.value('max_distance')]),
        ...(read.text('sample') === '' ? [] : [' Sample ', read.value('sample')]),
        ...(['', 'face'].includes(read.text('blend').trim().toLowerCase()) ? [] : [' Blend ', read.value('blend')]),
        ...solidScriptListingOf(read),
        ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
        ...(read.text('distance') === '' ? [] : [' Distance ', read.value('distance')]),
        ...(read.text('normal') === '' ? [] : [' Normal ', read.value('normal')]),
        ...(read.text('face') === '' ? [] : [' Face ', read.value('face')]),
        ...(read.text('hit') === '' ? [] : [' Hit ', read.value('hit')]),
        ...(read.text('sampled') === '' ? [] : [' Sampled ', read.value('sampled')]),
      ];
    },
    execute: (run) => {
      const found = solidScriptFindOn(run, solidScriptFaceTargets(run, 'Find On'));
      solidScriptFindWriteSample(run, found);
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

/**
 * Reads Sample on each face found, or blended from its corners with Blend
 * Corners, and writes it to Sampled: one value, or one per item when From or
 * Direction is a list; a miss gives an empty text.
 *
 * @param run Running line.
 * @param found What Find On found.
 */
function solidScriptFindWriteSample(run: SolidScriptBlockRun, found: SolidScriptFindFound): void {
  const corners = solidScriptFindWord(run, 'blend', SOLID_SCRIPT_FIND_BLENDS, 'Blend') === 'Corners';
  const sample = run.source('sample').trim();
  if (run.text('sampled').trim() === '' || sample === '') return;
  const faces = found.hits.flatMap((hit) => (hit.face ? [hit.face] : []));
  const read = corners ? solidScriptFindBlendRead(run) : solidScriptFaceEach(run, 'sample', faces);
  const values = found.hits.map((hit) => (hit.face ? read(hit.face, hit.position) : ''));
  solidScriptFaceWriteValue(run, 'sampled', found.listed ? values : (values[0] ?? ''));
}

/**
 * Reads Sample at every corner of a face, with [$Face] and [$FaceCorner], and
 * blends the results by how near the point lies to each corner.
 *
 * @param run Running line.
 * @returns Blended Sample for a face and a point on it.
 */
function solidScriptFindBlendRead(
  run: SolidScriptBlockRun,
): (face: SolidScriptFaceFacts, point?: THREE.Vector3) => SolidScriptValue {
  return (face, point) => {
    const corners = solidScriptFaceCornersOfFace(run.elements, face);
    const values = corners.map((corner, index) =>
      run.valueWith('sample', {
        $Face: run.elements.face(face),
        $FaceCorner: corner,
        $Index: index,
        $Count: corners.length,
      }),
    );
    return solidScriptFindBlendValues(values, solidScriptFindCornerWeights(face, point ?? face.corners[0]!));
  };
}
