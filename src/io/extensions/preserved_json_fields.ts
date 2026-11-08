import type { Object3D } from 'three';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Reserved persistence field carrying unknown wire-envelope fields across
 * saves.
 */
const WIRE_FIELD = 'aiworlded:wire';
/** Unknown JSON fields are kept separately from executable editor state. */
const retained = new WeakMap<object, Map<string, Record<string, unknown>>>();
const ENTRY_KEYS =
  'uuid name type position rotation scale visible parentId geometryType geometryParams geometryData meshDocument contentTextureId decorativeEdges materialColor faceTextureMaps modifierBevel solidModel';
const BRUSH_KEYS =
  'id name operation position rotation scale visible surfaceTextureId faceTextureIds defaultMapping faceMappings defaultSurface faceSurfaces vertices wingEdges edgeFaceIndices faces';
const GROUP_KEYS = 'kind id name operation position rotation scale children visible locked';
const KNOWN: Record<string, string> = {
  entry: ENTRY_KEYS,
  brush: BRUSH_KEYS,
  group: GROUP_KEYS,
  model: 'brushes invertedWorld hierarchy',
  wire: 'id kind parent key model data',
};

/** Known data fields for each supported wire node kind. */
const DATA_KEYS: Record<NodeCollaborationState['kind'], string> = {
  entry: 'entry locked solid uv',
  brush: 'brush locked',
  solidGroup: 'name operation position rotation scale visible locked',
};

/** Known nested records; arrays remain atomic values. */
const NESTED: Record<string, string> = {
  position: 'x y z',
  rotation: 'x y z',
  scale: 'x y z',
  geometryData: 'position normal uv index groups',
  meshDocument: 'position faces uv surfaces',
  modifierBevel:
    'distance segments angleDegrees uvFlow uvLayout textureId blacklist uvScaleU uvScaleV uvOffsetU uvOffsetV uvRotation uvOwner uvPivot uvSpace',
  defaultSurface: 'textureId uv',
  uv: 'u v',
  solid: 'invertedWorld',
  defaultMapping: 'align scaleU scaleV offsetU offsetV rotationDeg textureId',
};

/**
 * Checks for JSON records, excluding arrays and null.
 *
 * @param value Candidate value.
 * @returns Whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Adds retained JSON records recursively without mutating either input.
 *
 * @param known Generated fields.
 * @param extra Retained unknown fields.
 * @returns Merged JSON record.
 */
function mergeFields(known: object, extra: Record<string, unknown>): Record<string, unknown> {
  const result = { ...known } as Record<string, unknown>;
  for (const [key, value] of Object.entries(extra)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? mergeFields(current, value) : value;
  }
  return result;
}

/**
 * Copies only unknown own fields; known optional fields cannot be resurrected.
 *
 * @param source JSON record.
 * @param keys Fields owned by this editor.
 * @returns Unknown fields with their JSON values untouched.
 */
function unknownFields(source: object, keys: string): Record<string, unknown> {
  const known = new Set([...keys.split(' '), WIRE_FIELD, '__proto__', 'prototype', 'constructor']);
  const result = Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));
  for (const [key, value] of Object.entries(source)) {
    const nested = NESTED[key];
    if (!known.has(key) || typeof nested !== 'string' || !isRecord(value)) continue;
    const extra = unknownFields(value, nested);
    if (Object.keys(extra).length) result[key] = extra;
  }
  return result;
}

/**
 * Captures unknown object fields and restores persisted wire extras.
 *
 * @param owner Runtime object or brush instance.
 * @param slot Serialization context.
 * @param source Incoming JSON record.
 */
export function preservedFieldsCapture(owner: object, slot: string, source: object): void {
  const slots = retained.get(owner) ?? new Map<string, Record<string, unknown>>();
  slots.set(slot, unknownFields(source, KNOWN[slot] ?? ''));
  const wire = (source as Record<string, unknown>)[WIRE_FIELD];
  if (typeof wire === 'object' && wire !== null && !Array.isArray(wire))
    slots.set('wire', wire as Record<string, unknown>);
  retained.set(owner, slots);
}

/**
 * Adds unknown fields without overriding any current known value.
 *
 * @param owner Runtime holder, or null before a brush has a mesh.
 * @param slot Serialization context.
 * @param known Current serialized fields.
 * @returns JSON record with retained fields.
 */
export function preservedFieldsApply<T extends object>(owner: object | null, slot: string, known: T): T {
  return mergeFields(known, owner === null ? {} : (retained.get(owner)?.get(slot) ?? {})) as T;
}

/**
 * Writes wire extras into a namespaced persistence-only field.
 *
 * @param owner Runtime holder.
 * @param value Serialized object.
 * @param fallback Optional brush instance used before it owns a mesh.
 * @returns Persistence record with wire extras when present.
 */
export function preservedFieldsSave<T extends object>(owner: object, value: T, fallback?: object): T {
  const wire = retained.get(owner)?.get('wire') ?? (fallback ? retained.get(fallback)?.get('wire') : undefined);
  return wire && Object.keys(wire).length ? { ...value, [WIRE_FIELD]: wire } : value;
}

/**
 * Captures unknown envelope/data fields and entry or brush payload extensions.
 *
 * @param object Runtime scene node.
 * @param state Applied wire state.
 * @param brush Optional brush instance for brush payload fields.
 */
export function preservedWireCapture(object: Object3D, state: NodeCollaborationState, brush?: object): void {
  const data = state.data as unknown as Record<string, unknown>;
  const keys = DATA_KEYS[state.kind];
  const wire = unknownFields(state, KNOWN['wire'] ?? '');
  const dataExtra = unknownFields(data, keys);
  if (Object.keys(dataExtra).length) wire['data'] = dataExtra;
  const slots = retained.get(object) ?? new Map<string, Record<string, unknown>>();
  if (Object.keys(wire).length) slots.set('wire', wire);
  else slots.delete('wire');
  retained.set(object, slots);
  if (state.kind === 'entry') preservedFieldsCapture(object, 'entry', data['entry'] as object);
  if (state.kind === 'entry' && isRecord(data['solid'])) preservedFieldsCapture(object, 'model', data['solid']);
  if (state.kind === 'solidGroup') preservedFieldsCapture(object, 'group', data);
  if (state.kind === 'brush' && brush) preservedFieldsCapture(brush, 'brush', data['brush'] as object);
}

/**
 * Re-emits unknown wire fields on local edits without interpreting them.
 *
 * @param object Runtime holder.
 * @param state Current known state.
 * @param fallback Optional brush instance with restored wire fields.
 * @returns State preserving unknown fields.
 */
export function preservedWireApply(
  object: object,
  state: NodeCollaborationState,
  fallback?: object,
): NodeCollaborationState {
  const wire = retained.get(object)?.get('wire') ?? (fallback ? retained.get(fallback)?.get('wire') : undefined);
  if (!wire) return state;
  const root = unknownFields(wire, KNOWN['wire'] ?? '');
  const keys = DATA_KEYS[state.kind];
  const data = isRecord(wire['data']) ? unknownFields(wire['data'], keys) : {};
  return { ...state, ...root, data: mergeFields(state.data, data) } as unknown as NodeCollaborationState;
}
