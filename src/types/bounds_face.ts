/**
 * Positive and negative faces along each local axis of an oriented bounding
 * box.
 */
export enum BoundsFace {
  POS_X = 'pos_x',
  NEG_X = 'neg_x',
  POS_Y = 'pos_y',
  NEG_Y = 'neg_y',
  POS_Z = 'pos_z',
  NEG_Z = 'neg_z',
}

/** UserData key storing which bounds face a handle or pick mesh represents. */
export const BOUNDS_FACE_USERDATA_KEY = 'boundsFace';
