import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { enableFlatShadingOnMesh, rebuildDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { createMeshDocumentSphere } from '@/mesh/primitive/mesh_primitive_sphere.js';
import { createMeshDocumentCylinder } from '@/mesh/primitive/mesh_primitive_cylinder.js';
import { createMeshDocumentPlane } from '@/mesh/primitive/mesh_primitive_plane.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { setGeometrySource } from '@/texture/uv/geometry_source.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';

/** Default radial/height segments for sphere and cylinder primitives. */
const PRIMITIVE_RADIAL_SEGMENTS = 32;

/**
 * Creates primitive meshes with auto-incremented names and default material.
 * Each primitive is authored as a MeshDocument; BufferGeometry is only the
 * ear-clipped display of that document.
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
    const mesh = this.createDocumentMesh(
      document,
      hierarchyNameAllocator.allocate('Cube'),
      { type: 'box', params: { width, height, depth } },
      position,
      { centerTexture: true },
    );
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
    const document = createMeshDocumentSphere(radius, PRIMITIVE_RADIAL_SEGMENTS, PRIMITIVE_RADIAL_SEGMENTS);
    const mesh = this.createDocumentMesh(
      document,
      hierarchyNameAllocator.allocate('Sphere'),
      {
        type: 'sphere',
        params: {
          radius,
          widthSegments: PRIMITIVE_RADIAL_SEGMENTS,
          heightSegments: PRIMITIVE_RADIAL_SEGMENTS,
        },
      },
      position,
    );
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
    const document = createMeshDocumentCylinder(radiusTop, radiusBottom, height, PRIMITIVE_RADIAL_SEGMENTS, 1, false);
    const mesh = this.createDocumentMesh(
      document,
      hierarchyNameAllocator.allocate('Cylinder'),
      {
        type: 'cylinder',
        params: {
          radiusTop,
          radiusBottom,
          height,
          radialSegments: PRIMITIVE_RADIAL_SEGMENTS,
        },
      },
      position,
    );
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
    const document = createMeshDocumentPlane(width, height, 1, 1);
    const mesh = this.createDocumentMesh(
      document,
      hierarchyNameAllocator.allocate('Plane'),
      { type: 'plane', params: { width, height } },
      position,
      undefined,
      -Math.PI / 2,
    );
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
   * Builds a content mesh from an authored MeshDocument and binds it as the
   * persistent topology source.
   *
   * @param document Authored mesh document.
   * @param name Display name.
   * @param geometrySource Geometry source metadata for save/load.
   * @param position Optional world position.
   * @param uvOptions Optional UV init options.
   * @param rotationX Optional mesh rotation about X after creation.
   * @returns Configured mesh with persistent document.
   */
  private createDocumentMesh(
    document: MeshDocument,
    name: string,
    geometrySource: { type: 'box' | 'sphere' | 'cylinder' | 'plane'; params: Record<string, number> },
    position?: THREE.Vector3,
    uvOptions?: { centerTexture?: boolean },
    rotationX?: number,
  ): THREE.Mesh {
    const geometry = meshDocumentToBufferGeometry(document);
    const mesh = this.createBaseMesh(geometry, name);
    writePersistentMeshDocument(mesh, document);
    setGeometrySource(mesh, geometrySource);
    if (position) {
      mesh.position.copy(position);
    }
    if (rotationX !== undefined) {
      mesh.rotation.x = rotationX;
    }
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, undefined, undefined, uvOptions);
    rebuildDecorativeEdges(mesh);
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
}
