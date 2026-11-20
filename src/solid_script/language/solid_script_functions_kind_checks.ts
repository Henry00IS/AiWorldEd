import { solidScriptKindOf } from './solid_script_kinds.js';
import type { SolidScriptFunctionDoc, SolidScriptKindName } from './solid_script_function_docs.js';
import type { SolidScriptValue } from './solid_script_value.js';

/** Official Is* check for one kind the editor names. */
export interface SolidScriptKindCheck {
  /** Built-in key, such as is_num. */
  key: string;
  /** Call as scripts write it. */
  usage: string;
  /** What it is Yes for. */
  summary: string;
  /** Kinds it says Yes for, so If can narrow. */
  checks: readonly SolidScriptKindName[];
}

/**
 * Official Is* check for every kind, including the older names IsNum, IsList,
 * IsString and IsBool. IsUndef is not a kind and stays separate.
 */
export const SOLID_SCRIPT_KIND_CHECKS = {
  Number: { key: 'is_num', usage: 'IsNum(value)', summary: 'Yes for a number, such as IsNum(3).', checks: ['Number'] },
  Text: {
    key: 'is_string',
    usage: 'IsString(value)',
    summary: 'Yes for text, such as IsString(hello).',
    checks: ['Text'],
  },
  'Yes/No': {
    key: 'is_bool',
    usage: 'IsBool(value)',
    summary: 'Yes for Yes or No, such as IsBool(Yes).',
    checks: ['Yes/No'],
  },
  Vector: {
    key: 'is_vector',
    usage: 'IsVector(value)',
    summary: 'Yes for a vector of two or three numbers, such as IsVector(Vector(0, 1, 0)).',
    checks: ['Vector'],
  },
  Brush: {
    key: 'is_brush',
    usage: 'IsBrush(value)',
    summary: 'Yes for a convex brush, such as IsBrush([Wall]).',
    checks: ['Brush'],
  },
  Mesh: {
    key: 'is_mesh',
    usage: 'IsMesh(value)',
    summary: 'Yes for a mesh, such as IsMesh([Skin]).',
    checks: ['Mesh'],
  },
  Face: {
    key: 'is_face',
    usage: 'IsFace(value)',
    summary: 'Yes for a face, such as IsFace([$Face]).',
    checks: ['Face'],
  },
  Edge: {
    key: 'is_edge',
    usage: 'IsEdge(value)',
    summary: 'Yes for an edge, such as IsEdge([$Edge]).',
    checks: ['Edge'],
  },
  Vertex: {
    key: 'is_vertex',
    usage: 'IsVertex(value)',
    summary: 'Yes for a corner, such as IsVertex([$Vertex]).',
    checks: ['Vertex'],
  },
  List: {
    key: 'is_list',
    usage: 'IsList(value)',
    summary: 'Yes for a list or vector, such as IsList($[1, 2$]).',
    checks: ['List', 'Vector'],
  },
  Data: {
    key: 'is_data',
    usage: 'IsData(value)',
    summary: 'Yes for the values kept under .Data, such as IsData([Brush.Data]).',
    checks: ['Data'],
  },
} as const satisfies Record<string, SolidScriptKindCheck>;

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Makes a check that is Yes when the value has one kind.
 *
 * @param kind Kind it is Yes for.
 * @returns Built-in.
 */
function solidScriptKindCheck(kind: string): SolidScriptBuiltin {
  return (args) => solidScriptKindOf(args[0]) === kind;
}

/**
 * Builds one function's help from a kind check.
 *
 * @param check Check.
 * @returns Docs.
 */
function solidScriptKindCheckDoc(check: SolidScriptKindCheck): SolidScriptFunctionDoc {
  return { usage: check.usage, summary: check.summary, group: 'Checks', gives: ['Yes/No'], checks: [...check.checks] };
}

/**
 * New kind checks; IsNum, IsList, IsString and IsBool stay in the core
 * builtins.
 */
export const SOLID_SCRIPT_FUNCTIONS_KIND_CHECKS = {
  is_vector: solidScriptKindCheck('Vector'),
  is_brush: solidScriptKindCheck('Brush'),
  is_mesh: solidScriptKindCheck('Mesh'),
  is_face: solidScriptKindCheck('Face'),
  is_edge: solidScriptKindCheck('Edge'),
  is_vertex: solidScriptKindCheck('Vertex'),
  is_data: solidScriptKindCheck('Data'),
} as const satisfies Readonly<Record<string, SolidScriptBuiltin>>;

/** Docs for the new kind checks, with literal keys so the catalog types them. */
export const SOLID_SCRIPT_KIND_CHECK_DOCS = {
  is_vector: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Vector),
  is_brush: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Brush),
  is_mesh: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Mesh),
  is_face: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Face),
  is_edge: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Edge),
  is_vertex: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Vertex),
  is_data: solidScriptKindCheckDoc(SOLID_SCRIPT_KIND_CHECKS.Data),
} as const;

/** Input help for the new kind checks. */
export const SOLID_SCRIPT_KIND_CHECK_ARGUMENTS = {
  is_vector: { value: { type: 'Any', about: 'The value to check.' } },
  is_brush: { value: { type: 'Any', about: 'The value to check.' } },
  is_mesh: { value: { type: 'Any', about: 'The value to check.' } },
  is_face: { value: { type: 'Any', about: 'The value to check.' } },
  is_edge: { value: { type: 'Any', about: 'The value to check.' } },
  is_vertex: { value: { type: 'Any', about: 'The value to check.' } },
  is_data: { value: { type: 'Any', about: 'The value to check.' } },
} as const;
