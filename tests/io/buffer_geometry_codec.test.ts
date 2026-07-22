import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BufferGeometryCodec } from '../../src/io/buffer_geometry_codec.js';

describe('BufferGeometryCodec', () => {
  let codec: BufferGeometryCodec;

  beforeEach(() => {
    codec = new BufferGeometryCodec();
  });

  it('should round-trip positions for a simple triangle', () => {
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    source.computeVertexNormals();
    const encoded = codec.encode(source);
    const decoded = codec.decode(encoded);
    const decodedPositions = Array.from(
      decoded.getAttribute('position').array as ArrayLike<number>
    );
    expect(decodedPositions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('should preserve index buffers', () => {
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3)
    );
    source.setIndex([0, 1, 2, 0, 2, 3]);
    const encoded = codec.encode(source);
    expect(encoded.index).toEqual([0, 1, 2, 0, 2, 3]);
    const decoded = codec.decode(encoded);
    expect(Array.from(decoded.getIndex()!.array)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('should encode CSG-style BufferGeometry from BoxGeometry conversion', () => {
    const box = new THREE.BoxGeometry(2, 3, 4);
    const nonPrimitive = box.clone();
    box.dispose();
    // Force non-primitive path by using plain BufferGeometry copy
    const plain = new THREE.BufferGeometry();
    plain.copy(nonPrimitive);
    plain.computeVertexNormals();
    const encoded = codec.encode(plain);
    expect(encoded.position.length).toBeGreaterThan(0);
    const decoded = codec.decode(encoded);
    expect(decoded.getAttribute('position').count).toBe(
      plain.getAttribute('position').count
    );
  });
});
