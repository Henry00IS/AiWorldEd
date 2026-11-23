import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptFaceEach } from './solid_script_face_each.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import {
  solidScriptGeometryFaceHolds,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceTag } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';

/**
 * Tells whether a tag entry sits on a face.
 *
 * @param entry Tag entry.
 * @param face Face.
 * @returns True when the entry tags the face.
 */
function solidScriptTagOnFace(entry: SolidScriptFaceTag, face: SolidScriptFaceFacts): boolean {
  return entry.normal.dot(face.normal) > 0.9999 && solidScriptGeometryFaceHolds(face.corners, face.normal, entry.point);
}

/**
 * Adds or removes the Tag of each face of one solid or mesh.
 *
 * @param leaf Solid or mesh.
 * @param faces Its faces the line works on.
 * @param tagOf Tag of a face.
 * @param remove True to take the tag off instead.
 * @returns The solid or mesh with its tags changed.
 */
function solidScriptTagFacesOf(
  leaf: SolidScriptGeometryLeaf,
  faces: readonly SolidScriptFaceFacts[],
  tagOf: (face: SolidScriptFaceFacts) => string,
  remove: boolean,
): SolidScriptGeometryLeaf {
  const entries = leaf.faceTags ?? [];
  if (remove) {
    const kept = entries.filter(
      (entry) => !faces.some((face) => entry.tag === tagOf(face) && solidScriptTagOnFace(entry, face)),
    );
    return { ...leaf, faceTags: kept } as SolidScriptGeometryLeaf;
  }
  const added = faces.map((face) => ({ point: face.center.clone(), normal: face.normal.clone(), tag: tagOf(face) }));
  return { ...leaf, faceTags: [...entries, ...added] } as SolidScriptGeometryLeaf;
}

/**
 * Runs Tag Faces: reads each face's Tag and adds or removes it.
 *
 * @param run Running line.
 */
function solidScriptTagFacesRun(run: SolidScriptBlockRun): void {
  const targets = solidScriptFaceTargets(run, 'Tag Faces');
  const read = solidScriptFaceEach(run, 'tag', targets);
  const tagOf = (face: SolidScriptFaceFacts): string => {
    const tag = solidScriptValueText(read(face)).trim();
    if (tag === '') throw new Error('Tag Faces needs a Tag, such as Roof');
    return tag;
  };
  const remove = run.fields().flag('remove');
  for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf))
    run.leafReplace(leaf, solidScriptTagFacesOf(run.leafLatest(leaf), faces, tagOf, remove));
}

/** Tag Faces: gives faces a tag of the user's own, or takes it off. */
export const SOLID_SCRIPT_COMMANDS_TAGS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'tag_faces',
    edits: true,
    label: 'Tag Faces',
    category: 'Faces',
    description: 'Give faces a tag, or take it off',
    manual:
      'Gives each face in Of the tag in Tag, so later lines can find it with [$Face.Tag], [$Face.Tags] or HasTag; with Remove on it takes that tag off again. The tag stays with the face when the object is moved, turned, scaled or cut. Tags the faces are given by where they look (Top, Side, Bottom) and by their generator stay. Of gives the faces, or objects for all their faces; empty uses [$Selected.Faces]. The 🔁 Tag may change per face. Example: Select Faces Facing Up, Tag Faces Roof, then later Texture Faces tiles Where [=HasTag([$Face.Tags], "Roof")].',
    stops: ['No faces.', 'An empty Tag.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'tag',
          'Tag',
          'message',
          'Roof',
          'The tag to give each face, such as Roof or [=[$Index] % 2 == 0 ? "Even" : "Odd"].',
        ),
        'Face',
      ),
      solidScriptParameter(
        'remove',
        'Remove',
        'boolean',
        'No',
        'Yes: take the tag off instead. Type Yes or No, such as No.',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Tag Faces',
      read.value('tag'),
      ...solidScriptListingOptions([read.on('remove') && ['Remove']]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptTagFacesRun(run);
      return [];
    },
  }),
];
