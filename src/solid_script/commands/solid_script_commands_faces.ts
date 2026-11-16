import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandWord } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryEdges,
  solidScriptGeometryFaceFind,
  solidScriptGeometryFaceMatrix,
  solidScriptGeometryFacePrism,
  solidScriptGeometryFaces,
  solidScriptGeometryFacesDelete,
  solidScriptGeometryInset,
  solidScriptGeometryMesh,
  solidScriptGeometryPick,
  solidScriptGeometryScatter,
  solidScriptGeometryVertices,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
  type SolidScriptFacePick,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshExtrudeFaces, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptShapeMapLeaves, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** Ways Select Faces picks, with the direction of each Facing choice. */
const SOLID_SCRIPT_FACE_DIRECTIONS: Readonly<Record<string, THREE.Vector3>> = {
  'Facing Up': new THREE.Vector3(0, 0, 1),
  'Facing Down': new THREE.Vector3(0, 0, -1),
  'Facing Left': new THREE.Vector3(-1, 0, 0),
  'Facing Right': new THREE.Vector3(1, 0, 0),
  'Facing Front': new THREE.Vector3(0, -1, 0),
  'Facing Back': new THREE.Vector3(0, 1, 0),
};

/**
 * Every choice of Select Faces' Which field with what it picks, in the order
 * the help lists them.
 */
const SOLID_SCRIPT_FACE_WHICH_WORDS: readonly SolidScriptCommandWord[] = [
  { word: 'All', detail: 'Every face' },
  ...Object.entries(SOLID_SCRIPT_FACE_DIRECTIONS).map(([word, direction]) => {
    const axis = (['x', 'y', 'z'] as const).find((key) => direction[key] !== 0) ?? 'z';
    const sign = direction[axis] > 0 ? '+' : '−';
    return {
      word,
      detail: `Faces pointing ${word.slice('Facing '.length).toLowerCase()} (${sign}${axis.toUpperCase()})`,
    };
  }),
  { word: 'Facing', detail: 'Faces pointing along Detail' },
  { word: 'Tagged', detail: 'Faces tagged with the name in Detail' },
  { word: 'Biggest', detail: 'The largest faces; Detail says how many' },
  { word: 'Smallest', detail: 'The smallest faces; Detail says how many' },
  { word: 'Number', detail: 'Faces by number; Detail lists them' },
  { word: 'Where', detail: 'Faces where the condition in Detail holds' },
];

/** Every choice of Select Faces' Which field. */
const SOLID_SCRIPT_FACE_WHICH = SOLID_SCRIPT_FACE_WHICH_WORDS.map((entry) => entry.word);

/** How a Select Faces line changes the faces already picked. */
const SOLID_SCRIPT_FACE_HOW = ['New', 'Add', 'Remove'] as const;

/** What each How choice does, shown beside it while the field is typed. */
const SOLID_SCRIPT_FACE_HOW_DETAILS: Readonly<Record<(typeof SOLID_SCRIPT_FACE_HOW)[number], string>> = {
  New: 'Start a new pick',
  Add: 'Pick more faces',
  Remove: 'Drop faces from the pick',
};

/** Stop of the lines that act on picked faces. */
const SOLID_SCRIPT_FACE_STOPS_NONE = 'No shapes built above it, so there are no faces to pick.';

/**
 * Rounds a number so small errors do not show, such as 0.30000000000000004.
 *
 * @param value Number.
 * @returns Rounded number.
 */
function solidScriptFaceRound(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Writes a vector as a list value.
 *
 * @param vector Vector.
 * @returns List of three numbers.
 */
function solidScriptFaceVector(vector: THREE.Vector3): SolidScriptValue {
  return vector.toArray().map(solidScriptFaceRound);
}

/**
 * The read-only system variables of a face, as For Each Selected Face and Where
 * see them.
 *
 * @param face Face.
 * @param round Number of the round, from 0.
 * @returns Variables by name.
 */
export function solidScriptFaceVariables(face: SolidScriptFaceFacts, round: number): Record<string, SolidScriptValue> {
  return {
    'Face.Index': round,
    'Face.Number': face.index,
    'Face.Center': solidScriptFaceVector(face.center),
    'Face.Normal': solidScriptFaceVector(face.normal),
    'Face.Width': solidScriptFaceRound(face.width),
    'Face.Height': solidScriptFaceRound(face.height),
    'Face.Area': solidScriptFaceRound(face.area),
    'Face.Tag': face.tags.at(-1) ?? '',
  };
}

/**
 * Reads how Select Faces picks.
 *
 * @param run Running line.
 * @returns Pick.
 */
function solidScriptFacePickRead(run: SolidScriptBlockRun): SolidScriptFacePick {
  const which = run.text('which').trim();
  const direction = SOLID_SCRIPT_FACE_DIRECTIONS[which];
  const within = (): number => {
    const number = solidScriptValueNumber(run.value('within'));
    if (number === undefined || number < 0 || number > 180)
      throw new Error('Within needs a number of degrees, 0 to 180');
    return number;
  };
  if (direction) return { by: 'facing', direction, within: within() };
  switch (which) {
    case 'All':
      return { by: 'all' };
    case 'Facing': {
      const numbers = solidScriptValueNumbers(run.value('detail'));
      if (numbers?.length !== 3)
        throw new Error('Facing needs a direction in Detail, three numbers such as 0, 0, 1 for up');
      return { by: 'facing', direction: new THREE.Vector3(...numbers).normalize(), within: within() };
    }
    case 'Tagged': {
      const tag = run.text('detail').trim();
      if (tag === '') throw new Error('Tagged needs a name in Detail, such as Top, Side or Step Tread');
      return { by: 'tag', tag };
    }
    case 'Biggest':
    case 'Smallest': {
      const count = run.text('detail').trim() === '' ? 1 : solidScriptValueNumber(run.value('detail'));
      if (count === undefined || !Number.isInteger(count) || count < 1)
        throw new Error(`${which} needs a whole number of faces in Detail, such as 1`);
      return { by: which === 'Biggest' ? 'biggest' : 'smallest', count };
    }
    case 'Number': {
      const value = run.value('detail');
      const numbers = Array.isArray(value) ? solidScriptValueNumbers(value) : [solidScriptValueNumber(value)];
      if (!numbers || numbers.some((number) => number === undefined))
        throw new Error('Number needs face numbers in Detail, such as 0 or 0, 2, 4');
      return { by: 'numbers', numbers: numbers as number[] };
    }
    case 'Where':
      return {
        by: 'where',
        holds: (face) => solidScriptValueTruthy(run.valueWith('detail', solidScriptFaceVariables(face, face.index))),
      };
    default:
      throw new Error(`Which must be one of ${SOLID_SCRIPT_FACE_WHICH.join(', ')}, not "${which}"`);
  }
}

/**
 * Tells two readings of a face apart: the same solid or mesh, centre and
 * direction.
 *
 * @param a First face.
 * @param b Second face.
 * @returns True for the same face.
 */
function solidScriptFaceSame(a: SolidScriptFaceFacts, b: SolidScriptFaceFacts): boolean {
  return a.leaf === b.leaf && a.center.distanceTo(b.center) < 1e-6 && a.normal.dot(b.normal) > 0.9999;
}

/**
 * Returns the faces an action works on: the face of the For Each Selected Face
 * round, or else every selected face.
 *
 * @param run Running line.
 * @param label Command, for the error.
 * @returns Faces.
 */
function solidScriptFaceTargets(run: SolidScriptBlockRun, label: string): SolidScriptFaceFacts[] {
  const current = run.faceCurrent();
  const faces = current ? [current] : run.selection();
  if (faces.length === 0) throw new Error(`${label} has no faces to work on; add a Select Faces line above it`);
  return faces;
}

/**
 * Groups faces by the solid or mesh they belong to now.
 *
 * @param run Running line.
 * @param faces Faces.
 * @returns Faces per solid or mesh.
 */
function solidScriptFaceGroups(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): Map<SolidScriptGeometryLeaf, SolidScriptFaceFacts[]> {
  const groups = new Map<SolidScriptGeometryLeaf, SolidScriptFaceFacts[]>();
  for (const face of faces) {
    const leaf = run.leafLatest(face.leaf);
    groups.set(leaf, [...(groups.get(leaf) ?? []), face]);
  }
  return groups;
}

/**
 * Finds the numbers of faces in the mesh of a solid or mesh.
 *
 * @param leaf Solid or mesh.
 * @param faces Faces.
 * @returns Face numbers.
 */
function solidScriptFaceNumbers(leaf: SolidScriptGeometryLeaf, faces: readonly SolidScriptFaceFacts[]): Set<number> {
  return new Set(faces.map((face) => solidScriptGeometryFaceFind(leaf, face)).filter((index) => index >= 0));
}

/**
 * Reads a distance field.
 *
 * @param run Running line.
 * @param what Field caption.
 * @returns Metres.
 */
function solidScriptFaceDistance(run: SolidScriptBlockRun, what: string): number {
  const number = solidScriptValueNumber(run.value('distance'));
  if (number === undefined) throw new Error(`${what} needs a number of metres, such as 0.2`);
  return number;
}

/**
 * Builds the variables of every round of a For Each Vertex or For Each Edge.
 *
 * @param shapes Shapes built above.
 * @param what Vertices or edges.
 * @returns Rounds.
 */
function solidScriptFaceRoundsOf(
  shapes: readonly SolidScriptShape[],
  what: 'vertex' | 'edge',
): { variables: Record<string, SolidScriptValue>; face: null }[] {
  if (what === 'vertex')
    return solidScriptGeometryVertices(shapes).map((vertex) => ({
      variables: {
        'Vertex.Index': vertex.index,
        'Vertex.Position': solidScriptFaceVector(vertex.position),
        'Vertex.Normal': solidScriptFaceVector(vertex.normal),
      },
      face: null,
    }));
  return solidScriptGeometryEdges(shapes).map((edge: SolidScriptEdgeFacts) => ({
    variables: {
      'Edge.Index': edge.index,
      'Edge.Start': solidScriptFaceVector(edge.start),
      'Edge.End': solidScriptFaceVector(edge.end),
      'Edge.Middle': solidScriptFaceVector(edge.middle),
      'Edge.Length': solidScriptFaceRound(edge.length),
      'Edge.Direction': solidScriptFaceVector(edge.direction),
    },
    face: null,
  }));
}

/**
 * Commands that pick faces of the shapes built so far, loop over them and
 * detail them.
 */
export const SOLID_SCRIPT_COMMANDS_FACES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'select_faces',
    label: 'Select Faces',
    category: 'Faces',
    description: 'Pick faces of the shapes above',
    manual:
      'Picks faces of the shapes built above this line, so the lines after it can work on them. Inside a For Each round it picks faces of what that round built, and the lines after the loop get the outer pick back, so Select Faces can be nested. Which says how: All, Facing Up, Facing Down, Facing Left, Facing Right, Facing Front or Facing Back (Within allows a slope, in degrees), Facing a direction you give, Tagged with a name, the Biggest or Smallest faces, a face Number, or Where a condition is true. Every face has names: Top, Bottom or Side, and generators add more, such as Step Tread and Riser on stairs and Cap on columns. How chooses New to start again, Add to pick more or Remove to drop some. Example: Stairs, then Select Faces Tagged Step Tread picks the top of every step.',
    stops: [
      SOLID_SCRIPT_FACE_STOPS_NONE,
      'A Which that is not one of the choices.',
      'A Detail that does not fit the Which.',
    ],
    parameters: [
      solidScriptParameterWords(
        'which',
        'Which',
        'text',
        'Facing Up',
        `How to pick. One of: ${SOLID_SCRIPT_FACE_WHICH.join(', ')}.`,
        SOLID_SCRIPT_FACE_WHICH_WORDS,
      ),
      solidScriptParameterOptional(
        'detail',
        'Detail',
        'value',
        'The name for Tagged, how many for Biggest or Smallest, numbers for Number, a direction for Facing, a condition for Where such as [Face.Area] > 1.',
      ),
      solidScriptParameter(
        'within',
        'Within',
        'number',
        '30',
        'Degrees a face may lean and still count as facing that way.',
      ),
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'New',
        'New starts again, Add picks more, Remove drops faces. One of: New, Add, Remove.',
        SOLID_SCRIPT_FACE_HOW.map((word) => ({ word, detail: SOLID_SCRIPT_FACE_HOW_DETAILS[word] })),
      ),
    ],
    listing: (read) => {
      const which = read.text('which').trim();
      const facing = which.startsWith('Facing');
      return [
        'Select Faces',
        which,
        ...(read.text('detail').trim() === '' ? [] : [' ', read.value('detail')]),
        ...(facing && read.changed('within') ? [' within ', read.value('within'), '°'] : []),
        ...solidScriptListingOptions([read.text('how').trim() !== 'New' && [read.text('how').trim()]]),
      ];
    },
    execute: (run) => {
      const how = run.text('how').trim();
      if (!(SOLID_SCRIPT_FACE_HOW as readonly string[]).includes(how))
        throw new Error(`How must be New, Add or Remove, not "${how}"`);
      const faces = solidScriptGeometryFaces(run.pickable());
      if (faces.length === 0)
        throw new Error('Select Faces picks faces of shapes built above it; add a shape such as Cube first');
      const picked = solidScriptGeometryPick(faces, solidScriptFacePickRead(run));
      const before = how === 'New' ? [] : run.selection();
      if (how === 'Remove')
        run.selectionSet(before.filter((face) => !picked.some((drop) => solidScriptFaceSame(face, drop))));
      else
        run.selectionSet([
          ...before,
          ...picked.filter((face) => !before.some((kept) => solidScriptFaceSame(face, kept))),
        ]);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'for_each_selected_face',
    label: 'For Each Selected Face',
    category: 'Faces',
    description: 'Run lines once per picked face',
    manual:
      'Runs the lines inside once for every face the last Select Faces picked. Inside, these read-only values describe the face: [Face.Index] counts the rounds from 0, [Face.Center] is its middle, [Face.Normal] the way it points, [Face.Width] and [Face.Height] its size, [Face.Area] its area, [Face.Tag] its name and [Face.Number] its number among all faces. Shapes built inside stand on the face of the round, like Place On Face: centred on its middle with Z pointing out. Place On Face adds a Lift, and Extrude Face, Inset Face and Bevel Edges work on the face of the round. Example: Select Faces Tagged Step Tread, then For Each Selected Face with Place On Face and a thin Cube puts a trim on every step.',
    stops: ['A missing End line.'],
    nesting: 'open',
    endLabel: 'For Each',
    parameters: [],
    listing: () => ['For Each Selected Face'],
    execute: (run) =>
      run.looped(
        run.selection().map((face, round) => ({
          variables: solidScriptFaceVariables(face, round),
          face,
          matrix: solidScriptGeometryFaceMatrix(face),
        })),
      ),
  }),
  new SolidScriptCommand({
    id: 'for_each_scattered_point',
    label: 'For Each Scattered Point',
    category: 'Faces',
    description: 'Run lines at random points on picked faces',
    manual:
      'Spreads Count points at random over the faces the last Select Faces picked, more on bigger faces, and runs the lines inside once per point. Inside, [Point.Index] counts from 0, [Point.Position] is where the point is and [Point.Normal] the way its face points; the Face values describe its face. The same Seed always gives the same points. Example: Select Faces Facing Up, then For Each Scattered Point with Translate by [Point.Position] and a small Sphere scatters pebbles on the top of a box.',
    stops: ['No faces picked.', 'A Count that is not a whole number from 0 to 10000.', 'A missing End line.'],
    nesting: 'open',
    endLabel: 'For Each',
    parameters: [
      solidScriptParameter('count', 'Count', 'number', '10', 'How many points, 0 to 10000.'),
      solidScriptParameter('seed', 'Seed', 'number', '0', 'Any number; another seed gives other points.'),
    ],
    listing: (read) => ['For Each Scattered Point', ' ', read.value('count'), ' with seed ', read.value('seed')],
    execute: (run) => {
      const count = solidScriptValueNumber(run.value('count'));
      if (count === undefined || !Number.isInteger(count) || count < 0 || count > 10000)
        throw new Error('Count needs a whole number from 0 to 10000');
      const seed = solidScriptValueNumber(run.value('seed'));
      if (seed === undefined) throw new Error('Seed needs a number');
      const faces = run.selection();
      if (faces.length === 0)
        throw new Error('For Each Scattered Point spreads points on picked faces; add a Select Faces line above it');
      return run.looped(
        solidScriptGeometryScatter(faces, count, seed).map((point, round) => ({
          variables: {
            ...solidScriptFaceVariables(point.face, round),
            'Point.Index': round,
            'Point.Position': solidScriptFaceVector(point.position),
            'Point.Normal': solidScriptFaceVector(point.face.normal),
          },
          face: point.face,
        })),
      );
    },
  }),
  new SolidScriptCommand({
    id: 'for_each_vertex',
    label: 'For Each Vertex',
    category: 'Faces',
    description: 'Run lines once per corner point',
    manual:
      'Runs the lines inside once for every corner point of the shapes built above this line. Inside, [Vertex.Index] is its number, [Vertex.Position] where it is and [Vertex.Normal] the way the faces around it point. Example: For Each Vertex with Translate by [Vertex.Position] and a small Sphere puts a ball on every corner of a Cube.',
    stops: [SOLID_SCRIPT_FACE_STOPS_NONE, 'A missing End line.'],
    nesting: 'open',
    endLabel: 'For Each',
    parameters: [],
    listing: () => ['For Each Vertex'],
    execute: (run) => {
      const built = run.pickable();
      if (built.length === 0)
        throw new Error('For Each Vertex reads the shapes built above it; add a shape such as Cube first');
      return run.looped(solidScriptFaceRoundsOf(built, 'vertex'));
    },
  }),
  new SolidScriptCommand({
    id: 'for_each_edge',
    label: 'For Each Edge',
    category: 'Faces',
    description: 'Run lines once per edge',
    manual:
      'Runs the lines inside once for every edge of the shapes built above this line. Inside, [Edge.Index] is its number, [Edge.Start] and [Edge.End] its two ends, [Edge.Middle] its middle, [Edge.Length] how long it is and [Edge.Direction] the way it runs. Example: For Each Edge with Translate by [Edge.Middle] and a small Cube marks the middle of every edge.',
    stops: [SOLID_SCRIPT_FACE_STOPS_NONE, 'A missing End line.'],
    nesting: 'open',
    endLabel: 'For Each',
    parameters: [],
    listing: () => ['For Each Edge'],
    execute: (run) => {
      const built = run.pickable();
      if (built.length === 0)
        throw new Error('For Each Edge reads the shapes built above it; add a shape such as Cube first');
      return run.looped(solidScriptFaceRoundsOf(built, 'edge'));
    },
  }),
  new SolidScriptCommand({
    id: 'place_on_face',
    label: 'Place On Face',
    category: 'Faces',
    description: 'Build shapes standing on the face',
    manual:
      'Builds the shapes inside standing on the face of the For Each Selected Face round: their origin sits on the middle of the face, Z points out of it, X runs across it and Y up it. Lift moves them further out. The blocks around this line do not move them. Example: Place On Face with a Cube of size [Face.Width], [Face.Height], 0.05 not centred covers the face with a thin plate.',
    stops: ['Being outside For Each Selected Face.', 'Nothing between this line and its End.', 'A missing End line.'],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [solidScriptParameter('lift', 'Lift', 'number', '0', 'Metres to move the shapes out from the face.')],
    listing: (read) => [
      'Place On Face',
      ...solidScriptListingOptions([read.changed('lift') && ['Lift ', read.value('lift')]]),
    ],
    execute: (run) => {
      const face = run.faceCurrent();
      if (!face) throw new Error('Place On Face only works inside For Each Selected Face');
      const lift = solidScriptValueNumber(run.value('lift'));
      if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
      const matrix = solidScriptGeometryFaceMatrix(face).multiply(new THREE.Matrix4().makeTranslation(0, 0, lift));
      return run.framed(matrix);
    },
  }),
  new SolidScriptCommand({
    id: 'extrude_face',
    label: 'Extrude Face',
    category: 'Faces',
    description: 'Pull picked faces out',
    manual:
      'Pulls faces out along the way they point: the face of the For Each Selected Face round, or else every face Select Faces picked. On a brush it adds a new brush on the face, so brushes stay brushes. On a mesh it moves the face and adds side faces, and a negative Distance pushes it in. Example: Select Faces Facing Up, then Extrude Face by 0.5 makes a box half a metre taller.',
    stops: ['No faces picked.', 'A negative Distance on a brush. Use Difference to cut into brushes.'],
    parameters: [solidScriptParameter('distance', 'Distance', 'number', '0.2', 'Metres to pull out.')],
    listing: (read) => ['Extrude Face', 'by ', read.value('distance')],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      const added: SolidScriptShape[] = [];
      for (const [leaf, faces] of solidScriptFaceGroups(run, solidScriptFaceTargets(run, 'Extrude Face'))) {
        if (leaf.kind === 'solid') {
          if (distance < 0) throw new Error('Extrude Face cannot push into a brush; use Difference to cut into it');
          for (const face of faces)
            added.push({ kind: 'solid', label: 'Extrude Face', points: solidScriptGeometryFacePrism(face, distance) });
          continue;
        }
        const numbers = solidScriptFaceNumbers(leaf, faces);
        run.leafReplace(
          leaf,
          solidScriptMeshExtrudeFaces(leaf, (_, __, index) => (numbers.has(index) ? distance : null)),
        );
      }
      return run.adopted(added.filter((shape) => shape.kind === 'solid'));
    },
  }),
  new SolidScriptCommand({
    id: 'inset_face',
    label: 'Inset Face',
    category: 'Faces',
    description: 'Put a smaller face inside picked faces',
    manual:
      'Puts a smaller copy of each face inside it, joined to the old edge by a ring of faces: the face of the For Each Selected Face round, or else every face Select Faces picked. A brush it touches becomes a mesh, because brushes cannot have faces inside faces. Follow it with Extrude Face to raise or sink the middle. Example: Select Faces Facing Up, Inset Face by 0.1, then Extrude Face by -0.05 sinks a tray into a mesh box.',
    stops: ['No faces picked.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '0.1', 'Metres from the old edge to the new one.'),
    ],
    listing: (read) => ['Inset Face', 'by ', read.value('distance')],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      for (const [leaf, faces] of solidScriptFaceGroups(run, solidScriptFaceTargets(run, 'Inset Face'))) {
        const mesh: SolidScriptShapeMesh = solidScriptGeometryMesh(leaf);
        run.leafReplace(leaf, solidScriptGeometryInset(mesh, solidScriptFaceNumbers(leaf, faces), distance));
      }
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'bevel_edges',
    label: 'Bevel Edges',
    category: 'Faces',
    description: 'Cut the edges of picked faces flat',
    manual:
      'Cuts the edges around faces off at a slant, Distance along each side: the face of the For Each Selected Face round, or else every face Select Faces picked. It works on brushes and keeps them brushes. Example: Cube, Select Faces Facing Up, Bevel Edges by 0.1 softens the top edges of a box.',
    stops: ['No faces picked.', 'Faces of a mesh. Bevel Edges works on brushes for now.', 'A Distance of 0 or less.'],
    parameters: [solidScriptParameter('distance', 'Distance', 'number', '0.1', 'Metres to cut back along each side.')],
    listing: (read) => ['Bevel Edges', 'by ', read.value('distance')],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      if (distance <= 0) throw new Error('Bevel Edges needs a Distance above 0');
      for (const [leaf, faces] of solidScriptFaceGroups(run, solidScriptFaceTargets(run, 'Bevel Edges'))) {
        if (leaf.kind !== 'solid') throw new Error('Bevel Edges works on brushes for now, not meshes');
        const edges = solidScriptGeometryEdges([leaf]).filter((edge) =>
          faces.some((face) =>
            edge.faces.some((side) => side && solidScriptFaceSame({ ...side, leaf }, { ...face, leaf })),
          ),
        );
        run.leafReplace(leaf, { ...leaf, points: solidScriptGeometryBevel(leaf, edges, distance) });
      }
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_faces',
    label: 'Delete Faces',
    category: 'Faces',
    description: 'Take picked faces away',
    manual:
      'Takes faces away and leaves a hole: the face of the For Each Selected Face round, or else every face Select Faces picked. A brush it touches becomes a mesh, because a brush must be closed. Example: Cube, Select Faces Facing Up, Delete Faces leaves an open box.',
    stops: ['No faces picked.'],
    parameters: [],
    listing: () => ['Delete Faces'],
    execute: (run) => {
      for (const [leaf, faces] of solidScriptFaceGroups(run, solidScriptFaceTargets(run, 'Delete Faces')))
        run.leafReplace(
          leaf,
          solidScriptGeometryFacesDelete(solidScriptGeometryMesh(leaf), solidScriptFaceNumbers(leaf, faces)),
        );
      run.selectionSet([]);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'texture',
    label: 'Texture',
    category: 'Faces',
    description: 'Paint shapes with a texture',
    manual:
      "Gives every face of the brushes between this line and its End the texture named by Texture, the name a texture has in the texture library. Brushes outside any Texture block keep the generator's own texture, and an inner Texture block wins over an outer one. A texture Input picks the name from the library, so the inspector can change it. Meshes keep the generator's texture for now. Example: Input wall, texture, then Texture [Wall] around the walls paints them with the picked texture.",
    stops: ['A missing End line.', 'A [Name] for a variable not set above this line.'],
    nesting: 'open',
    parameters: [
      {
        ...solidScriptParameterOptional(
          'texture',
          'Texture',
          'message',
          "Name of a library texture; [Name] puts in a variable, such as a texture Input. Empty keeps the generator's texture.",
        ),
        texture: true,
      },
    ],
    listing: (read) => ['Texture', read.value('texture')],
    execute: (run) => {
      const texture = solidScriptValueText(run.value('texture')).trim();
      const shapes = run.local(run.planar);
      if (texture === '') return run.placed(shapes);
      return run.placed(
        shapes.map((shape) =>
          solidScriptShapeMapLeaves(shape, (leaf) =>
            leaf.kind === 'solid' && leaf.texture === undefined ? { ...leaf, texture } : leaf,
          ),
        ),
      );
    },
  }),
  new SolidScriptCommand({
    id: 'texture_faces',
    label: 'Texture Faces',
    category: 'Faces',
    description: 'Paint picked faces with a texture',
    manual:
      'Gives faces their own library texture: the face of the For Each Selected Face round, or else every face Select Faces picked. It works on brushes and wins over a Texture block around them. The faces keep it when the brush is moved, turned or scaled. Example: Cube, Select Faces Facing Up, Texture Faces grass gives a box a grass top.',
    stops: [
      'No faces picked.',
      'Faces of a mesh. Texture Faces works on brushes for now.',
      'An empty Texture.',
      'A [Name] for a variable not set above this line.',
    ],
    parameters: [
      {
        ...solidScriptParameter(
          'texture',
          'Texture',
          'message',
          'grass',
          'Name of a library texture; [Name] puts in a variable, such as a texture Input.',
        ),
        texture: true,
      },
    ],
    listing: (read) => ['Texture Faces', read.value('texture')],
    execute: (run) => {
      const texture = solidScriptValueText(run.value('texture')).trim();
      if (texture === '') throw new Error('Texture Faces needs a Texture name');
      for (const [leaf, faces] of solidScriptFaceGroups(run, solidScriptFaceTargets(run, 'Texture Faces'))) {
        if (leaf.kind !== 'solid') throw new Error('Texture Faces works on brushes for now, not meshes');
        const added = faces.map((face) => ({ point: face.center.clone(), normal: face.normal.clone(), texture }));
        run.leafReplace(leaf, { ...leaf, faceTextures: [...(leaf.faceTextures ?? []), ...added] });
      }
      return [];
    },
  }),
];
