import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { solidScriptFaceEach, solidScriptFaceEachNumber } from './solid_script_face_each.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptBodyPrism } from '@/solid_script/language/solid_script_body.js';
import { solidScriptGeometryFaces, type SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshExtrudeIndividual,
  solidScriptMeshExtrudeRegion,
  type SolidScriptMeshExtrudePick,
} from '@/solid_script/language/solid_script_mesh_extrude.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import { type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import { solidScriptVectorThree } from '@/solid_script/language/solid_script_vector.js';

/** What a Distance that is not a number stops with. */
const SOLID_SCRIPT_EXTRUDE_DISTANCE_NEEDS = 'Distance needs a number of metres, such as 0.2';

/** How far, which way and how far off its face each face is pulled. */
interface SolidScriptExtrudeReaders {
  distance: (face: SolidScriptFaceFacts) => number;
  lift: (face: SolidScriptFaceFacts) => number;
  direction: (face: SolidScriptFaceFacts) => THREE.Vector3;
  individual: boolean;
}

/** A slab built on a solid face, and the way that face looked. */
interface SolidScriptExtrudeSlab {
  slab: SolidScriptShapeSolid;
  normal: THREE.Vector3;
  inward: boolean;
}

/** The faces and objects an Extrude Face line made. */
interface SolidScriptExtrudeMade {
  tops: SolidScriptValue[];
  sides: SolidScriptValue[];
  brushes: SolidScriptValue[];
}

/**
 * Reads the Direction of one face: its own normal when left off.
 *
 * @param value Field value for the face.
 * @param face Face.
 * @returns Unit direction.
 */
function solidScriptExtrudeDirection(value: SolidScriptValue, face: SolidScriptFaceFacts): THREE.Vector3 {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return face.normal.clone();
  const direction = solidScriptVectorThree(value) ?? new THREE.Vector3();
  if (!(direction.lengthSq() > 0)) throw new Error('Direction needs a vector that is not 0, 0, 0, such as 0, 1, 0');
  return direction.normalize();
}

/**
 * Builds the per-face readers of Distance, Lift and Direction, and reads
 * Individual.
 *
 * @param run Running line.
 * @param faces Faces of the line.
 * @returns Readers.
 */
function solidScriptExtrudeReadersOf(
  run: SolidScriptBlockRun,
  faces: SolidScriptFaceFacts[],
): SolidScriptExtrudeReaders {
  const direction = solidScriptFaceEach(run, 'direction', faces);
  return {
    distance: solidScriptFaceEachNumber(run, 'distance', faces, SOLID_SCRIPT_EXTRUDE_DISTANCE_NEEDS),
    lift: solidScriptFaceEachNumber(run, 'lift', faces, 'Lift needs a number of metres, such as 0.25', 0),
    direction: (face) => solidScriptExtrudeDirection(direction(face), face),
    individual: run.fields().flag('individual'),
  };
}

/**
 * Builds the slab of one solid face: a solid standing on it along Direction, or
 * a Subtractive one sunk into it when Distance is negative.
 *
 * @param face Solid face.
 * @param readers Field readers.
 * @returns Slab.
 */
function solidScriptExtrudeSlabOf(
  face: SolidScriptFaceFacts,
  readers: SolidScriptExtrudeReaders,
): SolidScriptExtrudeSlab {
  const distance = readers.distance(face);
  const direction = readers.direction(face);
  if (direction.dot(face.normal) <= 1e-6)
    throw new Error('Direction must point out of the face on a solid, such as its normal');
  const lift = readers.lift(face);
  const along = (metres: number) => face.corners.map((corner) => corner.clone().addScaledVector(direction, metres));
  const body = solidScriptBodyPrism(along(lift), along(lift + distance), 'Extrude Face');
  const inward = distance < 0;
  const slab: SolidScriptShapeSolid = {
    kind: 'solid',
    label: 'Slab',
    ...body,
    ...(inward ? { mode: 'Subtractive' } : {}),
  };
  return { slab, normal: face.normal, inward };
}

/**
 * Extrudes the picked faces of one mesh and lists what it made.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param faces Its picked faces.
 * @param readers Field readers.
 * @param made Faces and objects made so far.
 */
function solidScriptExtrudeMesh(
  run: SolidScriptBlockRun,
  leaf: SolidScriptShapeMesh,
  faces: SolidScriptFaceFacts[],
  readers: SolidScriptExtrudeReaders,
  made: SolidScriptExtrudeMade,
): void {
  if (faces.some((face) => readers.lift(face) !== 0))
    throw new Error('Lift only works on solids; on a mesh, Extrude Face moves the face itself');
  const picks = new Map<number, SolidScriptMeshExtrudePick>(
    faces.map((face) => [face.index, { distance: readers.distance(face), direction: readers.direction(face) }]),
  );
  const extrude = readers.individual ? solidScriptMeshExtrudeIndividual : solidScriptMeshExtrudeRegion;
  const result = extrude(leaf, picks);
  run.leafReplace(leaf, result.mesh);
  const read = solidScriptGeometryFaces([run.leafLatest(leaf)]);
  const sorted = [...faces].sort((a, b) => a.index - b.index);
  sorted.forEach((face, at) => {
    const moved = read[result.tops[at] ?? -1];
    if (moved) run.elements.faceMoved(face, moved);
  });
  made.tops.push(...result.tops.flatMap((number) => (read[number] ? [run.elements.face(read[number])] : [])));
  made.sides.push(...result.sides.flatMap((number) => (read[number] ? [run.elements.face(read[number])] : [])));
  made.brushes.push(run.elements.brush(leaf));
}

/**
 * Adds the slabs as shapes of this line and lists their objects, their cap
 * faces and their side faces.
 *
 * @param run Running line.
 * @param slabs Slabs.
 * @param made Faces and objects made so far.
 * @returns Shapes the line adds.
 */
function solidScriptExtrudeSlabsAdopt(
  run: SolidScriptBlockRun,
  slabs: readonly SolidScriptExtrudeSlab[],
  made: SolidScriptExtrudeMade,
): ReturnType<SolidScriptBlockRun['adopted']> {
  const adopted = run.adopted(slabs.map((entry) => entry.slab));
  for (const { slab, normal, inward } of slabs) {
    if (!adopted.includes(slab)) continue;
    made.brushes.push(run.elements.brush(slab));
    for (const face of solidScriptGeometryFaces([slab])) {
      const along = face.normal.dot(normal) * (inward ? -1 : 1);
      if (along > 0.9999) made.tops.push(run.elements.face(face));
      else if (Math.abs(face.normal.dot(normal)) < 0.9999) made.sides.push(run.elements.face(face));
    }
  }
  return adopted;
}

/**
 * Runs Extrude Face: slabs on solid faces, moved faces on meshes.
 *
 * @param run Running line.
 * @returns Shapes the line adds.
 */
function solidScriptExtrudeRun(run: SolidScriptBlockRun): ReturnType<SolidScriptBlockRun['adopted']> {
  const targets = solidScriptFaceTargets(run, 'Extrude Face');
  const readers = solidScriptExtrudeReadersOf(run, targets);
  const made: SolidScriptExtrudeMade = { tops: [], sides: [], brushes: [] };
  const slabs: SolidScriptExtrudeSlab[] = [];
  for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf)) {
    if (leaf.kind === 'solid') slabs.push(...faces.map((face) => solidScriptExtrudeSlabOf(face, readers)));
    else solidScriptExtrudeMesh(run, leaf, faces, readers, made);
  }
  const adopted = solidScriptExtrudeSlabsAdopt(run, slabs, made);
  run.selectedSet('faces', made.tops);
  solidScriptFaceWrite(run, 'into', made.brushes);
  solidScriptFaceWrite(run, 'top', made.tops);
  solidScriptFaceWrite(run, 'sides', made.sides);
  return adopted;
}

/** Extrude Face. */
export const SOLID_SCRIPT_COMMANDS_EXTRUDE: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'extrude_face',
    edits: true,
    label: 'Extrude Face',
    category: 'Faces',
    description: 'Pull faces out',
    manual:
      'Pulls faces out, along the way they point or along Direction. On a solid each face becomes a new solid, a slab standing on it, and Into gets those solids; a negative Distance sinks a Subtractive slab into the solid instead, cutting a dent. On a mesh the face itself moves out, or in for a negative Distance. Individual Yes (the default) pulls every face on its own with its own walls; No pulls faces that touch as one region, with walls only around its border, like a step or a plinth. Solids always get one slab per face. Of gives the faces, or objects for all their faces; empty uses [$Selected.Faces]. Top and Sides name variables for the new faces: Top the moved or capping faces and Sides the new side faces. Afterwards [$Selected.Faces] holds the top faces. Lift moves a slab away from its face. Example: Select Faces Facing Up, Extrude Face By 1, Top [Roof].',
    stops: ['No faces.', 'A Lift on a mesh.', 'A Direction of 0, 0, 0, or one that points into a solid face.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '0.2',
          'Metres to pull out, negative to push in, such as 0.5 or [=Random(0.5, 2)].',
        ),
        'Face',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'direction',
          'Direction',
          'vector3',
          'Way to pull, such as 0, 1, 0; left off, each face pulls along its normal.',
        ),
        'Face',
      ),
      solidScriptParameter(
        'individual',
        'Individual',
        'boolean',
        'Yes',
        'Yes: every face on its own. No: faces that touch move as one region, such as No for a plinth. Meshes only.',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'lift',
          'Lift',
          'number',
          'Metres between a solid face and its slab, such as 0.05; left off is 0. Solids only.',
        ),
        'Face',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
      solidScriptParameterInto('the new solids, an Object list', 'Object List', 'what is made', 'copy'),
      {
        ...solidScriptParameterInto('the top faces, a Face list', 'Face List', 'top faces', 'label'),
        key: 'top',
        label: 'Top',
      },
      {
        ...solidScriptParameterInto('the new side faces, a Face list', 'Face List', 'side faces', 'label'),
        key: 'sides',
        label: 'Sides',
      },
    ],
    listing: (read) => [
      'Extrude Face',
      'By ',
      read.value('distance'),
      ...(read.text('direction').trim() === '' ? [] : [' Along ', read.value('direction')]),
      ...(read.on('individual') ? [] : [' As Region']),
      ...(read.text('lift').trim() === '' ? [] : [' Lift ', read.value('lift')]),
      ...solidScriptListingOf(read),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
      ...(read.text('top') === '' ? [] : [' Top ', read.value('top')]),
      ...(read.text('sides') === '' ? [] : [' Sides ', read.value('sides')]),
    ],
    execute: solidScriptExtrudeRun,
  }),
];
