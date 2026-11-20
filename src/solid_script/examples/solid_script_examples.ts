import type { SolidScriptLine, SolidScriptUses } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_COLUMNS,
  SOLID_SCRIPT_EXAMPLE_DOORWAY,
  SOLID_SCRIPT_EXAMPLE_KNOBS,
  SOLID_SCRIPT_EXAMPLE_PEDESTAL,
  SOLID_SCRIPT_EXAMPLE_PILLAR_RING,
  SOLID_SCRIPT_EXAMPLE_STEPPING_STONES,
  SOLID_SCRIPT_EXAMPLE_PEBBLES,
  SOLID_SCRIPT_EXAMPLE_SPIKY_BALL,
} from './solid_script_examples_basics.js';
import {
  SOLID_SCRIPT_EXAMPLE_HILLY_FLOOR,
  SOLID_SCRIPT_EXAMPLE_IRREGULAR_ROCK,
  SOLID_SCRIPT_EXAMPLE_ROUNDED_RAIL,
  SOLID_SCRIPT_EXAMPLE_TAPERED_BOX,
} from './solid_script_examples_geometry.js';
import {
  SOLID_SCRIPT_EXAMPLE_CAPSULE,
  SOLID_SCRIPT_EXAMPLE_CONE,
  SOLID_SCRIPT_EXAMPLE_COLUMN,
  SOLID_SCRIPT_EXAMPLE_CYLINDER,
  SOLID_SCRIPT_EXAMPLE_SPHERE,
} from './solid_script_examples_round.js';
import {
  SOLID_SCRIPT_EXAMPLE_ARCH,
  SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX,
  SOLID_SCRIPT_EXAMPLE_PRISM,
  SOLID_SCRIPT_EXAMPLE_PYRAMID,
} from './solid_script_examples_flat.js';
import {
  SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS,
  SOLID_SCRIPT_EXAMPLE_PIPE,
  SOLID_SCRIPT_EXAMPLE_TORUS,
} from './solid_script_examples_swept.js';
import { SOLID_SCRIPT_EXAMPLE_STAIRS } from './solid_script_examples_stairs.js';
import { SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE } from './solid_script_examples_showcase.js';
import {
  SOLID_SCRIPT_EXAMPLE_LINEAR_ARRAY,
  SOLID_SCRIPT_EXAMPLE_RADIAL_ARRAY,
  SOLID_SCRIPT_EXAMPLE_TRANSFORM_ARRAY,
  SOLID_SCRIPT_EXAMPLE_MIRROR,
  SOLID_SCRIPT_EXAMPLE_SHEAR,
  SOLID_SCRIPT_EXAMPLE_PUSH_OUT_FACES,
} from './solid_script_examples_modifiers.js';

/** Groups of the examples, in the order the Examples window shows them. */
export const SOLID_SCRIPT_EXAMPLE_GROUPS = ['Showcase', 'Basics', 'Built-In Generators', 'Built-In Modifiers'] as const;

/** Group of an example. */
export type SolidScriptExampleGroup = (typeof SOLID_SCRIPT_EXAMPLE_GROUPS)[number];

/** A built-in example script. */
export interface SolidScriptExample {
  /** Stable id. */
  id: string;
  /** Name shown in the Examples window, and of the new script. */
  name: string;
  /** Group it is listed under. */
  group: SolidScriptExampleGroup;
  /** One sentence on what it builds. */
  summary: string;
  /** Generator kind the script rebuilds line by line, or null. */
  port: string | null;
  /** Lines of the script. */
  lines: readonly SolidScriptLine[];
  /** Can Be Used As; a generator only when absent. */
  uses?: SolidScriptUses;
  /** Modifier kind the script rebuilds line by line; none for other examples. */
  modifier?: string;
}

/**
 * Builds the entry of a generator port.
 *
 * @param port Generator kind id, also the example id.
 * @param name Name shown.
 * @param lines Lines.
 * @returns Example.
 */
function solidScriptExamplePort(port: string, name: string, lines: readonly SolidScriptLine[]): SolidScriptExample {
  return {
    id: port,
    name,
    group: 'Built-In Generators',
    summary: `The ${name} generator, rebuilt line by line. It builds the same pieces, so you can see how it works and change it.`,
    port,
    lines,
  };
}

/**
 * Builds the entry of a modifier port, usable as a modifier only.
 *
 * @param modifier Modifier kind id, also the example id.
 * @param name Name shown.
 * @param lines Lines.
 * @returns Example.
 */
function solidScriptExampleModifier(
  modifier: string,
  name: string,
  lines: readonly SolidScriptLine[],
): SolidScriptExample {
  return {
    id: modifier,
    name,
    group: 'Built-In Modifiers',
    summary: `The ${name} modifier, rebuilt line by line. Add it as a SolidScript Modifier: it changes the brushes it receives the same way.`,
    port: null,
    lines,
    uses: { generator: false, modifier: true },
    modifier,
  };
}

/** Built-in example scripts, in the order the Examples window lists them. */
export const SOLID_SCRIPT_EXAMPLES: readonly SolidScriptExample[] = [
  {
    id: 'spiralStaircase',
    name: 'Spiral Staircase',
    group: 'Showcase',
    summary: 'A spiral staircase around a column, with a smooth sloped underside, posts and a handrail.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE,
  },
  {
    id: 'doorway',
    name: 'Wall With a Doorway',
    group: 'Basics',
    summary: 'A wall with a doorway cut out of it, using Move By and a name.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_DOORWAY,
  },
  {
    id: 'columns',
    name: 'Row of Columns',
    group: 'Basics',
    summary: 'Five columns in a row, stamped from one named part.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_COLUMNS,
  },
  {
    id: 'taperedBox',
    name: 'Tapered Box',
    group: 'Basics',
    summary: 'Scale Faces shrinks the top of a cube about its center, so the cube becomes a tapered block.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_TAPERED_BOX,
  },
  {
    id: 'irregularRock',
    name: 'Irregular Rock',
    group: 'Basics',
    summary: 'Scatter Points fills a box; Hull wraps the points in one lumpy solid. Change Seed for another rock.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_IRREGULAR_ROCK,
  },
  {
    id: 'steppingStones',
    name: 'Stepping Stones',
    group: 'Basics',
    summary: 'Slabs from one point to another, with a gentle wave, placed with Transform and turned with Rotate To.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_STEPPING_STONES,
  },
  {
    id: 'pillarRing',
    name: 'Ring of Pillars',
    group: 'Basics',
    summary: 'Pillars on a circle, each placed with one position made from an angle.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PILLAR_RING,
  },
  {
    id: 'knobs',
    name: 'Panel With Knobs',
    group: 'Basics',
    summary: 'Boxes get a Name; Select Faces Of Knob puts a ball only on the knobs, not on the panel.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_KNOBS,
  },
  {
    id: 'pebbles',
    name: 'Pebbles',
    group: 'Basics',
    summary: 'Pebbles scattered over the top of a slab with Scatter Points and For Each; the Seed picks the layout.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PEBBLES,
  },
  {
    id: 'roundedRail',
    name: 'Rounded Rail',
    group: 'Basics',
    summary: 'Path From Points rounds the corners of a rectangle; Curve To Mesh sweeps a tube along that path.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_ROUNDED_RAIL,
  },
  {
    id: 'hillyFloor',
    name: 'Hilly Floor',
    group: 'Basics',
    summary: 'Grid Mesh lays a floor; Displace lifts each point with Noise, so the same Seed is the same hills.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_HILLY_FLOOR,
  },
  {
    id: 'spikyBall',
    name: 'Spiky Ball',
    group: 'Basics',
    summary: 'Cones growing out of a ball: scattered points, with Align To turning each one to its face.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_SPIKY_BALL,
  },
  {
    id: 'pedestal',
    name: 'Pedestal',
    group: 'Basics',
    summary:
      'A slab under a box. Used as a modifier on a brush, mesh or group, it puts the slab under that instead and Input Brushes keeps it: If Used As picks the lines.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PEDESTAL,
    uses: { generator: true, modifier: true },
  },
  {
    id: 'pushOutFaces',
    name: 'Push Out Faces',
    group: 'Basics',
    summary:
      'A modifier: For Each [Brush] In [$Input.Brushes] lays a slab off every face of every brush it receives. It has no Input Brushes line, so the brushes themselves are gone.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PUSH_OUT_FACES,
    uses: { generator: false, modifier: true },
  },
  solidScriptExamplePort('pyramid', 'Pyramid', SOLID_SCRIPT_EXAMPLE_PYRAMID),
  solidScriptExamplePort('prism', 'Prism', SOLID_SCRIPT_EXAMPLE_PRISM),
  solidScriptExamplePort('cylinder', 'Cylinder', SOLID_SCRIPT_EXAMPLE_CYLINDER),
  solidScriptExamplePort('cone', 'Cone', SOLID_SCRIPT_EXAMPLE_CONE),
  solidScriptExamplePort('sphere', 'Sphere', SOLID_SCRIPT_EXAMPLE_SPHERE),
  solidScriptExamplePort('capsule', 'Capsule', SOLID_SCRIPT_EXAMPLE_CAPSULE),
  solidScriptExamplePort('hollowBox', 'Hollow Box', SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX),
  solidScriptExamplePort('column', 'Column', SOLID_SCRIPT_EXAMPLE_COLUMN),
  solidScriptExamplePort('pipe', 'Pipe', SOLID_SCRIPT_EXAMPLE_PIPE),
  solidScriptExamplePort('torus', 'Torus', SOLID_SCRIPT_EXAMPLE_TORUS),
  solidScriptExamplePort('curvedStairs', 'Curved Stairs', SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS),
  solidScriptExamplePort('arch', 'Arch', SOLID_SCRIPT_EXAMPLE_ARCH),
  solidScriptExamplePort('stairs', 'Stairs', SOLID_SCRIPT_EXAMPLE_STAIRS),
  solidScriptExampleModifier('shear', 'Shear', SOLID_SCRIPT_EXAMPLE_SHEAR),
  solidScriptExampleModifier('linear', 'Linear Array', SOLID_SCRIPT_EXAMPLE_LINEAR_ARRAY),
  solidScriptExampleModifier('mirror', 'Mirror', SOLID_SCRIPT_EXAMPLE_MIRROR),
  solidScriptExampleModifier('transform', 'Transform Array', SOLID_SCRIPT_EXAMPLE_TRANSFORM_ARRAY),
  solidScriptExampleModifier('radial', 'Radial Array', SOLID_SCRIPT_EXAMPLE_RADIAL_ARRAY),
];

/**
 * Finds the examples whose name, group or summary holds every word of a search.
 *
 * @param search Search text.
 * @returns Matching examples in list order.
 */
export function solidScriptExamplesFind(search: string): SolidScriptExample[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return SOLID_SCRIPT_EXAMPLES.filter((example) => {
    const text = `${example.name} ${example.group} ${example.summary}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
