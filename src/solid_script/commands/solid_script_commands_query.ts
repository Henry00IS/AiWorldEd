import {
  solidScriptListingOf,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWrites,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWriteValue } from './solid_script_face_of.js';
import { solidScriptFaceEach } from './solid_script_face_each.js';
import {
  solidScriptFindOn,
  solidScriptFindWord,
  type SolidScriptFindFound,
  type SolidScriptFindHow,
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

/** What differs between the three find blocks. */
interface SolidScriptFindSpec {
  id: string;
  label: string;
  how: SolidScriptFindHow;
  description: string;
  synonyms: readonly string[];
  manual: string;
  stops: readonly string[];
  /** Fields that say where to look, such as From and Direction. */
  look: readonly SolidScriptCommandParameter[];
  /** Fields whose lists find once per item. */
  each: readonly string[];
  /** Whether the find has a distance, so Max Distance and Distance apply. */
  measured: boolean;
}

/**
 * Marks a result field as written once per item when a looking field is a list.
 *
 * @param parameter Result field.
 * @param each Keys of the looking fields.
 * @returns Field.
 */
function solidScriptFindEach(
  parameter: SolidScriptCommandParameter,
  each: readonly string[],
): SolidScriptCommandParameter {
  const writes = parameter.writes;
  if (!writes || writes.gives.rule !== 'kind') return parameter;
  return { ...parameter, writes: { ...writes, gives: { ...writes.gives, each: [...each] } } };
}

/** The point a find block starts from, in metres. */
const SOLID_SCRIPT_FIND_FROM = solidScriptParameter(
  'from',
  'From',
  'points3',
  '0, 0, 0',
  'Point to look from, in metres, such as 0, 2, 0; a list of points, such as [Spots], finds once per point.',
);

/** Text every find block's manual ends with. */
const SOLID_SCRIPT_FIND_MANUAL_END =
  'Sample is read on the face found, with [$Face], and written to Sampled, such as [=[$Face.Texture]]. Blend Corners reads Sample at every corner of that face instead, with [$FaceCorner], and blends the numbers or vectors by where the point lies, such as [=[$FaceCorner.UV]] for the texture coordinates there. Into gets the point, Normal the way the face looks, Face the face, and Hit whether a face was found. A list finds once per item: then Into, Normal and Hit are lists with one entry per item (a miss gives 0, 0, 0 and No), and Face gets the faces that were hit.';

/**
 * Sample and Blend: what a find block reads on the face it found.
 *
 * @returns Fields.
 */
function solidScriptFindSampleFields(): SolidScriptCommandParameter[] {
  return [
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
  ];
}

/** Where a find block writes the Sample read on the face it found. */
const SOLID_SCRIPT_FIND_SAMPLED = solidScriptParameterWrites(
  solidScriptParameterOptional(
    'sampled',
    'Sampled',
    'name',
    'Variable to write the Sample read on the face found to, one per item for a list, such as Ground; left off writes none.',
  ),
  { rule: 'value', field: 'sample', what: 'read on the face found by **{command}**' },
);

/**
 * Into, Distance, Normal, Face, Hit and Sampled: what a find block writes.
 *
 * @param spec Find block.
 * @returns Fields.
 */
function solidScriptFindResultFields(spec: SolidScriptFindSpec): SolidScriptCommandParameter[] {
  const each = (parameter: SolidScriptCommandParameter) => solidScriptFindEach(parameter, spec.each);
  const into = (what: string, kind: string, detail: string) => solidScriptParameterInto(what, kind, detail, 'label');
  return [
    each({
      ...into('the hit point, a Vector', 'Vector', 'hit point'),
      hint: 'Variable to write the point to, a vector, such as Hit; left off writes none.',
    }),
    ...(spec.measured
      ? [
          each({
            ...into('how far the hit is, in metres, a Number', 'Number', 'distance'),
            key: 'distance',
            label: 'Distance',
          }),
        ]
      : []),
    each({ ...into('the way the face looks, a Vector', 'Vector', 'face direction'), key: 'normal', label: 'Normal' }),
    { ...into('the face that was hit, a Face', 'Face', 'hit face'), key: 'face', label: 'Face' },
    each({ ...into('whether a face was hit, a Yes/No', 'Yes/No', 'whether it hit'), key: 'hit', label: 'Hit' }),
    SOLID_SCRIPT_FIND_SAMPLED,
  ];
}

/**
 * Every field of a find block, in order.
 *
 * @param spec Find block.
 * @returns Fields.
 */
function solidScriptFindFields(spec: SolidScriptFindSpec): SolidScriptCommandParameter[] {
  const limit = solidScriptParameterOptional(
    'max_distance',
    'Max Distance',
    'number',
    'Furthest a find may be, in metres, such as 10; anything further is a miss. Empty finds at any distance.',
  );
  return [
    ...spec.look,
    ...(spec.measured ? [limit] : []),
    ...solidScriptFindSampleFields(),
    solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
    solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ...solidScriptFindResultFields(spec),
  ];
}

/** Result keys a find block lists when they are not empty, after Of. */
const SOLID_SCRIPT_FIND_RESULTS = [
  ['into', 'Into'],
  ['distance', 'Distance'],
  ['normal', 'Normal'],
  ['face', 'Face'],
  ['hit', 'Hit'],
  ['sampled', 'Sampled'],
] as const;

/**
 * Lists a find line: its name, the looking fields, then the fields that are
 * set.
 *
 * @param spec Find block.
 * @param read Line values.
 * @returns Listing pieces.
 */
function solidScriptFindListing(spec: SolidScriptFindSpec, read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const set = (key: string, label: string) => (read.text(key) === '' ? [] : [` ${label} `, read.value(key)]);
  const look = spec.look.flatMap((field) =>
    field.key === 'target' && ['', 'faces'].includes(read.text('target').trim().toLowerCase())
      ? []
      : [` ${field.label} `, read.value(field.key)],
  );
  return [
    spec.label,
    ...look,
    ...(spec.measured ? set('max_distance', 'Max Distance') : []),
    ...set('sample', 'Sample'),
    ...(['', 'face'].includes(read.text('blend').trim().toLowerCase()) ? [] : [' Blend ', read.value('blend')]),
    ...solidScriptListingOf(read),
    ...SOLID_SCRIPT_FIND_RESULTS.flatMap(([key, label]) => set(key, label)),
  ];
}

/**
 * Runs a find line and writes what it found.
 *
 * @param spec Find block.
 * @param run Running line.
 * @returns No new shapes.
 */
function solidScriptFindExecute(spec: SolidScriptFindSpec, run: SolidScriptBlockRun): [] {
  const found = solidScriptFindOn(run, solidScriptFaceTargets(run, spec.label), spec.how);
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
}

/**
 * Builds one find block from what makes it different.
 *
 * @param spec Find block.
 * @returns Command.
 */
function solidScriptFindCommand(spec: SolidScriptFindSpec): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    label: spec.label,
    category: 'Points',
    description: spec.description,
    synonyms: spec.synonyms,
    manual: `${spec.manual} ${SOLID_SCRIPT_FIND_MANUAL_END}`,
    stops: ['No faces.', ...spec.stops],
    parameters: solidScriptFindFields(spec),
    listing: (read) => solidScriptFindListing(spec, read),
    execute: (run) => solidScriptFindExecute(spec, run),
  });
}

/** Face commands that look up or cut existing shapes. */
export const SOLID_SCRIPT_COMMANDS_QUERY: readonly SolidScriptCommand[] = [
  solidScriptFindCommand({
    id: 'find_closest',
    label: 'Find Closest',
    how: 'Closest',
    description: 'Find the closest point on faces, their edges or their corners',
    synonyms: ['nearest', 'closest point', 'snap', 'find on'],
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and finds the point on them closest to From. Target measures to the face surfaces (Faces, the default), their edges (Edges) or their corners (Corners). A find further than Max Distance is a miss; Distance gets how far it is. Example: Cube, Select Faces All, Find Closest From 0, 2, 0 Into [Spot] Face [Top] Hit [Found].',
    stops: ['A From that is not x, y, z.'],
    look: [
      SOLID_SCRIPT_FIND_FROM,
      solidScriptParameterWords(
        'target',
        'Target',
        'text',
        'Faces',
        'What to measure to: Faces for the nearest point on a face, Edges for the nearest point on a face edge, or Corners for the nearest corner. Type Faces, Edges or Corners, such as Faces.',
        [
          { word: 'Faces', detail: 'The nearest point on any face' },
          { word: 'Edges', detail: 'The nearest point on any face edge' },
          { word: 'Corners', detail: 'The nearest corner of any face' },
        ],
      ),
    ],
    each: ['from'],
    measured: true,
  }),
  solidScriptFindCommand({
    id: 'raycast',
    label: 'Raycast',
    how: 'Raycast',
    description: 'Find the first face a ray hits',
    synonyms: ['ray', 'cast', 'shoot', 'drop', 'hit', 'find on'],
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and sends a ray from From along Direction, finding the first face it meets. A hit further than Max Distance is a miss; Distance gets how far it is. Give Direction a list, such as [Normals], to cast one ray per direction. Example: Raycast From [Spots] Direction 0, -1, 0 Into [Ground] to drop every point onto the floor below.',
    stops: [
      'A From or Direction that is not x, y, z.',
      'A Direction of 0, 0, 0.',
      'Lists in From and Direction of different lengths.',
    ],
    look: [
      {
        ...SOLID_SCRIPT_FIND_FROM,
        hint: 'Where the ray starts, in metres, such as 0, 2, 0; a list of points, such as [Spots], casts once per point.',
      },
      solidScriptParameter(
        'direction',
        'Direction',
        'points3',
        '0, 1, 0',
        'The way the ray travels, such as 0, -1, 0 to go down; a list, such as [Normals], casts one ray per direction.',
      ),
    ],
    each: ['from', 'direction'],
    measured: true,
  }),
  solidScriptFindCommand({
    id: 'find_at_uv',
    label: 'Find At UV',
    how: 'At UV',
    description: 'Find the point on faces at a texture coordinate',
    synonyms: ['uv point', 'texture coordinate', 'find on'],
    manual:
      'Looks at the faces in Of, or [$Selected.Faces] when Of is empty, and finds the first face whose texture coordinates hold UV, blending its corners into the point; overlapping UVs give the first face. Example: Find At UV UV 0.5, 0.5 Into [Middle].',
    stops: ['A UV that is not u, v.'],
    look: [
      solidScriptParameter(
        'uv',
        'UV',
        'points3',
        '0, 0',
        'Texture coordinates to find, as U, V, such as 0.5, 0.5; a list, such as [Spots], finds once per item.',
      ),
    ],
    each: ['uv'],
    measured: false,
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
 * @param found What the find block found.
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
