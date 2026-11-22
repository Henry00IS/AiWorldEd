import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { solidScriptElementOf } from './solid_script_element_of.js';
import * as THREE from 'three';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  solidScriptShortestPathsEdges,
  solidScriptShortestPathsNext,
  type SolidScriptPathEdge,
} from '@/solid_script/language/solid_script_shortest_paths.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from '@/solid_script/language/solid_script_geometry.js';
import {
  solidScriptValueNumber,
  type SolidScriptElement,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/**
 * Reads what crossing one edge costs: Cost with [$Edge] bound, 1 when empty.
 *
 * @param run Running line.
 * @param edge Edge element.
 * @param index Edge number in its object.
 * @returns Cost.
 */
function solidScriptShortestPathsCost(run: SolidScriptBlockRun, edge: SolidScriptValue, index: number): number {
  if (run.source('cost').trim() === '') return 1;
  const cost = solidScriptValueNumber(run.valueWith('cost', { $Edge: edge, $Index: index }));
  if (cost === undefined) throw new Error('Select Shortest Paths needs a number in Cost, such as [=[$Edge.Length]]');
  return cost;
}

/** The corners and edges of one object as a graph. */
interface SolidScriptShortestPathsGraph {
  vertices: SolidScriptValue[];
  elements: SolidScriptValue[];
  edges: SolidScriptPathEdge[];
}

/**
 * Reads the corners and the edges passing Where of one object, face or edge,
 * with what crossing each edge costs.
 *
 * @param run Running line.
 * @param object Object, face or edge element.
 * @returns Graph.
 */
function solidScriptShortestPathsGraphOf(
  run: SolidScriptBlockRun,
  object: SolidScriptElement,
): SolidScriptShortestPathsGraph {
  const leaf = run.elements.leaf(object);
  const corners = run.elements.vertices(object);
  const numberOf = (point: THREE.Vector3): number =>
    corners.findIndex((corner) => corner.position.distanceTo(point) < SOLID_SCRIPT_GEOMETRY_EPSILON);
  const elements = run.elements
    .edges(object)
    .map((edge) => [edge, run.elements.edge(edge)] as const)
    .filter(([, element], index) => solidScriptConditionHolds(run, 'where', { $Edge: element, $Index: index }));
  const facts = elements.map(([edge]) => edge);
  return {
    vertices: corners.map((corner) => run.elements.vertex(leaf, corner)),
    elements: elements.map(([, element]) => element),
    edges: facts.map((edge, index) => ({
      a: numberOf(edge.start),
      b: numberOf(edge.end),
      cost: solidScriptShortestPathsCost(run, elements[index]?.[1], index),
    })),
  };
}

/**
 * Picks the edges on the cheapest way from every Start corner of each object to
 * its nearest End corner, and writes them to [$Selected.Edges] and Into.
 *
 * @param run Running line.
 */
function solidScriptShortestPathsRun(run: SolidScriptBlockRun): void {
  const found = solidScriptElementOf(run, 'objects', 'Select Shortest Paths').flatMap((object) => {
    const { vertices, elements, edges } = solidScriptShortestPathsGraphOf(run, object);
    const passing = (field: string): number[] =>
      vertices.flatMap((vertex, index) =>
        solidScriptConditionHolds(run, field, { $Vertex: vertex, $Index: index }) ? [index] : [],
      );
    const next = solidScriptShortestPathsNext(vertices.length, edges, passing('end'));
    return solidScriptShortestPathsEdges(edges, next, passing('start')).map((index) => elements[index]);
  });
  const picked = found.filter((edge, index) => found.indexOf(edge) === index);
  run.selectedSet('edges', picked);
  const into = run.text('into').trim();
  if (into !== '') run.variableSet(into.replace(/^\[(.*)\]$/s, '$1'), picked);
}

/** Select Shortest Paths. */
export const SOLID_SCRIPT_COMMANDS_SHORTEST_PATHS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'select_shortest_paths',
    label: 'Select Shortest Paths',
    category: 'Edges',
    description: 'Pick the edges of the cheapest way between corners',
    manual:
      'Picks, in [$Selected.Edges], the edges on the cheapest way along edges from every Start corner to the End corner nearest it, so a later line can cut, bevel or trace that path. Start and End are 🔁 conditions a corner must pass, with [$Vertex] the corner; Start left off starts from every corner. Cost is what crossing an edge costs, with [$Edge] the edge, such as [=[$Edge.Length]]; left off, each edge costs 1, so the path with the fewest edges wins, and a Cost below 0 counts as 0. A corner that cannot reach any End adds nothing. Of gives the objects, faces or edges whose edges paths may use; empty uses [$Selected.Objects]. Where is a 🔁 condition an edge must pass for paths to use it. Into also writes the edges to a variable, an Edge list. Example: Grid Mesh, Select Objects, then Select Shortest Paths Start [=[$Vertex.Position.X] < -1] End [=[$Vertex.Position.X] > 1] and Path From Edges traces a line across it.',
    stops: ['No objects.', 'A Cost that is not a number.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'start',
          'Start',
          'value',
          'A condition a corner must pass to start a path, such as [=[$Vertex.Position.X] < 0]. Left off starts from every corner.',
        ),
        'Vertex',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'end',
          'End',
          'value',
          'A condition a corner must pass for paths to end there, such as [=[$Vertex.Position.X] > 0].',
        ),
        'Vertex',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'cost',
          'Cost',
          'number',
          'What crossing an edge costs, such as [=[$Edge.Length]]. Left off, each edge costs 1.',
        ),
        'Edge',
      ),
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Length] < 2]'),
      solidScriptParameterOf('objects, faces or edges', '$Selected.Objects', ['Object', 'Face', 'Edge']),
      solidScriptParameterInto('the path edges, an Edge list', 'Edge List', 'path edges', 'label'),
    ],
    listing: (read) => [
      'Select Shortest Paths',
      ...(read.text('start').trim() === '' ? [] : [' Start ', read.value('start')]),
      ...(read.text('end').trim() === '' ? [] : [' End ', read.value('end')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptShortestPathsRun(run);
      return [];
    },
  }),
];
