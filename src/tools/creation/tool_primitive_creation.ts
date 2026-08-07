import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { DECORATIVE_EDGE_USERDATA_KEY, enableFlatShadingOnMesh } from '@/utils/mesh_edge_sync.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { setGeometrySource } from '@/texture/uv/geometry_source.js';

/**
 * Creates primitive meshes with auto-incremented names and default material.
 * Each primitive receives a standard material and edge wireframe.
 */
export class ToolPrimitiveCreation {
  private lastCreated: THREE.Mesh | null;
  private cubeCount: number;
  private sphereCount: number;
  private cylinderCount: number;
  private planeCount: number;

  /**
   * Creates a new primitive creation tool for the given container.
   *
   * @param _targetContainer The Three.js object intended to own created
   *   primitives.
   */
  constructor(_targetContainer: THREE.Object3D) {
    this.lastCreated = null;
    this.cubeCount = 0;
    this.sphereCount = 0;
    this.cylinderCount = 0;
    this.planeCount = 0;
  }

  /**
   * Creates a box primitive with the given dimensions.
   *
   * @param width The width of the box along the X axis.
   * @param height The height of the box along the Y axis.
   * @param depth The depth of the box along the Z axis.
   * @param position Optional position for the box.
   * @returns The created mesh.
   */
  createBox(width: number, height: number, depth: number, position?: THREE.Vector3): THREE.Mesh {
    this.cubeCount++;
    const document = createMeshDocumentBox(width, height, depth);
    const geometry = meshDocumentToBufferGeometry(document);
    const mesh = this.createBaseMesh(geometry, hierarchyNameAllocator.allocate('Cube'));
    writePersistentMeshDocument(mesh, document);
    setGeometrySource(mesh, {
      type: 'box',
      params: { width, height, depth },
    });
    if (position) {
      mesh.position.copy(position);
    }
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, undefined, undefined, { centerTexture: true });
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a sphere primitive with the given radius.
   *
   * @param radius The radius of the sphere.
   * @param position Optional position for the sphere.
   * @returns The created mesh.
   */
  createSphere(radius: number, position?: THREE.Vector3): THREE.Mesh {
    this.sphereCount++;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const mesh = this.buildMesh(geometry, hierarchyNameAllocator.allocate('Sphere'));
    if (position) mesh.position.copy(position);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a cylinder primitive with the given dimensions.
   *
   * @param radiusTop The top radius of the cylinder.
   * @param radiusBottom The bottom radius of the cylinder.
   * @param height The height of the cylinder.
   * @param position Optional position for the cylinder.
   * @returns The created mesh.
   */
  createCylinder(radiusTop: number, radiusBottom: number, height: number, position?: THREE.Vector3): THREE.Mesh {
    this.cylinderCount++;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32);
    const mesh = this.buildMesh(geometry, hierarchyNameAllocator.allocate('Cylinder'));
    if (position) mesh.position.copy(position);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a plane primitive with the given dimensions. Lays the plane flat on
   * XZ before world-space UV init so stored face UV matrices match the final
   * pose.
   *
   * @param width The width of the plane along the X axis.
   * @param height The height of the plane along the Z axis.
   * @param position Optional position for the plane.
   * @returns The created mesh.
   */
  createPlane(width: number, height: number, position?: THREE.Vector3): THREE.Mesh {
    this.planeCount++;
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = this.createBaseMesh(geometry, hierarchyNameAllocator.allocate('Plane'));
    if (position) mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Returns the last primitive mesh created by this tool.
   *
   * @returns The most recently created mesh, or null.
   */
  getLastCreatedObject(): THREE.Mesh | null {
    return this.lastCreated;
  }

  /**
   * Returns the total count of objects created across all types.
   *
   * @returns The cumulative count of created primitives.
   */
  getCreatedObjectCount(): number {
    return this.cubeCount + this.sphereCount + this.cylinderCount + this.planeCount;
  }

  /** Disposes all resources held by this tool. */
  dispose(): void {
    this.lastCreated = null;
  }

  /**
   * Builds a named content mesh with material, flat shading, and world UV maps.
   *
   * @param geometry The geometry for the mesh.
   * @param name The display name for the mesh.
   * @returns A configured Three.js mesh.
   */
  private buildMesh(geometry: THREE.BufferGeometry, name: string): THREE.Mesh {
    const mesh = this.createBaseMesh(geometry, name);
    initializeMeshTextureUVs(mesh);
    return mesh;
  }

  /**
   * Creates a named content mesh with material and flat shading only, without
   * initializing texture UVs.
   *
   * @param geometry The geometry for the mesh.
   * @param name The display name for the mesh.
   * @returns Mesh ready for texture UV initialization.
   */
  private createBaseMesh(geometry: THREE.BufferGeometry, name: string): THREE.Mesh {
    const material = createContentMaterial(Theme.boxColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    enableFlatShadingOnMesh(mesh);
    return mesh;
  }

  /**
   * Adds a decorative edge wireframe from the mesh's current geometry. Uses
   * mesh.geometry so UV de-indexing is reflected in the outline.
   *
   * @param mesh The mesh to add wireframe edges to.
   */
  private addWireframe(mesh: THREE.Mesh): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: Theme.boxEdgeColor }));
    line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    mesh.add(line);
  }
}
