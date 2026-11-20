import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { SOLID_SCRIPT_MODE_DEFAULT, type SolidScriptMode } from './solid_script_mode.js';
import type { SolidScriptShape } from './solid_script_shape.js';
import type { SolidScriptUseFacts } from './solid_script_system.js';

/**
 * Insertion Mode top-level brushes inherit when their Mode was left empty: the
 * run's insert Mode, or a generator's Script.Mode when that is a brush Mode,
 * otherwise Additive. Pass-Through is not a brush Mode, so it becomes
 * Additive.
 *
 * @param use Where the script is used.
 * @returns Inherited Mode.
 */
export function solidScriptModeRoleOfUse(use?: SolidScriptUseFacts): SolidScriptMode {
  if (use?.insertMode) return use.insertMode;
  if (use?.usage === 'Generator' && use.mode && use.mode !== 'Pass-Through') return use.mode;
  return SOLID_SCRIPT_MODE_DEFAULT;
}

/**
 * Records the inherited Mode of every solid in a tree: brushes inside a Group
 * or Part inherit Additive; other brushes inherit the insertion Mode.
 *
 * @param shapes Shapes just created or stamped.
 * @param role Insertion Mode of the current output.
 * @param set Stores the inherited Mode on a solid.
 */
export function solidScriptModeRoleRemember(
  shapes: readonly SolidScriptShape[],
  role: SolidScriptMode,
  set: (leaf: SolidScriptGeometryLeaf, role: SolidScriptMode) => void,
): void {
  for (const shape of shapes) solidScriptModeRoleRememberOne(shape, role, set);
}

/**
 * Records the inherited Mode of one shape and its children.
 *
 * @param shape Shape.
 * @param role Insertion Mode outside a Group.
 * @param set Stores the inherited Mode on a solid.
 */
function solidScriptModeRoleRememberOne(
  shape: SolidScriptShape,
  role: SolidScriptMode,
  set: (leaf: SolidScriptGeometryLeaf, role: SolidScriptMode) => void,
): void {
  if (shape.kind === 'solid') {
    set(shape, role);
    return;
  }
  if (shape.kind === 'group') {
    for (const child of shape.children) solidScriptModeRoleRememberOne(child, SOLID_SCRIPT_MODE_DEFAULT, set);
    return;
  }
  if (shape.kind === 'boolean') {
    for (const child of shape.children) solidScriptModeRoleRememberOne(child, role, set);
  }
}
