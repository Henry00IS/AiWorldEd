import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMtlDocument } from '@/io/obj/obj_mtl_writer.js';
import type { ObjMaterialSlot } from '@/io/obj/obj_material_collector.js';

describe('buildMtlDocument', () => {
  it('writes standard Wavefront newmtl blocks with Kd colors', () => {
    const slots: ObjMaterialSlot[] = [
      {
        name: 'Concrete',
        color: new THREE.Color(0.25, 0.5, 0.75),
        map: null,
        mapFileName: null,
      },
    ];
    const mtl = buildMtlDocument('# objmeta {}', slots);
    expect(mtl).toContain('# Wavefront MTL exported by AI World Editor');
    expect(mtl).toContain('newmtl Concrete');
    expect(mtl).toContain('Kd 0.250000 0.500000 0.750000');
    expect(mtl).not.toContain('map_Kd');
  });

  it('includes map_Kd when a texture file name is assigned', () => {
    const slots: ObjMaterialSlot[] = [
      {
        name: 'Brick',
        color: new THREE.Color(1, 1, 1),
        map: new THREE.Texture(),
        mapFileName: 'brick_wall.png',
      },
    ];
    const mtl = buildMtlDocument('# objmeta {}', slots);
    expect(mtl).toContain('map_Kd brick_wall.png');
  });
});
