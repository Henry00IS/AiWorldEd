import * as THREE from 'three';
import { getDebugCheckerTexture } from '../texture/debug_texture_factory.js';
import { initializeMeshTextureUVs } from '../texture/face_texture_applier.js';

/**
 * Generates simple procedural heightmap terrain meshes for blocking levels.
 */
export class TerrainGenerator {
  /**
   * Creates a terrain mesh with a heightfield on a subdivided plane.
   * @param width World width of the terrain.
   * @param depth World depth of the terrain.
   * @param segments Subdivision count along each axis.
   * @param heightScale Peak height multiplier.
   * @param seed Deterministic seed for the height pattern.
   * @returns A terrain mesh centered at the origin on XZ.
   */
  createTerrain(
    width: number,
    depth: number,
    segments: number,
    heightScale: number,
    seed: number
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.applyHeightfield(geometry, segments, heightScale, seed);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a7c59,
      map: getDebugCheckerTexture(),
      metalness: 0.1,
      roughness: 0.9,
      flatShading: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Terrain_${segments}x${segments}`;
    mesh.position.y = 0;
    // Heightfields always project from world up so XZ tiles continuously.
    initializeMeshTextureUVs(mesh, undefined, 'floor');
    return mesh;
  }

  /**
   * Applies a deterministic height pattern to plane vertices.
   * @param geometry The plane geometry to modify.
   * @param segments Subdivision count.
   * @param heightScale Peak height multiplier.
   * @param seed Deterministic seed.
   */
  private applyHeightfield(
    geometry: THREE.PlaneGeometry,
    segments: number,
    heightScale: number,
    seed: number
  ): void {
    const position = geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = this.sampleHeight(x, z, heightScale, seed);
      position.setY(index, height);
    }
    position.needsUpdate = true;
  }

  /**
   * Samples a smooth layered height value at a world XZ location.
   * @param x World X coordinate.
   * @param z World Z coordinate.
   * @param heightScale Peak height multiplier.
   * @param seed Deterministic seed.
   * @returns The height value.
   */
  private sampleHeight(
    x: number,
    z: number,
    heightScale: number,
    seed: number
  ): number {
    const s = seed * 0.1;
    const layer1 = Math.sin(x * 0.35 + s) * Math.cos(z * 0.35 - s);
    const layer2 = Math.sin(x * 0.8 + z * 0.5 + s * 2) * 0.45;
    const layer3 = Math.cos(x * 1.7 - z * 1.3 + s) * 0.2;
    return (layer1 + layer2 + layer3) * heightScale;
  }
}
