/** Docs of the rotation functions. */
export const SOLID_SCRIPT_FUNCTION_DOCS_ROTATION = {
  rotation: {
    usage: 'Rotation(x, y, z)',
    summary:
      'A Rotation that turns around X, then Y, then Z by those degrees, the same way an object rotation does, such as Rotation(0, 90, 0). A Rotation keeps the turn whole, so combining and blending turns never locks up the way three angles can. Rotate By, Rotate To and Transform take it as well as three numbers.',
    group: 'Vector',
    gives: ['Rotation'],
  },
  rotation_around: {
    usage: 'RotationAround(axis, angle)',
    summary:
      'A Rotation that turns around a direction by degrees, such as RotationAround(Vector(0, 1, 0), 90), the same turn as Rotation(0, 90, 0). Looking along the axis, a positive angle turns counterclockwise.',
    group: 'Vector',
    gives: ['Rotation'],
  },
  combine_rotations: {
    usage: 'CombineRotations(first, then)',
    summary:
      'One Rotation that turns by First and then by Then, such as CombineRotations(Rotation(0, 0, 90), Rotation(0, 90, 0)). The order matters, like turning a box on its side and then around.',
    group: 'Vector',
    gives: ['Rotation'],
  },
  rotation_degrees: {
    usage: 'RotationDegrees(rotation)',
    summary:
      'The degrees around X, then Y, then Z of a Rotation, such as RotationDegrees(Rotation(0, 90, 0)) is [0, 90, 0].',
    group: 'Vector',
    gives: ['Vector'],
  },
  apply_rotation: {
    usage: 'ApplyRotation(vector, rotation)',
    summary:
      'Turns a point or a direction by a Rotation, or by X, Y, Z degrees, around 0, 0, 0, such as ApplyRotation(Vector(1, 0, 0), Rotation(0, 0, 90)) is [0, 1, 0].',
    group: 'Vector',
    gives: ['Vector'],
  },
  invert_rotation: {
    usage: 'InvertRotation(rotation)',
    summary:
      'The turn that undoes a Rotation or a turn in X, Y, Z degrees, such as InvertRotation(Vector(0, 90, 0)) is Vector(0, -90, 0); a Rotation gives a Rotation back. Use it with RotateBy to turn something back.',
    group: 'Vector',
    gives: ['Vector', 'Rotation'],
  },
  rotation_axis: {
    usage: 'RotationAxis(rotation)',
    summary:
      'The direction a Rotation or a turn in X, Y, Z degrees turns around, such as RotationAxis(Vector(0, 90, 0)) is Vector(0, 1, 0). No turn gives Vector(1, 0, 0). RotationAngle gives how far.',
    group: 'Vector',
    gives: ['Vector'],
  },
  rotation_angle: {
    usage: 'RotationAngle(rotation)',
    summary:
      'How many degrees, from 0 to 180, a Rotation or a turn in X, Y, Z degrees turns around its RotationAxis, such as RotationAngle(Vector(0, -90, 0)) is 90.',
    group: 'Vector',
    gives: ['Number'],
  },
  mix_rotation: {
    usage: 'MixRotation(a, b, factor)',
    summary:
      'Blends two Rotations, or turns in X, Y, Z degrees, the shortest way round: Factor 0 gives A, 1 gives B, such as MixRotation(Vector(0, 0, 0), Vector(0, 90, 0), 0.5) is Vector(0, 45, 0); a Rotation in A gives a Rotation back.',
    group: 'Vector',
    gives: ['Vector', 'Rotation'],
  },
} as const;

/** Inputs of the rotation functions. */
export const SOLID_SCRIPT_ROTATION_ARGUMENTS = {
  rotation: {
    x: { type: ['Number'], about: 'Degrees around X, turned first.', start: '0' },
    y: { type: ['Number'], about: 'Degrees around Y, turned second.', start: '90' },
    z: { type: ['Number'], about: 'Degrees around Z, turned last.', start: '0' },
  },
  rotation_around: {
    axis: {
      type: ['Vector'],
      about: 'The direction to turn around, such as Vector(0, 1, 0).',
      start: 'Vector(0, 1, 0)',
    },
    angle: { type: ['Number'], about: 'How many degrees to turn, such as 90.', start: '90' },
  },
  combine_rotations: {
    first: { type: ['Rotation', 'Vector'], about: 'The turn made first.', start: 'Rotation(0, 0, 90)' },
    then: { type: ['Rotation', 'Vector'], about: 'The turn made after it.', start: 'Rotation(0, 90, 0)' },
  },
  rotation_degrees: {
    rotation: { type: ['Rotation', 'Vector'], about: 'The Rotation, such as [Spin].', start: 'Rotation(0, 90, 0)' },
  },
  apply_rotation: {
    vector: { type: ['Vector'], about: 'The point or direction to turn.', start: 'Vector(1, 0, 0)' },
    rotation: { type: ['Rotation', 'Vector'], about: 'The turn, such as [Spin].', start: 'Rotation(0, 90, 0)' },
  },
  invert_rotation: {
    rotation: {
      type: ['Vector', 'Rotation'],
      about: 'The turn to undo, such as Vector(0, 90, 0).',
      start: 'Vector(0, 90, 0)',
    },
  },
  rotation_axis: {
    rotation: { type: ['Vector', 'Rotation'], about: 'The turn, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
  },
  rotation_angle: {
    rotation: { type: ['Vector', 'Rotation'], about: 'The turn, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
  },
  mix_rotation: {
    a: {
      type: ['Vector', 'Rotation'],
      about: 'The turn at Factor 0, such as Vector(0, 0, 0).',
      start: 'Vector(0, 0, 0)',
    },
    b: {
      type: ['Vector', 'Rotation'],
      about: 'The turn at Factor 1, such as Vector(0, 90, 0).',
      start: 'Vector(0, 90, 0)',
    },
    factor: { type: ['Number'], about: 'How far from A to B, such as 0.5.', start: '0.5' },
  },
} as const;
