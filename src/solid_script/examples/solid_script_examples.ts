import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_COLUMNS,
  SOLID_SCRIPT_EXAMPLE_DOORWAY,
  SOLID_SCRIPT_EXAMPLE_PILLAR_RING,
  SOLID_SCRIPT_EXAMPLE_STEPPING_STONES,
  SOLID_SCRIPT_EXAMPLE_PEBBLES,
  SOLID_SCRIPT_EXAMPLE_SPIKY_BALL,
} from './solid_script_examples_basics.js';
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

/** Groups of the examples, in the order the Examples window shows them. */
export const SOLID_SCRIPT_EXAMPLE_GROUPS = ['Showcase', 'Basics', 'Built-In Generators'] as const;

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
    summary: 'A wall with a doorway cut out of it.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_DOORWAY,
  },
  {
    id: 'columns',
    name: 'Row of Columns',
    group: 'Basics',
    summary: 'Five columns in a row, built from one named part.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_COLUMNS,
  },
  {
    id: 'pillarRing',
    name: 'Ring of Pillars',
    group: 'Basics',
    summary: 'Pillars on a circle, each placed with one position vector made from an angle.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PILLAR_RING,
  },
  {
    id: 'steppingStones',
    name: 'Stepping Stones',
    group: 'Basics',
    summary: 'Stones from one point to another: lerp walks between two vectors and pos.z makes a wave.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_STEPPING_STONES,
  },
  {
    id: 'pebbles',
    name: 'Pebbles',
    group: 'Basics',
    summary: 'Pebbles scattered over the top of a slab with For Each Scattered Point; the Seed picks the layout.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_PEBBLES,
  },
  {
    id: 'spikyBall',
    name: 'Spiky Ball',
    group: 'Basics',
    summary: 'Cones growing out of a ball: scattered points, with Align To turning each one to its face.',
    port: null,
    lines: SOLID_SCRIPT_EXAMPLE_SPIKY_BALL,
  },
  solidScriptExamplePort('cylinder', 'Cylinder', SOLID_SCRIPT_EXAMPLE_CYLINDER),
  solidScriptExamplePort('cone', 'Cone', SOLID_SCRIPT_EXAMPLE_CONE),
  solidScriptExamplePort('column', 'Column', SOLID_SCRIPT_EXAMPLE_COLUMN),
  solidScriptExamplePort('sphere', 'Sphere', SOLID_SCRIPT_EXAMPLE_SPHERE),
  solidScriptExamplePort('capsule', 'Capsule', SOLID_SCRIPT_EXAMPLE_CAPSULE),
  solidScriptExamplePort('pyramid', 'Pyramid', SOLID_SCRIPT_EXAMPLE_PYRAMID),
  solidScriptExamplePort('prism', 'Prism', SOLID_SCRIPT_EXAMPLE_PRISM),
  solidScriptExamplePort('hollowBox', 'Hollow Box', SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX),
  solidScriptExamplePort('arch', 'Arch', SOLID_SCRIPT_EXAMPLE_ARCH),
  solidScriptExamplePort('stairs', 'Stairs', SOLID_SCRIPT_EXAMPLE_STAIRS),
  solidScriptExamplePort('pipe', 'Pipe', SOLID_SCRIPT_EXAMPLE_PIPE),
  solidScriptExamplePort('torus', 'Torus', SOLID_SCRIPT_EXAMPLE_TORUS),
  solidScriptExamplePort('curvedStairs', 'Curved Stairs', SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS),
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
