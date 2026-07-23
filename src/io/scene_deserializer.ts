import * as THREE from 'three';
import { SceneJSON, ObjectEntry, GeometryType, BufferGeometryData } from './io_types.js';
import { BufferGeometryCodec } from './buffer_geometry_codec.js';
import { rebuildDecorativeEdges } from '../utils/mesh_edge_sync.js';
import { createContentMaterial } from '../materials/content_material_factory.js';
import { setFaceTextureMaps } from '../texture/face_texture_storage.js';
import { rebakeStoredFaceTextureMaps } from '../texture/planar_uv_projector.js';
import { initializeMeshTextureUVs } from '../texture/face_texture_applier.js';
import { FaceTextureMapEntry } from '../texture/face_texture_mapping.js';
import { rebuildSurfaceMaterials } from '../texture/surface_material_builder.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../texture/texture_id.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '../managers/clip_plane_preview.js';
import { SolidModelCodec } from '../solid/io/solid_model_codec.js';
import { SerializedSolidModel } from '../solid/io/solid_model_codec.js';

/**
 * Reconstructs a Three.js scene graph from serialized JSON data.
 * Performs two passes: object creation and parent-child resolution.
 */
export class SceneDeserializer {
  private bufferGeometryCodec: BufferGeometryCodec;

  /**
   * Creates a deserializer with a buffer geometry codec for custom meshes.
   */
  constructor() {
    this.bufferGeometryCodec = new BufferGeometryCodec();
  }

  /**
   * Deserializes scene data into Three.js objects and adds them to the group.
   * Clears existing children before loading.
   * @param data The serialized scene JSON.
   * @param worldGroup The target group to populate with deserialized objects.
   * @returns Array of top-level objects that were created.
   */
  deserialize(data: SceneJSON, worldGroup: THREE.Group): THREE.Object3D[] {
    this.disposeExistingChildren(worldGroup);
    const objectMap = new Map<string, THREE.Object3D>();
    const topLevelObjects: THREE.Object3D[] = [];
    this.createObjectsFromEntries(data.objects, objectMap);
    this.resolveParentChildRelationships(data.objects, objectMap);
    topLevelObjects.push(...this.attachToGroup(worldGroup, objectMap));
    return topLevelObjects;
  }

  /**
   * Removes and disposes scene content children of the world group.
   * Editor helpers (clip plane preview) stay attached so tools remain visible.
   * @param worldGroup The group to clear.
   */
  private disposeExistingChildren(worldGroup: THREE.Group): void {
    const children = Array.from(worldGroup.children);
    children.forEach((child) => {
      if (this.isPreservedEditorHelper(child)) return;
      worldGroup.remove(child);
      this.disposeObject(child);
    });
  }

  /**
   * Returns true for non-content editor objects that must survive scene load.
   * @param object Candidate world child.
   * @returns True when the object should not be cleared.
   */
  private isPreservedEditorHelper(object: THREE.Object3D): boolean {
    return object.userData[CLIP_PREVIEW_USERDATA_KEY] === true;
  }

  /**
   * Recursively disposes a Three.js object and its children.
   * @param object The object to dispose.
   */
  private disposeObject(object: THREE.Object3D): void {
    const children = Array.from(object.children);
    children.forEach((child) => this.disposeObject(child));
    if (object instanceof THREE.Mesh) {
      this.disposeMesh(object);
    }
  }

  /**
   * Disposes geometry and material of a mesh.
   * @param mesh The mesh to dispose resources for.
   */
  private disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }

  /**
   * First pass: creates all Three.js objects from entries and stores in map.
   * @param entries The serialized object entries.
   * @param objectMap The map to populate with created objects.
   */
  private createObjectsFromEntries(
    entries: ObjectEntry[],
    objectMap: Map<string, THREE.Object3D>
  ): void {
    entries.forEach((entry) => {
      const object = this.createObjectFromEntry(entry);
      objectMap.set(entry.uuid, object);
    });
  }

  /**
   * Creates a single Three.js object from an ObjectEntry.
   * @param entry The serialized entry data.
   * @returns The created Three.js object.
   */
  private createObjectFromEntry(entry: ObjectEntry): THREE.Object3D {
    if (entry.solidModel) {
      return this.createSolidModelFromEntry(entry);
    }
    if (entry.type === 'mesh') {
      return this.createMeshFromEntry(entry);
    }
    return this.createGroupFromEntry(entry);
  }

  /**
   * Creates a mesh object from entry data including geometry and material.
   * @param entry The serialized mesh entry.
   * @returns A configured Three.js mesh.
   */
  private createMeshFromEntry(entry: ObjectEntry): THREE.Mesh {
    const geometry = this.reconstructGeometry(entry);
    const material = this.reconstructMaterial(entry);
    const mesh = new THREE.Mesh(geometry, material);
    this.applyTransformToMesh(mesh, entry);
    this.applyFaceTextureData(mesh, entry);
    rebuildDecorativeEdges(mesh);
    return mesh;
  }

  /**
   * Restores a solid model group from brush snapshot data and rebuilds geometry.
   * @param entry Serialized entry with solidModel payload.
   * @returns Solid model root group with transforms applied.
   */
  private createSolidModelFromEntry(entry: ObjectEntry): THREE.Object3D {
    const model = SolidModelCodec.decode(
      entry.solidModel as SerializedSolidModel,
      entry.name
    );
    this.applyTransformToObject(model.root, entry);
    if (entry.uuid) {
      model.root.uuid = entry.uuid;
    }
    return model.root;
  }

  /**
   * Restores face texture maps and ensures UVs are baked for display.
   * @param mesh Loaded mesh.
   * @param entry Serialized entry.
   */
  private applyFaceTextureData(mesh: THREE.Mesh, entry: ObjectEntry): void {
    if (entry.faceTextureMaps && entry.faceTextureMaps.length > 0) {
      const maps = (entry.faceTextureMaps as FaceTextureMapEntry[]).map(
        (mapEntry) => ({
          triangleIndices: mapEntry.triangleIndices.slice(),
          mapping: {
            ...mapEntry.mapping,
            textureId:
              mapEntry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID
          }
        })
      );
      setFaceTextureMaps(mesh, maps);
      rebakeStoredFaceTextureMaps(mesh);
      rebuildSurfaceMaterials(mesh);
      return;
    }
    // No authored maps: always Checker — never the browser paint selection.
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
  }

  /**
   * Creates a group object from entry data.
   * @param entry The serialized group entry.
   * @returns A configured Three.js group.
   */
  private createGroupFromEntry(entry: ObjectEntry): THREE.Group {
    const group = new THREE.Group();
    this.applyTransformToObject(group, entry);
    return group;
  }

  /**
   * Reconstructs geometry from serialized type and parameters or buffer data.
   * @param entry The entry containing geometry data.
   * @returns A new geometry instance.
   */
  private reconstructGeometry(entry: ObjectEntry): THREE.BufferGeometry {
    if (entry.geometryType === 'buffer' || entry.geometryData) {
      return this.reconstructBufferGeometry(entry.geometryData);
    }
    if (!entry.geometryType) {
      return new THREE.BoxGeometry(1, 1, 1);
    }
    const params = entry.geometryParams || {};
    return this.buildGeometryFromType(entry.geometryType, params);
  }

  /**
   * Rebuilds a custom BufferGeometry from stored vertex arrays.
   * Falls back to a unit box when the payload is missing or empty.
   * @param geometryData Optional encoded buffer geometry.
   * @returns A reconstructed BufferGeometry.
   */
  private reconstructBufferGeometry(
    geometryData: BufferGeometryData | undefined
  ): THREE.BufferGeometry {
    if (!geometryData || geometryData.position.length < 9) {
      return new THREE.BoxGeometry(1, 1, 1);
    }
    return this.bufferGeometryCodec.decode(geometryData);
  }

  /**
   * Builds a geometry instance from a type string and parameter record.
   * @param geometryType The geometry type identifier.
   * @param params The constructor parameters.
   * @returns A new geometry instance.
   */
  private buildGeometryFromType(
    geometryType: GeometryType | string,
    params: Record<string, number>
  ): THREE.BufferGeometry {
    if (geometryType === 'box') return this.buildBoxGeometry(params);
    if (geometryType === 'sphere') return this.buildSphereGeometry(params);
    if (geometryType === 'cylinder') return this.buildCylinderGeometry(params);
    if (geometryType === 'plane') return this.buildPlaneGeometry(params);
    return new THREE.BoxGeometry(1, 1, 1);
  }

  /**
   * Constructs a box geometry from parameters.
   * @param params The parameter record.
   * @returns A box geometry instance.
   */
  private buildBoxGeometry(params: Record<string, number>): THREE.BufferGeometry {
    const width = params.width || 1;
    const height = params.height || 1;
    const depth = params.depth || 1;
    return new THREE.BoxGeometry(width, height, depth);
  }

  /**
   * Constructs a sphere geometry from parameters.
   * @param params The parameter record.
   * @returns A sphere geometry instance.
   */
  private buildSphereGeometry(params: Record<string, number>): THREE.BufferGeometry {
    const radius = params.radius || 1;
    const widthSegments = Math.floor(params.widthSegments) || 32;
    const heightSegments = Math.floor(params.heightSegments) || 32;
    return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  }

  /**
   * Constructs a cylinder geometry from parameters.
   * @param params The parameter record.
   * @returns A cylinder geometry instance.
   */
  private buildCylinderGeometry(params: Record<string, number>): THREE.BufferGeometry {
    const radiusTop = params.radiusTop || 1;
    const radiusBottom = params.radiusBottom || 1;
    const height = params.height || 1;
    const radialSegments = Math.floor(params.radialSegments) || 32;
    return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  }

  /**
   * Constructs a plane geometry from parameters.
   * @param params The parameter record.
   * @returns A plane geometry instance.
   */
  private buildPlaneGeometry(params: Record<string, number>): THREE.BufferGeometry {
    const width = params.width || 1;
    const height = params.height || 1;
    return new THREE.PlaneGeometry(width, height);
  }

  /**
   * Reconstructs material from serialized color data.
   * @param entry The entry containing material data.
   * @returns A configured mesh material.
   */
  private reconstructMaterial(entry: ObjectEntry): THREE.MeshStandardMaterial {
    const color = entry.materialColor || 0xffffff;
    return createContentMaterial(color, {
      flatShading: true,
      side: THREE.DoubleSide
    });
  }

  /**
   * Applies transform data from entry to a mesh.
   * Serialized rotation already includes plane orientation when saved.
   * @param mesh The target mesh.
   * @param entry The source entry.
   */
  private applyTransformToMesh(mesh: THREE.Mesh, entry: ObjectEntry): void {
    this.applyTransformToObject(mesh, entry);
  }

  /**
   * Applies transform data from entry to any Three.js object.
   * @param object The target object.
   * @param entry The source entry.
   */
  private applyTransformToObject(object: THREE.Object3D, entry: ObjectEntry): void {
    object.name = entry.name;
    object.uuid = entry.uuid;
    object.position.set(entry.position.x, entry.position.y, entry.position.z);
    object.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z, 'XYZ');
    object.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
    object.visible = entry.visible;
  }

  /**
   * Second pass: resolves parent-child hierarchy using UUID lookups.
   * @param entries The serialized entries.
   * @param objectMap The map of created objects keyed by UUID.
   */
  private resolveParentChildRelationships(
    entries: ObjectEntry[],
    objectMap: Map<string, THREE.Object3D>
  ): void {
    entries.forEach((entry) => {
      if (entry.parentId) {
        const parent = objectMap.get(entry.parentId);
        const child = objectMap.get(entry.uuid);
        if (parent && child) {
          parent.add(child);
        }
      }
    });
  }

  /**
   * Attaches top-level objects to the world group.
   * @param worldGroup The target group.
   * @param objectMap The map of created objects.
   * @returns Array of objects added to the group.
   */
  private attachToGroup(
    worldGroup: THREE.Group,
    objectMap: Map<string, THREE.Object3D>
  ): THREE.Object3D[] {
    const topLevelObjects: THREE.Object3D[] = [];
    const attachedUuids = new Set<string>();

    objectMap.forEach((obj, uuid) => {
      if (obj.parent && obj.parent !== worldGroup) {
        attachedUuids.add(uuid);
      }
    });

    objectMap.forEach((obj, uuid) => {
      if (!attachedUuids.has(uuid)) {
        worldGroup.add(obj);
        topLevelObjects.push(obj);
      }
    });

    return topLevelObjects;
  }
}
