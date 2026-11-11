import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModelExportMaterialNames, modelExportMaterialNameSanitize } from '@/io/export/model_export_material_names.js';

describe('ModelExportMaterialNames', () => {
  it('uses the material name, else the mesh and slot, else the fallback', () => {
    const names = new ModelExportMaterialNames('Material');
    expect(names.nameOf(new THREE.MeshStandardMaterial({ name: 'Brick Wall' }), 'Crate', 0)).toBe('Brick_Wall');
    expect(names.nameOf(new THREE.MeshStandardMaterial(), 'Crate', 1)).toBe('Crate_1');
    expect(names.nameOf(new THREE.MeshStandardMaterial(), '', 0)).toBe('Material_0');
  });

  it('numbers repeated names in the order they are met', () => {
    const names = new ModelExportMaterialNames('Material');
    const material = () => new THREE.MeshStandardMaterial({ name: 'stone' });
    expect([names.nameOf(material(), 'a', 0), names.nameOf(material(), 'b', 0)]).toEqual(['stone', 'stone_2']);
  });

  it('drops paths, extensions and unsafe characters', () => {
    expect(modelExportMaterialNameSanitize(' walls\\old brick.png ')).toBe('old_brick');
  });
});
