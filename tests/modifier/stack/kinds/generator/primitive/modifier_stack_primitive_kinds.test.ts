import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { expectStackConvex } from '../../../modifier_stack_fixture.js';
import { primitivePieces } from './primitive_fixture.js';

/** Generators added for primitives, curved stairs and rooms. */
const PRIMITIVE_KINDS = [
  'cylinder',
  'cone',
  'sphere',
  'capsule',
  'torus',
  'pipe',
  'pyramid',
  'prism',
  'rhombicuboctahedron',
  'icosphere',
  'hollowBox',
  'curvedStairs',
] as const;

describe('primitive generators', () => {
  it('are installed generator kinds offered as generator nodes', () => {
    for (const kind of PRIMITIVE_KINDS) {
      expect(modifierStackKindFind(kind), kind).toBeInstanceOf(ModifierStackKindGenerator);
      expect(MODIFIER_GENERATOR_NODE_KINDS).toContain(kind);
    }
  });

  it('give every property a Title Case label and a tooltip', () => {
    for (const kind of PRIMITIVE_KINDS) {
      for (const field of modifierStackKindFind(kind)?.fields ?? []) {
        expect(field.hint?.length ?? 0, `${kind}.${field.key}`).toBeGreaterThan(10);
        for (const word of field.label.split(/[ /]/).filter((part) => /^[a-z]/i.test(part)))
          expect(word[0], `${kind}.${field.label}`).toBe(word[0]?.toUpperCase());
      }
    }
  });

  it('build valid convex pieces inside a non-cubic box at default settings', () => {
    for (const kind of PRIMITIVE_KINDS) {
      const { pieces, box } = primitivePieces(kind, [3, 2, 5]);
      expect(pieces.length, kind).toBeGreaterThan(0);
      const bounds = box.clone().expandByScalar(1e-4);
      for (const piece of pieces) {
        expectStackConvex(piece);
        expect(SolidBrushValidator.validateGenerated(piece.brush).valid, kind).toBe(true);
        for (const vertex of piece.brush.vertices) expect(bounds.containsPoint(vertex), kind).toBe(true);
      }
    }
  });

  it('fill the box: their bounds touch every side of the volume', () => {
    for (const kind of ['cylinder', 'sphere', 'capsule', 'torus', 'pipe', 'pyramid', 'prism', 'hollowBox']) {
      const { pieces, box } = primitivePieces(kind, [2, 3, 2], { sides: 64, ringSides: 64 });
      const bounds = new THREE.Box3();
      for (const piece of pieces) for (const vertex of piece.brush.vertices) bounds.expandByPoint(vertex);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(bounds.min[axis], `${kind} min ${axis}`).toBeCloseTo(box.min[axis], 2);
        expect(bounds.max[axis], `${kind} max ${axis}`).toBeCloseTo(box.max[axis], 2);
      }
    }
  });

  it('give every face a finite texture mapping that turns with the volume', () => {
    for (const kind of PRIMITIVE_KINDS) {
      const found = modifierStackKindFind(kind);
      expect(found?.volumePoseFollow(found.normalizeParameters({})), kind).toBe('rigid');
      for (const piece of primitivePieces(kind, [2, 2, 2]).pieces)
        for (const face of piece.brush.faces) {
          const uv = piece.getFaceSurface(face.surfaceIndex).uv;
          for (const value of [...uv.u.toArray(), ...uv.v.toArray()]) expect(Number.isFinite(value), kind).toBe(true);
        }
    }
  });
});
