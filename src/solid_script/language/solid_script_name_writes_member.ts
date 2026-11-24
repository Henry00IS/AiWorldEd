import { solidScriptMemberParts } from './solid_script_machine_variables.js';
import {
  solidScriptNameIsFaceCornerUvWrite,
  solidScriptNameIsModeWrite,
  solidScriptNameIsPositionWrite,
} from './solid_script_name_rules.js';

/** Kept answers of solidScriptNameWritesMember, by name as written. */
const SOLID_SCRIPT_NAMES_WRITING_MEMBER = new Map<string, boolean>();

/** Most names kept before the kept answers start over. */
const SOLID_SCRIPT_NAMES_WRITING_MEMBER_MOST = 4096;

/**
 * Tells whether a name as written may set a member of an element, such as
 * Face.Data.Height, Faces.UVs, FaceCorner.UV, Vertex.Position or Solid.Mode,
 * the way each of those writes tells it from the name alone; the answer is
 * kept, so a line that sets $Local.Next over and over reads the name once.
 *
 * @param written Name as written.
 * @returns True when one of those writes may take the name.
 */
export function solidScriptNameWritesMember(written: string): boolean {
  let known = SOLID_SCRIPT_NAMES_WRITING_MEMBER.get(written);
  if (known === undefined) {
    if (SOLID_SCRIPT_NAMES_WRITING_MEMBER.size >= SOLID_SCRIPT_NAMES_WRITING_MEMBER_MOST)
      SOLID_SCRIPT_NAMES_WRITING_MEMBER.clear();
    known = solidScriptNameWritesMemberFind(written);
    SOLID_SCRIPT_NAMES_WRITING_MEMBER.set(written, known);
  }
  return known;
}

/**
 * Works out solidScriptNameWritesMember for a name not asked about before.
 *
 * @param written Name as written.
 * @returns True when a member write may take the name.
 */
function solidScriptNameWritesMemberFind(written: string): boolean {
  const parts = solidScriptMemberParts(written);
  const data = parts.length >= 3 && parts[parts.length - 2]!.toLowerCase() === 'data';
  const uvs = parts.length >= 2 && parts[parts.length - 1]!.toLowerCase() === 'uvs';
  return (
    data ||
    uvs ||
    solidScriptNameIsFaceCornerUvWrite(written) ||
    solidScriptNameIsPositionWrite(written) ||
    solidScriptNameIsModeWrite(written)
  );
}
