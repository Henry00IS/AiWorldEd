import { describe, expect, it } from 'vitest';
import { ZipReader } from '@/io/zip/zip_reader.js';
import { ZipWriter } from '@/io/zip/zip_writer.js';
import {
  SOLID_SCRIPT_FILE_ENTRY,
  solidScriptFileDecode,
  solidScriptFileEncode,
} from '@/solid_script/file/solid_script_file.js';
import { solidScriptDocumentDefault } from '@/solid_script/document/solid_script_document.js';

/**
 * Writes a zip with the given text entries.
 *
 * @param entries Entry texts by name.
 * @returns Zip file.
 */
async function zipOf(entries: Record<string, string>): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter(async (chunk) => {
    chunks.push(chunk);
  });
  for (const [name, text] of Object.entries(entries)) await writer.addText(name, text);
  await writer.close();
  return new Blob(chunks as BlobPart[]);
}

describe('.aiscript files', () => {
  it('store the script as a versioned script.json inside a zip and read it back', async () => {
    const document = solidScriptDocumentDefault();
    const file = await solidScriptFileEncode(document, 'Hollow Cube');
    const zip = await ZipReader.open(file);
    const entry = zip.entry(SOLID_SCRIPT_FILE_ENTRY);
    if (!entry) throw new Error('Expected script.json');
    const json = JSON.parse(await (await zip.read(entry)).text()) as Record<string, unknown>;
    expect(json).toMatchObject({ format: 'aiworlded.solidscript', version: 1, name: 'Hollow Cube', resources: [] });
    const decoded = await solidScriptFileDecode(file);
    expect(decoded.name).toBe('Hollow Cube');
    expect(decoded.document.blocks).toEqual(document.blocks);
  });

  it('ignores resource entries it does not know, so later versions can embed files', async () => {
    const script = JSON.stringify({
      format: 'aiworlded.solidscript',
      version: 1,
      name: 'A',
      blocks: [],
      resources: [],
    });
    const decoded = await solidScriptFileDecode(await zipOf({ 'resources/brick.png': 'x', 'script.json': script }));
    expect(decoded.document.blocks).toEqual([]);
  });

  it('rejects files that are no script, scripts from a newer editor and broken zips', async () => {
    await expect(solidScriptFileDecode(await zipOf({ 'other.json': '{}' }))).rejects.toThrow(/script\.json/);
    await expect(
      solidScriptFileDecode(
        await zipOf({ 'script.json': JSON.stringify({ format: 'aiworlded.solidscript', version: 9 }) }),
      ),
    ).rejects.toThrow(/newer/);
    await expect(solidScriptFileDecode(await zipOf({ 'script.json': '{"format":"x"}' }))).rejects.toThrow(
      /SolidScript/,
    );
    await expect(solidScriptFileDecode(new Blob(['not a zip']))).rejects.toThrow();
  });
});
