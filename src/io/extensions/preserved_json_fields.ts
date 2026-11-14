import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import type { SerializedSolidTreeModifierNode } from '@/solid/io/solid_model_modifier_codec.js';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import type {
  SerializedSolidBrush,
  SerializedSolidModel,
  SerializedSolidTreeGroupNode,
} from '@/solid/io/solid_model_codec.js';
import type {
  NodeCollaborationEntryData,
  NodeCollaborationBrushData,
  NodeCollaborationSolidGroupData,
} from '@/collaboration/scene/node_collaboration_types.js';
import type { Object3D } from 'three';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Reserved persistence field carrying unknown wire-envelope fields across
 * saves.
 */
const WIRE_FIELD = 'aiworlded:wire';
/** Unknown JSON fields are kept separately from executable editor state. */
const retained = new WeakMap<object, Map<string, Record<string, unknown>>>();
const ENTRY_KEYS = typedFieldKeys<ObjectEntry>({
  uuid: true,
  name: true,
  type: true,
  position: true,
  rotation: true,
  scale: true,
  visible: true,
  parentId: true,
  geometryType: true,
  geometryParams: true,
  geometryData: true,
  meshDocument: true,
  contentTextureId: true,
  decorativeEdges: true,
  materialColor: true,
  faceTextureMaps: true,
  modifierStack: true,
  modifierBevel: true,
  solidModel: true,
});
const BRUSH_KEYS = typedFieldKeys<SerializedSolidBrush>({
  id: true,
  name: true,
  operation: true,
  position: true,
  rotation: true,
  scale: true,
  visible: true,
  surfaceTextureId: true,
  faceTextureIds: true,
  defaultMapping: true,
  faceMappings: true,
  defaultSurface: true,
  faceSurfaces: true,
  vertices: true,
  wingEdges: true,
  edgeFaceIndices: true,
  faces: true,
});
const GROUP_KEYS = typedFieldKeys<SerializedSolidTreeGroupNode & NodeCollaborationSolidGroupData>({
  kind: true,
  id: true,
  name: true,
  operation: true,
  position: true,
  rotation: true,
  scale: true,
  children: true,
  visible: true,
  locked: true,
  modifierStack: true,
});
const STACK_KEYS = typedFieldKeys<ModifierStackSettings>({
  version: true,
  enabled: true,
  grouping: true,
  excludedIds: true,
  modifiers: true,
  role: true,
});
const KNOWN: Record<string, string> = {
  modifier: typedFieldKeys<SerializedSolidTreeModifierNode>({
    kind: true,
    id: true,
    name: true,
    position: true,
    rotation: true,
    scale: true,
    visible: true,
    settings: true,
  }),
  entry: ENTRY_KEYS,
  brush: BRUSH_KEYS,
  group: GROUP_KEYS,
  model: typedFieldKeys<SerializedSolidModel>({ brushes: true, invertedWorld: true, hierarchy: true }),
  wire: typedFieldKeys<NodeCollaborationState>({
    id: true,
    kind: true,
    parent: true,
    key: true,
    model: true,
    data: true,
  }),
};

/** Known data fields for each supported wire node kind. */
const DATA_KEYS: Record<NodeCollaborationState['kind'], string> = {
  entry: typedFieldKeys<NodeCollaborationEntryData>({ entry: true, locked: true, solid: true, uv: true }),
  brush: typedFieldKeys<NodeCollaborationBrushData>({ brush: true, locked: true, modifierStack: true }),
  solidGroup: typedFieldKeys<NodeCollaborationSolidGroupData>({
    name: true,
    operation: true,
    position: true,
    rotation: true,
    scale: true,
    visible: true,
    locked: true,
    modifierStack: true,
  }),
};

/** Known nested records; arrays remain atomic values. */
const NESTED: Record<string, string> = {
  modifierStack: STACK_KEYS,
  settings: STACK_KEYS,
  position: typedFieldKeys<ObjectEntry['position']>({ x: true, y: true, z: true }),
  rotation: typedFieldKeys<ObjectEntry['rotation']>({ x: true, y: true, z: true }),
  scale: typedFieldKeys<ObjectEntry['scale']>({ x: true, y: true, z: true }),
  geometryData: typedFieldKeys<NonNullable<ObjectEntry['geometryData']>>({
    position: true,
    normal: true,
    uv: true,
    index: true,
    groups: true,
  }),
  meshDocument: typedFieldKeys<NonNullable<ObjectEntry['meshDocument']>>({
    position: true,
    faces: true,
    uv: true,
    surfaces: true,
  }),
  modifierBevel: typedFieldKeys<NonNullable<ObjectEntry['modifierBevel']>>({
    options: true,
    distance: true,
    segments: true,
    angleDegrees: true,
    uvFlow: true,
    uvLayout: true,
    textureId: true,
    blacklist: true,
    uvScaleU: true,
    uvScaleV: true,
    uvOffsetU: true,
    uvOffsetV: true,
    uvRotation: true,
    uvOwner: true,
    uvPivot: true,
    uvSpace: true,
  }),
  defaultSurface: typedFieldKeys<NonNullable<SerializedSolidBrush['defaultSurface']>>({ textureId: true, uv: true }),
  uv: typedFieldKeys<NonNullable<SerializedSolidBrush['defaultSurface']>['uv']>({ u: true, v: true }),
  solid: typedFieldKeys<NonNullable<NodeCollaborationEntryData['solid']>>({ invertedWorld: true }),
  defaultMapping: typedFieldKeys<NonNullable<SerializedSolidBrush['defaultMapping']>>({
    uv: true,
    align: true,
    scaleU: true,
    scaleV: true,
    offsetU: true,
    offsetV: true,
    rotationDeg: true,
    textureId: true,
  }),
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
 * Adds only absent retained fields recursively; current editor-written values
 * always win.
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
    if (!Object.hasOwn(known, key)) result[key] = value;
    else if (isRecord(current) && isRecord(value)) result[key] = mergeFields(current, value);
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
 * Adds absent unknown fields; current serialized values win at every depth.
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
  return { ...mergeFields(state, root), data: mergeFields(state.data, data) } as unknown as NodeCollaborationState;
}

/**
 * Derives keys from an exhaustive typed record, making schema drift a type
 * error.
 *
 * @param fields Every key of the serialized type, including optional keys.
 * @returns Known field names used to retain only truly unknown data.
 */
function typedFieldKeys<T>(fields: { [P in keyof T]-?: true }): string {
  return Object.keys(fields).join(' ');
}
