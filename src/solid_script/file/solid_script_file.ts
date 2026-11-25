import { ZipReader } from '@/io/zip/zip_reader.js';
import { ZipWriter } from '@/io/zip/zip_writer.js';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';

/** Extension of script files. */
export const SOLID_SCRIPT_FILE_EXTENSION = 'aiscript';

/** Zip entry holding the script. */
export const SOLID_SCRIPT_FILE_ENTRY = 'script.json';

/** Format tag of script.json. */
const SOLID_SCRIPT_FILE_FORMAT = 'aiworlded.solidscript';

/** A resource embedded under resources/ in a script file. */
export interface SolidScriptFileResource {
  /** Zip entry path, under resources/. */
  path: string;
  /** MIME type. */
  type: string;
}

/** Contents of script.json. */
interface SolidScriptFileJson {
  format: typeof SOLID_SCRIPT_FILE_FORMAT;
  version: number;
  name: string;
  blocks: SolidScriptDocument['blocks'];
  uses?: SolidScriptDocument['uses'];
  /** True when the script has an edit mode. */
  editMode?: true;
  resources: SolidScriptFileResource[];
}

/**
 * Writes a script file: a zip holding script.json with the lines, with room for
 * resources under resources/.
 *
 * @param document Script, its name included.
 * @returns File contents.
 */
export async function solidScriptFileEncode(document: SolidScriptDocument): Promise<Blob> {
  const json: SolidScriptFileJson = {
    format: SOLID_SCRIPT_FILE_FORMAT,
    version: SOLID_SCRIPT_DOCUMENT_VERSION,
    name: document.name,
    blocks: document.blocks,
    ...(document.uses ? { uses: document.uses } : {}),
    ...(document.editMode ? { editMode: true as const } : {}),
    resources: [],
  };
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter(async (chunk) => {
    chunks.push(chunk);
  });
  await writer.addText(SOLID_SCRIPT_FILE_ENTRY, JSON.stringify(json, null, 2));
  await writer.close();
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

/**
 * Reads a script file.
 *
 * @param file File contents.
 * @returns Script with its stored name.
 */
export async function solidScriptFileDecode(file: Blob): Promise<SolidScriptDocument> {
  const zip = await ZipReader.open(file);
  const entry = zip.entry(SOLID_SCRIPT_FILE_ENTRY);
  if (!entry) throw new Error(`The file has no ${SOLID_SCRIPT_FILE_ENTRY}.`);
  const json = JSON.parse(await (await zip.read(entry)).text()) as Partial<SolidScriptFileJson> | null;
  if (json?.format !== SOLID_SCRIPT_FILE_FORMAT) throw new Error('The file is no Solid Script.');
  if (typeof json.version !== 'number' || json.version > SOLID_SCRIPT_DOCUMENT_VERSION)
    throw new Error('The script was saved by a newer version of the editor.');
  return solidScriptDocumentNormalize(json);
}
