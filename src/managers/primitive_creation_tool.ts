import * as THREE from 'three';
import { Theme } from '../theme.js';
import {
  DECORATIVE_EDGE_USERDATA_KEY,
  enableFlatShadingOnMesh
} from '../utils/mesh_edge_sync.js';
import { createContentMaterial } from '../materials/content_material_factory.js';
import { initializeMeshTextureUVs } from '../texture/face_texture_applier.js';

/**
 * Creates primitive meshes with auto-incremented names and default material.
 * Each primitive receives a standard material and edge wireframe.
 */
export class PrimitiveCreationTool {
  private targetContainer: THREE.Object3D;
  private lastCreated: THREE.Mesh | null;
  private cubeCount: number;
  private sphereCount: number;
  private cylinderCount: number;
  private planeCount: number;

  /**
   * Creates a new primitive creation tool for the given container.
   * @param targetContainer The Three.js object into which primitives will be added.
   */
  constructor(targetContainer: THREE.Object3D) {
    this.targetContainer = targetContainer;
    this.lastCreated = null;
    this.cubeCount = 0;
    this.sphereCount = 0;
    this.cylinderCount = 0;
    this.planeCount = 0;
  }

  /**
   * Creates a box primitive with the given dimensions.
   * @param width The width of the box along the X axis.
   * @param height The height of the box along the Y axis.
   * @param depth The depth of the box along the Z axis.
   * @param position Optional position for the box.
   * @returns The created mesh.
   */
  createBox(
    width: number,
    height: number,
    depth: number,
    position?: THREE.Vector3
  ): THREE.Mesh {
    this.cubeCount++;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = this.buildMesh(geometry, `Cube${this.padNumber(this.cubeCount)}`);
    if (position) mesh.position.copy(position);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a sphere primitive with the given radius.
   * @param radius The radius of the sphere.
   * @param position Optional position for the sphere.
   * @returns The created mesh.
   */
  createSphere(
    radius: number,
    position?: THREE.Vector3
  ): THREE.Mesh {
    this.sphereCount++;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const mesh = this.buildMesh(geometry, `Sphere${this.padNumber(this.sphereCount)}`);
    if (position) mesh.position.copy(position);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a cylinder primitive with the given dimensions.
   * @param radiusTop The top radius of the cylinder.
   * @param radiusBottom The bottom radius of the cylinder.
   * @param height The height of the cylinder.
   * @param position Optional position for the cylinder.
   * @returns The created mesh.
   */
  createCylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    position?: THREE.Vector3
  ): THREE.Mesh {
    this.cylinderCount++;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32);
    const mesh = this.buildMesh(geometry, `Cylinder${this.padNumber(this.cylinderCount)}`);
    if (position) mesh.position.copy(position);
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Creates a plane primitive with the given dimensions.
   * @param width The width of the plane along the X axis.
   * @param height The height of the plane along the Z axis.
   * @param position Optional position for the plane.
   * @returns The created mesh.
   */
  createPlane(
    width: number,
    height: number,
    position?: THREE.Vector3
  ): THREE.Mesh {
    this.planeCount++;
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = this.buildMesh(geometry, `Plane${this.padNumber(this.planeCount)}`);
    if (position) mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    this.addWireframe(mesh);
    this.lastCreated = mesh;
    return mesh;
  }

  /**
   * Returns the last primitive mesh created by this tool.
   * @returns The most recently created mesh, or null.
   */
  getLastCreatedObject(): THREE.Mesh | null {
    return this.lastCreated;
  }

  /**
   * Returns the total count of objects created across all types.
   * @returns The cumulative count of created primitives.
   */
  getCreatedObjectCount(): number {
    return this.cubeCount + this.sphereCount + this.cylinderCount + this.planeCount;
  }

  /**
   * Disposes all resources held by this tool.
   */
  dispose(): void {
    this.lastCreated = null;
  }

  /**
   * Pads a number to a three-digit zero-padded string.
   * @param num The number to pad.
   * @returns A zero-padded string representation.
   */
  private padNumber(num: number): string {
    return String(num).padStart(3, '0');
  }

  /**
   * Builds a mesh with a standard material from geometry.
   * @param geometry The geometry for the mesh.
   * @param name The display name for the mesh.
   * @returns A configured Three.js mesh.
   */
  private buildMesh(geometry: THREE.BufferGeometry, name: string): THREE.Mesh {
    const material = createContentMaterial(Theme.boxColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    enableFlatShadingOnMesh(mesh);
    initializeMeshTextureUVs(mesh);
    return mesh;
  }

  /**
   * Adds a decorative edge wireframe from the mesh's current geometry.
   * Uses mesh.geometry so UV de-indexing is reflected in the outline.
   * @param mesh The mesh to add wireframe edges to.
   */
  private addWireframe(mesh: THREE.Mesh): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: Theme.boxEdgeColor })
    );
    line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    mesh.add(line);
  }
}
