import * as THREE from 'three';
import { SceneJSON, ObjectEntry, GeometryType } from './io_types.js';
import { BufferGeometryCodec } from '@/io/geometry/buffer_geometry_codec.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { serializeFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { CONTENT_MESH_TEXTURE_ID_USERDATA_KEY } from '@/texture/uv/content_mesh_texture.js';
import { detectGeometrySourceFromInstance, getGeometrySource } from '@/texture/uv/geometry_source.js';
import { MeshDocumentCodec } from '@/io/geometry/mesh_document_codec.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { isDecorativeEdge } from '@/utils/mesh_edge_sync.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { ModifierVolumeBevel, type ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import { currentSharedContentMaterialList } from '@/viewports/shared/shared_content_material_store.js';

/**
 * Schema version for serialized scene files. Version 3 adds face texture maps
 * and optional buffer UV channels.
 */
const SCHEMA_VERSION = 3;

/**
 * Serializes a Three.js scene graph into a JSON-compatible structure. Walks the
 * object hierarchy and records geometry, transform, and hierarchy data.
 */
export class SceneSerializer {
  private bufferGeometryCodec: BufferGeometryCodec;
  private readonly meshDocumentCodec: MeshDocumentCodec;

  /** Creates a serializer with the vertex buffer and mesh document codecs. */
  constructor() {
    this.bufferGeometryCodec = new BufferGeometryCodec();
    this.meshDocumentCodec = new MeshDocumentCodec();
  }

  /**
   * Serializes all children of the given group into SceneJSON.
   *
   * @param worldGroup The root group containing the scene objects.
   * @returns A SceneJSON object representing the full scene state.
   */
  serialize(worldGroup: THREE.Group): SceneJSON {
    const entries: ObjectEntry[] = [];
    this.collectEntries(worldGroup, entries);
    return {
      version: SCHEMA_VERSION,
      objects: entries,
    };
  }

  /**
   * Recursively collects object entries from the group hierarchy.
   *
   * @param object The current object being processed.
   * @param entries The accumulating array of object entries.
   */
  private collectEntries(object: THREE.Object3D, entries: ObjectEntry[]): void {
    object.children.forEach((child) => {
      if (!this.shouldSerializeChild(child)) return;
      const entry = this.createEntryForChild(child, object.uuid);
      entries.push(entry);
      if (SolidModel.isSolidModelObject(child)) {
        return;
      }
      if (child instanceof THREE.Group) {
        this.collectEntries(child, entries);
      }
    });
  }

  /**
   * Returns whether a child should appear in the scene file. Skips decorative
   * edges, overlays, and other non-content objects.
   *
   * @param child The candidate child object.
   * @returns True for meshes and groups that represent scene content.
   */
  private shouldSerializeChild(child: THREE.Object3D): boolean {
    if (child.userData['isClipPlanePreview'] === true) return false;
    if (child instanceof THREE.Mesh) return true;
    if (child instanceof THREE.Group) return true;
    return false;
  }

  /**
   * Creates an ObjectEntry for a single child object.
   *
   * @param child The child object to serialize.
   * @param parentId The UUID of the parent container.
   * @returns A populated ObjectEntry.
   */
  private createEntryForChild(child: THREE.Object3D, parentId: string): ObjectEntry {
    const entry = this.entryBuildShallow(child, parentId);
    if (child instanceof THREE.Group) {
      this.attachSolidModelData(child, entry);
    }
    return entry;
  }

  /**
   * Creates an ObjectEntry for one object without descending into solid model
   * brushes.
   *
   * @param child The object to serialize.
   * @param parentId The UUID of the parent container.
   * @returns A populated ObjectEntry without solid model data.
   */
  entryBuildShallow(child: THREE.Object3D, parentId: string): ObjectEntry {
    const baseEntry = this.buildBaseEntry(child, parentId);
    if (child instanceof THREE.Mesh) {
      return this.enrichWithMeshData(child, baseEntry);
    }
    if (child instanceof THREE.Group) {
      return this.enrichWithGroupData(baseEntry);
    }
    return baseEntry;
  }

  /**
   * Builds the base entry fields shared by all object types.
   *
   * @param object The Three.js object to extract data from.
   * @param parentId The UUID of the parent group.
   * @returns A partially filled ObjectEntry.
   */
  private buildBaseEntry(object: THREE.Object3D, parentId: string): ObjectEntry {
    const euler = this.buildEulerFromObject(object);
    return {
      uuid: object.uuid,
      name: object.name,
      type: object instanceof THREE.Mesh ? 'mesh' : 'group',
      position: this.extractPositionData(object),
      rotation: this.extractRotationData(euler),
      scale: this.extractScaleData(object),
      visible: object.visible,
      parentId: parentId,
    };
  }

  /**
   * Creates an Euler rotation from the object's current rotation.
   *
   * @param object The object to extract rotation from.
   * @returns An Euler instance in XYZ order.
   */
  private buildEulerFromObject(object: THREE.Object3D): THREE.Euler {
    return new THREE.Euler(object.rotation.x, object.rotation.y, object.rotation.z, 'XYZ');
  }

  /**
   * Extracts position data as a plain object.
   *
   * @param object The object to extract position from.
   * @returns An object with x, y, z properties.
   */
  private extractPositionData(object: THREE.Object3D): { x: number; y: number; z: number } {
    return {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
    };
  }

  /**
   * Extracts rotation data as a plain object.
   *
   * @param euler The Euler rotation to extract.
   * @returns An object with x, y, z properties.
   */
  private extractRotationData(euler: THREE.Euler): { x: number; y: number; z: number } {
    return {
      x: euler.x,
      y: euler.y,
      z: euler.z,
    };
  }

  /**
   * Extracts scale data as a plain object.
   *
   * @param object The object to extract scale from.
   * @returns An object with x, y, z properties.
   */
  private extractScaleData(object: THREE.Object3D): { x: number; y: number; z: number } {
    return {
      x: object.scale.x,
      y: object.scale.y,
      z: object.scale.z,
    };
  }

  /**
   * Adds mesh-specific data to a base entry. The exact vertex buffer and the
   * editable document are always stored so a rebuilt mesh keeps the creator's
   * shape, orientation, UVs and faces; primitive params are kept only as the
   * geometry source that UV tools read.
   *
   * @param mesh The mesh object to extract data from.
   * @param entry The base entry to enrich.
   * @returns The entry with geometry and material data populated.
   */
  private enrichWithMeshData(mesh: THREE.Mesh, entry: ObjectEntry): ObjectEntry {
    const source =
      getGeometrySource(mesh) ?? getGeometrySource(mesh.geometry) ?? detectGeometrySourceFromInstance(mesh.geometry);
    entry.geometryType = source === null ? 'buffer' : (source.type as GeometryType);
    entry.materialColor = this.extractMaterialColor(mesh);
    this.attachFaceTextureMaps(mesh, entry);
    this.attachBevelVolume(mesh, entry);
    entry.geometryData = this.bufferGeometryCodec.encode(mesh.geometry);
    if (source !== null) entry.geometryParams = { ...source.params };
    this.attachMeshDocument(mesh, entry);
    const contentTextureId = mesh.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY];
    if (typeof contentTextureId === 'string') entry.contentTextureId = contentTextureId;
    if (!mesh.children.some(isDecorativeEdge)) entry.decorativeEdges = false;
    return entry;
  }

  /**
   * Records the editable polygon document when the mesh carries one.
   *
   * @param mesh Source mesh.
   * @param entry Entry to enrich.
   */
  private attachMeshDocument(mesh: THREE.Mesh, entry: ObjectEntry): void {
    const document = readPersistentMeshDocument(mesh);
    if (document === null) return;
    entry.meshDocument = this.meshDocumentCodec.encode(document);
  }

  /**
   * Records bevel-volume distance when the mesh is a modifier volume.
   *
   * @param mesh Source mesh.
   * @param entry Entry to enrich.
   */
  private attachBevelVolume(mesh: THREE.Mesh, entry: ObjectEntry): void {
    if (!ModifierVolumeBevel.isVolume(mesh)) return;
    const settings = ModifierVolumeBevel.readSettings(mesh);
    entry.modifierBevel = {
      distance: settings.distance,
      segments: settings.segments,
      angleDegrees: settings.angleDegrees,
      uvFlow: settings.uvFlow,
      uvLayout: settings.uvLayout,
      textureId: settings.textureId,
    };
    this.modifierBevelAttachBlacklist(entry.modifierBevel, settings.blacklist);
    this.modifierBevelAttachPlacement(entry.modifierBevel, settings);
  }

  /**
   * Stores generated UV scale, offset, and rotation.
   *
   * @param bevel Serialized bevel fields.
   * @param settings Volume settings.
   */
  private modifierBevelAttachPlacement(
    bevel: NonNullable<ObjectEntry['modifierBevel']>,
    settings: ModifierBevelVolumeSettings,
  ): void {
    bevel.uvScaleU = settings.uvScaleU;
    bevel.uvScaleV = settings.uvScaleV;
    bevel.uvOffsetU = settings.uvOffsetU;
    bevel.uvOffsetV = settings.uvOffsetV;
    bevel.uvRotation = settings.uvRotation;
    bevel.uvOwner = settings.uvOwner;
    bevel.uvPivot = settings.uvPivot;
    bevel.uvSpace = settings.uvSpace;
  }

  /**
   * Stores ignored object ids when the volume has any.
   *
   * @param bevel Serialized bevel fields.
   * @param ids Ignored object ids.
   */
  private modifierBevelAttachBlacklist(bevel: NonNullable<ObjectEntry['modifierBevel']>, ids: readonly string[]): void {
    if (ids.length === 0) return;
    bevel.blacklist = ids.slice();
  }

  /**
   * Attaches solid-model brush data when the object is a solid model root.
   *
   * @param object Source object (solid model group).
   * @param entry Entry to enrich.
   */
  private attachSolidModelData(object: THREE.Object3D, entry: ObjectEntry): void {
    if (!SolidModel.isSolidModelObject(object)) return;
    const model = SolidModel.fromObject(object);
    if (!model || model.root !== object) return;
    const solidModel = SolidModelCodec.encode(model) as unknown as NonNullable<ObjectEntry['solidModel']>;
    entry.solidModel = solidModel;
  }

  /**
   * Serializes face texture mapping tables when present.
   *
   * @param mesh Source mesh.
   * @param entry Entry to enrich.
   */
  private attachFaceTextureMaps(mesh: THREE.Mesh, entry: ObjectEntry): void {
    const maps = getFaceTextureMaps(mesh);
    if (maps.length === 0) return;
    const plain = maps.map((map) => ({
      triangleIndices: map.triangleIndices.slice(),
      mapping: serializeFaceTextureMapping(map.mapping),
    }));
    entry.faceTextureMaps = plain as unknown as NonNullable<ObjectEntry['faceTextureMaps']>;
  }

  /**
   * Adds group-specific data to a base entry.
   *
   * @param entry The base entry to mark as a group.
   * @returns The entry with type explicitly set to group.
   */
  private enrichWithGroupData(entry: ObjectEntry): ObjectEntry {
    entry.type = 'group';
    return entry;
  }

  /**
   * Extracts the content material color from a mesh, ignoring temporary shading
   * override materials of wireframe and flat view modes.
   *
   * @param mesh The mesh to inspect.
   * @returns The material color as a hex number, or zero if unavailable.
   */
  private extractMaterialColor(mesh: THREE.Mesh): number {
    const material = currentSharedContentMaterialList(mesh)[0];
    if (material && 'color' in material && material.color instanceof THREE.Color) {
      return material.color.getHex();
    }
    return 0;
  }
}
