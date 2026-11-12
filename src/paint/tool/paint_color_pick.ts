import * as THREE from 'three';
import { paintImageSample, type PaintImage } from '@/paint/raster/paint_image.js';
import { paintImageRead } from '@/paint/scene/paint_image_source_textures.js';

/** Pixels read from texture images, per image object. */
const paintPickImages = new WeakMap<object, PaintImage | null>();

/**
 * Returns the material a triangle of a mesh is drawn with.
 *
 * @param mesh Mesh.
 * @param faceIndex Triangle index.
 * @returns Material, or null.
 */
function paintPickMaterial(mesh: THREE.Mesh, faceIndex: number): THREE.Material | null {
  const materials = mesh.material;
  if (!Array.isArray(materials)) return materials;
  const vertex = faceIndex * 3;
  const group = mesh.geometry.groups.find((entry) => vertex >= entry.start && vertex < entry.start + entry.count);
  return materials[group?.materialIndex ?? 0] ?? null;
}

/**
 * Samples the unpainted surface color of a mesh triangle at a world point: its
 * texture at the interpolated UV times its material color.
 *
 * @param mesh Hit mesh.
 * @param faceIndex Triangle index.
 * @param worldPoint World hit point.
 * @param out Receives rgb 0..1.
 */
export function paintPickBaseColor(
  mesh: THREE.Mesh,
  faceIndex: number,
  worldPoint: THREE.Vector3,
  out: Float32Array,
): void {
  out[0] = 1;
  out[1] = 1;
  out[2] = 1;
  const material = paintPickMaterial(mesh, faceIndex) as
    (THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color }) | null;
  if (material === null) return;
  const tint = material.color;
  const map = material.map ?? null;
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (map !== null && uv !== undefined) {
    const source = map.image as unknown;
    if (typeof source === 'object' && source !== null) {
      let image = paintPickImages.get(source);
      if (image === undefined) {
        image = paintImageRead(source);
        paintPickImages.set(source, image);
      }
      if (image !== null) {
        const local = mesh.worldToLocal(worldPoint.clone());
        const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const index = mesh.geometry.getIndex();
        const corner = (slot: number): number => {
          const vertex = faceIndex * 3 + slot;
          return index === null ? vertex : index.getX(vertex);
        };
        const triangle = new THREE.Triangle(
          new THREE.Vector3().fromBufferAttribute(position, corner(0)),
          new THREE.Vector3().fromBufferAttribute(position, corner(1)),
          new THREE.Vector3().fromBufferAttribute(position, corner(2)),
        );
        const coordinates = triangle.getBarycoord(local, new THREE.Vector3());
        if (coordinates !== null) {
          const textureUv = new THREE.Vector2()
            .fromBufferAttribute(uv, corner(0))
            .multiplyScalar(coordinates.x)
            .add(new THREE.Vector2().fromBufferAttribute(uv, corner(1)).multiplyScalar(coordinates.y))
            .add(new THREE.Vector2().fromBufferAttribute(uv, corner(2)).multiplyScalar(coordinates.z));
          if (map.matrixAutoUpdate) map.updateMatrix();
          textureUv.applyMatrix3(map.matrix);
          paintImageSample(image, textureUv.x, map.flipY ? textureUv.y : 1 - textureUv.y, out);
        }
      }
    }
  }
  if (tint !== undefined) {
    out[0] = (out[0] ?? 1) * tint.r;
    out[1] = (out[1] ?? 1) * tint.g;
    out[2] = (out[2] ?? 1) * tint.b;
  }
}

/**
 * Combines a base color with baked paint factors into the shown color.
 *
 * @param base Base rgb 0..1.
 * @param affine A rgb then B rgb, or null when unpainted.
 * @returns Color 0xRRGGBB.
 */
export function paintPickCombine(base: Float32Array, affine: Float32Array | null): number {
  let color = 0;
  for (let channel = 0; channel < 3; channel++) {
    const a = affine === null ? 1 : (affine[channel] ?? 1);
    const b = affine === null ? 0 : (affine[channel + 3] ?? 0);
    const value = Math.max(0, Math.min(1, (base[channel] ?? 1) * a + b));
    color = (color << 8) | Math.round(value * 255);
  }
  return color;
}
