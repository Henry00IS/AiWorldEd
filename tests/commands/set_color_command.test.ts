import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SetColorCommand } from '../../src/commands/set_color_command.js';

/**
 * Builds a mesh with a standard material at the given color.
 * @param colorHex Initial material color.
 * @returns A mesh ready for color command tests.
 */
function createColoredMesh(colorHex: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: colorHex });
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
}

/**
 * Reads the material color hex from a mesh.
 * @param mesh Mesh with a color-bearing material.
 * @returns Color hex value.
 */
function readColorHex(mesh: THREE.Mesh): number {
  return (mesh.material as THREE.MeshStandardMaterial).color.getHex();
}

describe('SetColorCommand', () => {
  it('should apply the new color on execute', () => {
    const mesh = createColoredMesh(0xff0000);
    const command = new SetColorCommand([mesh], 0x00ff00);
    command.execute();
    expect(readColorHex(mesh)).toBe(0x00ff00);
  });

  it('should restore the original color on undo', () => {
    const mesh = createColoredMesh(0x112233);
    const command = new SetColorCommand([mesh], 0xaabbcc);
    command.execute();
    command.undo();
    expect(readColorHex(mesh)).toBe(0x112233);
  });

  it('should re-apply the new color on redo execute', () => {
    const mesh = createColoredMesh(0x0000ff);
    const command = new SetColorCommand([mesh], 0xffffff);
    command.execute();
    command.undo();
    command.execute();
    expect(readColorHex(mesh)).toBe(0xffffff);
  });

  it('should update every mesh in a multi-selection', () => {
    const meshA = createColoredMesh(0x111111);
    const meshB = createColoredMesh(0x222222);
    const command = new SetColorCommand([meshA, meshB], 0xabcdef);
    command.execute();
    expect(readColorHex(meshA)).toBe(0xabcdef);
    expect(readColorHex(meshB)).toBe(0xabcdef);
    command.undo();
    expect(readColorHex(meshA)).toBe(0x111111);
    expect(readColorHex(meshB)).toBe(0x222222);
  });

  it('should snapshot colors at construction time', () => {
    const mesh = createColoredMesh(0x010203);
    const command = new SetColorCommand([mesh], 0xfefefe);
    (mesh.material as THREE.MeshStandardMaterial).color.setHex(0x999999);
    command.execute();
    expect(readColorHex(mesh)).toBe(0xfefefe);
    command.undo();
    expect(readColorHex(mesh)).toBe(0x010203);
  });

  it('should report affected mesh count for colorable meshes only', () => {
    const mesh = createColoredMesh(0xff00ff);
    const command = new SetColorCommand([mesh], 0x00ffff);
    expect(command.getAffectedMeshCount()).toBe(1);
  });

  it('should use explicit original colors when provided after live preview', () => {
    const mesh = createColoredMesh(0x111111);
    (mesh.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
    const command = new SetColorCommand([mesh], 0x333333, [0x111111]);
    command.execute();
    expect(readColorHex(mesh)).toBe(0x333333);
    command.undo();
    expect(readColorHex(mesh)).toBe(0x111111);
  });

  it('should update the target color for live picker coalescing', () => {
    const mesh = createColoredMesh(0x010101);
    const command = new SetColorCommand([mesh], 0x020202);
    command.execute();
    command.setNewColorHex(0x030303);
    command.execute();
    expect(readColorHex(mesh)).toBe(0x030303);
    expect(command.getNewColorHex()).toBe(0x030303);
    command.undo();
    expect(readColorHex(mesh)).toBe(0x010101);
    expect(command.matchesOriginalColors()).toBe(false);
    command.setNewColorHex(0x010101);
    expect(command.matchesOriginalColors()).toBe(true);
  });
});
