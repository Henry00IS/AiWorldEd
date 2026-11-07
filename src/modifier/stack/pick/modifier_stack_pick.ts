import * as THREE from 'three';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierVolumeSceneRoot, ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/** Where a derived brush came from, read from its id. */
export interface ModifierStackDerivedOrigin {
  /** Uuid of the volume whose modifier produced the brush last. */
  volumeUuid: string;
  /** Id of that modifier. */
  stepId: string;
  /** Authored brush the chain started from, or null for generated pieces. */
  sourceId: string | null;
}

/** Last derived piece picked in a volume, for the inspector. */
export interface ModifierStackPickNote extends ModifierStackDerivedOrigin {
  /** Display name of the source brush, or empty. */
  sourceName: string;
}

const modifierStackPickNotes = new WeakMap<THREE.Object3D, ModifierStackPickNote>();

/**
 * Parses a derived brush id: copies are `source#volume:step:index`, generated
 * pieces are `volume#step:index`, and chains append further segments.
 *
 * @param id Brush id.
 * @returns Origin, or null for authored ids.
 */
export function modifierStackDerivedOriginOf(id: string): ModifierStackDerivedOrigin | null {
  const parts = id.split('#');
  const last = parts[parts.length - 1]?.split(':') ?? [];
  if (parts.length < 2) return null;
  const firstStep = parts[1]?.split(':') ?? [];
  const sourceId = firstStep.length === 3 ? (parts[0] ?? null) : null;
  if (last.length === 3) return { volumeUuid: last[0] ?? '', stepId: last[1] ?? '', sourceId };
  return { volumeUuid: parts[0] ?? '', stepId: last[0] ?? '', sourceId };
}

/**
 * Turns a ray hit on a generated or copied piece of a solid result into the
 * objects a click should cycle through: the owning volume first, then the
 * authored source brush. Repeated clicks on the same spot reach the source
 * through the editor's usual click-through cycle.
 *
 * @param hit Ray intersection.
 * @returns Volume and source meshes, or null when the hit is not derived.
 */
export function modifierStackPickTargets(hit: THREE.Intersection): THREE.Mesh[] | null {
  const mesh = hit.object;
  if (!(mesh instanceof THREE.Mesh) || !isResultMesh(mesh) || hit.faceIndex == null) return null;
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
    { brushId?: unknown; derivedId?: unknown }[] | undefined;
  const row = sources?.[hit.faceIndex];
  const brushId = row?.derivedId ?? row?.brushId;
  const origin = typeof brushId === 'string' ? modifierStackDerivedOriginOf(brushId) : null;
  if (!origin) return null;
  const volume = modifierStackPickVolume(mesh, origin.volumeUuid);
  if (!volume) return null;
  const source = origin.sourceId ? SolidModel.fromObject(mesh)?.findBrush(origin.sourceId) : undefined;
  modifierStackPickNotes.set(volume, { ...origin, sourceName: source?.name ?? '' });
  return source?.mesh ? [volume, source.mesh] : [volume];
}

/**
 * Finds a modifier volume mesh by uuid in the scene of a result mesh.
 *
 * @param mesh Result mesh.
 * @param uuid Volume uuid.
 * @returns Volume mesh, or null.
 */
function modifierStackPickVolume(mesh: THREE.Object3D, uuid: string): THREE.Mesh | null {
  const found = modifierVolumeSceneRoot(mesh).getObjectByProperty('uuid', uuid);
  return found instanceof THREE.Mesh && ModifierVolume.isVolume(found) ? found : null;
}

/**
 * Returns and forgets the last piece picked through a volume.
 *
 * @param volume Modifier volume.
 * @returns Note, or undefined.
 */
export function modifierStackPickNoteTake(volume: THREE.Object3D): ModifierStackPickNote | undefined {
  const note = modifierStackPickNotes.get(volume);
  modifierStackPickNotes.delete(volume);
  return note;
}
