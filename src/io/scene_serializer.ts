import * as THREE from 'three';
import { SceneJSON, ObjectEntry, GeometryType } from './io_types.js';
import { BufferGeometryCodec } from './buffer_geometry_codec.js';
import { getFaceTextureMaps } from '../texture/face_texture_storage.js';

/**
 * Schema version for serialized scene files.
 * Version 3 adds face texture maps and optional buffer UV channels.
 */
const SCHEMA_VERSION = 3;

/**
 * Serializes a Three.js scene graph into a JSON-compatible structure.
 * Walks the object hierarchy and records geometry, transform, and hierarchy data.
 */
export class SceneSerializer {
  private bufferGeometryCodec: BufferGeometryCodec;

  /**
   * Creates a serializer with a buffer geometry codec for custom meshes.
   */
  constructor() {
    this.bufferGeometryCodec = new BufferGeometryCodec();
  }

  /**
   * Serializes all children of the given group into SceneJSON.
   * @param worldGroup The root group containing the scene objects.
   * @returns A SceneJSON object representing the full scene state.
   */
  serialize(worldGroup: THREE.Group): SceneJSON {
    const entries: ObjectEntry[] = [];
    this.collectEntries(worldGroup, entries);
    return {
      version: SCHEMA_VERSION,
      objects: entries
    };
  }

  /**
   * Recursively collects object entries from the group hierarchy.
   * @param object The current object being processed.
   * @param entries The accumulating array of object entries.
   */
  private collectEntries(object: THREE.Object3D, entries: ObjectEntry[]): void {
    object.children.forEach((child) => {
      if (!this.shouldSerializeChild(child)) return;
      const entry = this.createEntryForChild(child, object.uuid);
      entries.push(entry);
      if (child instanceof THREE.Group) {
        this.collectEntries(child, entries);
      }
    });
  }

  /**
   * Returns whether a child should appear in the scene file.
   * Skips decorative edges, overlays, and other non-content objects.
   * @param child The candidate child object.
   * @returns True for meshes and groups that represent scene content.
   */
  private shouldSerializeChild(child: THREE.Object3D): boolean {
    if (child.userData.isClipPlanePreview === true) return false;
    if (child instanceof THREE.Mesh) return true;
    if (child instanceof THREE.Group) return true;
    return false;
  }

  /**
   * Creates an ObjectEntry for a single child object.
   * @param child The child object to serialize.
   * @param parentId The UUID of the parent container.
   * @returns A populated ObjectEntry.
   */
  private createEntryForChild(child: THREE.Object3D, parentId: string): ObjectEntry {
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
      parentId: parentId
    };
  }

  /**
   * Creates an Euler rotation from the object's current rotation.
   * @param object The object to extract rotation from.
   * @returns An Euler instance in XYZ order.
   */
  private buildEulerFromObject(object: THREE.Object3D): THREE.Euler {
    return new THREE.Euler(
      object.rotation.x,
      object.rotation.y,
      object.rotation.z,
      'XYZ'
    );
  }

  /**
   * Extracts position data as a plain object.
   * @param object The object to extract position from.
   * @returns An object with x, y, z properties.
   */
  private extractPositionData(object: THREE.Object3D): { x: number; y: number; z: number } {
    return {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z
    };
  }

  /**
   * Extracts rotation data as a plain object.
   * @param euler The Euler rotation to extract.
   * @returns An object with x, y, z properties.
   */
  private extractRotationData(euler: THREE.Euler): { x: number; y: number; z: number } {
    return {
      x: euler.x,
      y: euler.y,
      z: euler.z
    };
  }

  /**
   * Extracts scale data as a plain object.
   * @param object The object to extract scale from.
   * @returns An object with x, y, z properties.
   */
  private extractScaleData(object: THREE.Object3D): { x: number; y: number; z: number } {
    return {
      x: object.scale.x,
      y: object.scale.y,
      z: object.scale.z
    };
  }

  /**
   * Adds mesh-specific data to a base entry.
   * @param mesh The mesh object to extract data from.
   * @param entry The base entry to enrich.
   * @returns The entry with geometry and material data populated.
   */
  private enrichWithMeshData(mesh: THREE.Mesh, entry: ObjectEntry): ObjectEntry {
    const geometryType = this.detectGeometryType(mesh.geometry);
    entry.geometryType = geometryType;
    entry.materialColor = this.extractMaterialColor(mesh);
    this.attachFaceTextureMaps(mesh, entry);
    if (geometryType === 'buffer') {
      entry.geometryData = this.bufferGeometryCodec.encode(mesh.geometry);
      return entry;
    }
    entry.geometryParams = this.extractGeometryParams(mesh.geometry, geometryType);
    return entry;
  }

  /**
   * Serializes face texture mapping tables when present.
   * @param mesh Source mesh.
   * @param entry Entry to enrich.
   */
  private attachFaceTextureMaps(mesh: THREE.Mesh, entry: ObjectEntry): void {
    const maps = getFaceTextureMaps(mesh);
    if (maps.length === 0) return;
    entry.faceTextureMaps = maps;
  }

  /**
   * Adds group-specific data to a base entry.
   * @param entry The base entry to mark as a group.
   * @returns The entry with type explicitly set to group.
   */
  private enrichWithGroupData(entry: ObjectEntry): ObjectEntry {
    entry.type = 'group';
    return entry;
  }

  /**
   * Detects the geometry type from a Three.js geometry instance.
   * Unknown / custom geometry is stored as buffer vertex data.
   * @param geometry The geometry to inspect.
   * @returns A string identifying the geometry type.
   */
  private detectGeometryType(geometry: THREE.BufferGeometry): GeometryType {
    if (geometry instanceof THREE.BoxGeometry) return 'box';
    if (geometry instanceof THREE.SphereGeometry) return 'sphere';
    if (geometry instanceof THREE.CylinderGeometry) return 'cylinder';
    if (geometry instanceof THREE.PlaneGeometry) return 'plane';
    return 'buffer';
  }

  /**
   * Extracts constructor parameters from a primitive geometry instance.
   * @param geometry The geometry to extract parameters from.
   * @param geometryType The detected geometry type.
   * @returns A record of parameter names to numeric values.
   */
  private extractGeometryParams(
    geometry: THREE.BufferGeometry,
    geometryType: GeometryType
  ): Record<string, number> {
    if (geometryType === 'box' && geometry instanceof THREE.BoxGeometry) {
      return this.extractBoxParams(geometry);
    }
    if (geometryType === 'sphere' && geometry instanceof THREE.SphereGeometry) {
      return this.extractSphereParams(geometry);
    }
    if (geometryType === 'cylinder' && geometry instanceof THREE.CylinderGeometry) {
      return this.extractCylinderParams(geometry);
    }
    if (geometryType === 'plane' && geometry instanceof THREE.PlaneGeometry) {
      return this.extractPlaneParams(geometry);
    }
    return {};
  }

  /**
   * Extracts box geometry parameters.
   * @param geo The box geometry.
   * @returns Parameters with width, height, and depth.
   */
  private extractBoxParams(geo: THREE.BoxGeometry): Record<string, number> {
    return {
      width: geo.parameters.width,
      height: geo.parameters.height,
      depth: geo.parameters.depth
    };
  }

  /**
   * Extracts sphere geometry parameters.
   * @param geo The sphere geometry.
   * @returns Parameters with radius and segment counts.
   */
  private extractSphereParams(geo: THREE.SphereGeometry): Record<string, number> {
    return {
      radius: geo.parameters.radius,
      widthSegments: geo.parameters.widthSegments,
      heightSegments: geo.parameters.heightSegments
    };
  }

  /**
   * Extracts cylinder geometry parameters.
   * @param geo The cylinder geometry.
   * @returns Parameters with radii, height, and segment count.
   */
  private extractCylinderParams(geo: THREE.CylinderGeometry): Record<string, number> {
    return {
      radiusTop: geo.parameters.radiusTop,
      radiusBottom: geo.parameters.radiusBottom,
      height: geo.parameters.height,
      radialSegments: geo.parameters.radialSegments
    };
  }

  /**
   * Extracts plane geometry parameters.
   * @param geo The plane geometry.
   * @returns Parameters with width and height.
   */
  private extractPlaneParams(geo: THREE.PlaneGeometry): Record<string, number> {
    return {
      width: geo.parameters.width,
      height: geo.parameters.height
    };
  }

  /**
   * Extracts the material color from a mesh.
   * @param mesh The mesh to inspect.
   * @returns The material color as a hex number, or zero if unavailable.
   */
  private extractMaterialColor(mesh: THREE.Mesh): number {
    const material = mesh.material;
    if (material && 'color' in material && material.color instanceof THREE.Color) {
      return material.color.getHex();
    }
    return 0;
  }
}
