import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_CAPSULE,
  SOLID_SCRIPT_EXAMPLE_CONE,
  SOLID_SCRIPT_EXAMPLE_CYLINDER,
  SOLID_SCRIPT_EXAMPLE_SPHERE,
} from './solid_script_examples_round.js';
import {
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

/** A built-in example script. */
export interface SolidScriptExample {
  /** Stable id. */
  id: string;
  /** Name shown in the Load Script window. */
  name: string;
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
  return { id: port, name, port, lines };
}

/** Built-in example scripts, in the order the Load Script window lists them. */
export const SOLID_SCRIPT_EXAMPLES: readonly SolidScriptExample[] = [
  solidScriptExamplePort('cylinder', 'Cylinder', SOLID_SCRIPT_EXAMPLE_CYLINDER),
  solidScriptExamplePort('cone', 'Cone', SOLID_SCRIPT_EXAMPLE_CONE),
  solidScriptExamplePort('sphere', 'Sphere', SOLID_SCRIPT_EXAMPLE_SPHERE),
  solidScriptExamplePort('capsule', 'Capsule', SOLID_SCRIPT_EXAMPLE_CAPSULE),
  solidScriptExamplePort('pyramid', 'Pyramid', SOLID_SCRIPT_EXAMPLE_PYRAMID),
  solidScriptExamplePort('prism', 'Prism', SOLID_SCRIPT_EXAMPLE_PRISM),
  solidScriptExamplePort('hollowBox', 'Hollow Box', SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX),
  solidScriptExamplePort('stairs', 'Stairs', SOLID_SCRIPT_EXAMPLE_STAIRS),
  solidScriptExamplePort('pipe', 'Pipe', SOLID_SCRIPT_EXAMPLE_PIPE),
  solidScriptExamplePort('torus', 'Torus', SOLID_SCRIPT_EXAMPLE_TORUS),
  solidScriptExamplePort('curvedStairs', 'Curved Stairs', SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS),
];
