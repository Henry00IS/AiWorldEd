import { solidScriptMemberWriteParse } from './solid_script_name_rules.js';

/**
 * Tells whether a name as written may set a member of an element, such as
 * Face.Data.Height, Faces.UVs, FaceCorner.UV, Vertex.Position or Solid.Mode,
 * with or without an item number on the member.
 *
 * @param written Name as written.
 * @returns True when one of those writes may take the name.
 */
export function solidScriptNameWritesMember(written: string): boolean {
  return solidScriptMemberWriteParse(written) !== null;
}
