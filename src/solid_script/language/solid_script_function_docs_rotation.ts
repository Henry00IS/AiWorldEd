/** Docs of the rotation functions. */
export const SOLID_SCRIPT_FUNCTION_DOCS_ROTATION = {
  invert_rotation: {
    usage: 'InvertRotation(rotation)',
    summary:
      'The turn that undoes a turn in X, Y, Z degrees, such as InvertRotation(Vector(0, 90, 0)) is Vector(0, -90, 0). Use it with RotateBy to turn something back.',
    group: 'Vector',
    gives: ['Vector'],
  },
  rotation_axis: {
    usage: 'RotationAxis(rotation)',
    summary:
      'The direction a turn in X, Y, Z degrees turns around, such as RotationAxis(Vector(0, 90, 0)) is Vector(0, 1, 0). No turn gives Vector(1, 0, 0). RotationAngle gives how far.',
    group: 'Vector',
    gives: ['Vector'],
  },
  rotation_angle: {
    usage: 'RotationAngle(rotation)',
    summary:
      'How many degrees, from 0 to 180, a turn in X, Y, Z degrees turns around its RotationAxis, such as RotationAngle(Vector(0, -90, 0)) is 90.',
    group: 'Vector',
    gives: ['Number'],
  },
  mix_rotation: {
    usage: 'MixRotation(a, b, factor)',
    summary:
      'Blends two turns in X, Y, Z degrees the shortest way round: Factor 0 gives A, 1 gives B, such as MixRotation(Vector(0, 0, 0), Vector(0, 90, 0), 0.5) is Vector(0, 45, 0).',
    group: 'Vector',
    gives: ['Vector'],
  },
} as const;

/** Inputs of the rotation functions. */
export const SOLID_SCRIPT_ROTATION_ARGUMENTS = {
  invert_rotation: {
    rotation: { type: ['Vector'], about: 'The turn to undo, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
  },
  rotation_axis: {
    rotation: { type: ['Vector'], about: 'The turn, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
  },
  rotation_angle: {
    rotation: { type: ['Vector'], about: 'The turn, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
  },
  mix_rotation: {
    a: { type: ['Vector'], about: 'The turn at Factor 0, such as Vector(0, 0, 0).', start: 'Vector(0, 0, 0)' },
    b: { type: ['Vector'], about: 'The turn at Factor 1, such as Vector(0, 90, 0).', start: 'Vector(0, 90, 0)' },
    factor: { type: ['Number'], about: 'How far from A to B, such as 0.5.', start: '0.5' },
  },
} as const;
