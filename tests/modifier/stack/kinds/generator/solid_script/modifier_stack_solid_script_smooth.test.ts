import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { MODIFIER_SMOOTH_FLAT, modifierSmoothTagOf } from '@/modifier/smooth/modifier_smooth_shading.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/**
 * Builds a SolidScript generator running the lines and gives the smoothing of
 * its first piece.
 *
 * @param lines Script lines.
 * @returns Smoothing of the first piece.
 */
function smoothOf(...lines: SolidScriptLine[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Smooth test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const script = solidScriptDocumentCreate(lines, 'Smooth');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, script } }, ...rest],
  });
  world.updateMatrixWorld(true);
  const pieces = modifierStackCompile(model.getBrushes(), model.root).instances.filter((brush) =>
    brush.id.startsWith(`${node.uuid}#`),
  );
  const [piece] = pieces;
  if (!piece) throw new Error('Expected a piece');
  return modifierSmoothTagOf(piece);
}

describe('SolidScript smooth shading', () => {
  it('builds solids flat until a Shade Smooth line', () => {
    expect(smoothOf({ command: 'cylinder' })).toBeUndefined();
  });

  it('shades a smoothed cylinder up to its Angle, with flat caps when Where leaves them out', () => {
    const tag = smoothOf(
      { command: 'cylinder', values: { sides: '8' } },
      { command: 'select_objects' },
      { command: 'shade_smooth', values: { angle: '50', where: '[=Abs([$Face.Normal.Y]) < 0.5]' } },
    );
    expect(tag?.maxAngle).toBe(50);
    expect(tag?.classes?.filter((value) => value === MODIFIER_SMOOTH_FLAT)).toHaveLength(2);
    expect(tag?.classes?.filter((value) => value === 0)).toHaveLength(8);
  });
});
