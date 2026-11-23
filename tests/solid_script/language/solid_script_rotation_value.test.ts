import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptParameterTakesDirection } from '@/solid_script/commands/solid_script_parameter_direction.js';

/**
 * Runs lines and returns what Echo printed, or the error.
 *
 * @param lines Lines.
 * @returns Messages, or the error message.
 */
function printed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? result.error.message : result.messages;
}

/**
 * Echoes a value.
 *
 * @param value Value field.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

/**
 * A cube named by Into.
 *
 * @param into Variable.
 * @returns Line.
 */
function cube(into: string): SolidScriptLine {
  return { command: 'cube', values: { size: '1, 2, 3', into } };
}

describe('Rotation values', () => {
  it('makes one around X, then Y, then Z and shows it as those degrees', () => {
    expect(
      printed(
        echo('[=Rotation(10, 20, 30)]'),
        echo('[=RotationDegrees(Rotation(10, 20, 30))]'),
        echo('[=IsRotation(Rotation(0, 90, 0))] [=IsRotation(Vector(0, 90, 0))]'),
      ),
    ).toEqual(['Rotation(10, 20, 30)', '[10, 20, 30]', 'Yes No']);
  });

  it('turns an object exactly like the same degrees typed into Rotate By', () => {
    const out = printed(
      cube('A'),
      cube('B'),
      { command: 'rotate_by', values: { by: '30, 45, 60', of: '[A]' } },
      { command: 'rotate_by', values: { by: '[=Rotation(30, 45, 60)]', of: '[B]' } },
      echo('[A.Vertices.Positions]'),
      echo('[B.Vertices.Positions]'),
    );
    expect(Array.isArray(out), String(out)).toBe(true);
    expect(out[0]).toBe(out[1]);
  });

  it('turns around an axis, combines turns in order and turns a vector', () => {
    expect(
      printed(
        echo('[=ApplyRotation(Vector(1, 0, 0), RotationAround(Vector(0, 1, 0), 90))]'),
        echo('[=ApplyRotation(Vector(1, 0, 0), CombineRotations(Rotation(0, 0, 90), Rotation(0, 90, 0)))]'),
        echo('[=ApplyRotation(Vector(1, 0, 0), Vector(0, 0, 90))]'),
      ),
    ).toEqual(['[0, 0, -1]', '[0, 1, 0]', '[0, 1, 0]']);
  });

  it('keeps a straight-up turn exact where three angles lock', () => {
    expect(
      printed(
        echo('[=RotationAngle(CombineRotations(Rotation(0, 90, 0), Rotation(90, 0, 0)))]'),
        echo('[=MixRotation(Rotation(0, 0, 0), Rotation(0, 90, 0), 0.5)]'),
      ),
    ).toEqual(['120', 'Rotation(0, 45, 0)']);
  });

  it('gives back the kind it was given from InvertRotation and MixRotation', () => {
    expect(
      printed(
        echo('[=InvertRotation(Rotation(0, 90, 0))]'),
        echo('[=InvertRotation(Vector(0, 90, 0))]'),
        echo('[=RotationAxis(Rotation(0, 90, 0))]'),
      ),
    ).toEqual(['Rotation(0, -90, 0)', '[0, -90, 0]', '[0, 1, 0]']);
  });

  it('builds one with the Make Rotation block, by degrees or around an axis', () => {
    expect(
      printed(
        { command: 'make_rotation', values: { into: 'Tilt', degrees: '0, 0, 45' } },
        { command: 'make_rotation', values: { into: 'Spin', how: 'Axis And Angle', axis: '0, 1, 0', angle: '90' } },
        echo('[Tilt] [Spin]'),
        cube('Box'),
        { command: 'rotate_to', values: { to: '[Spin]', of: '[Box]' } },
        { command: 'transform', values: { rotate: '[Tilt]' } },
        echo('ok'),
        { command: 'end' },
      ),
    ).toEqual(['Rotation(0, 0, 45) Rotation(0, 90, 0)', 'ok']);
  });

  it('picks the axis of Make Rotation with the normal picker', () => {
    const block = solidScriptCommands.find((command) => command.id === 'make_rotation');
    const axis = block?.parameters.find((parameter) => parameter.key === 'axis');
    if (!axis) throw new Error('Make Rotation has no Axis');
    expect(solidScriptParameterTakesDirection(axis)).toBe(true);
  });
});
