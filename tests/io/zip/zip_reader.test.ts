import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { ZipReader, zipReaderSignatureIs } from '@/io/zip/zip_reader.js';
import { ZipWriter } from '@/io/zip/zip_writer.js';

/**
 * Writes a zip with the streaming writer and collects its chunks.
 *
 * @param fill Adds the entries.
 * @returns The zip and the chunk sizes the sink received.
 */
async function zipWrite(fill: (writer: ZipWriter) => Promise<void>): Promise<{ zip: Blob; chunks: number[] }> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const writer = new ZipWriter(async (chunk) => void parts.push(new Uint8Array(chunk)));
  await fill(writer);
  await writer.close();
  return { zip: new Blob(parts), chunks: parts.map((part) => part.length) };
}

/**
 * Builds bytes that count up.
 *
 * @param length Byte count.
 * @returns Bytes.
 */
function bytesCounting(length: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length }, (_value, index) => index % 251);
}

afterEach(() => vi.restoreAllMocks());

describe('ZipWriter and ZipReader', () => {
  it('round-trips a deflated text and a stored blob', async () => {
    const image = bytesCounting(5000);
    const { zip } = await zipWrite(async (writer) => {
      await writer.addText('world.json', '{"version":1,"name":"Grüße 🌍"}');
      await writer.addBlob('textures/a.png', new Blob([image]));
    });
    expect(zipReaderSignatureIs(new Uint8Array(await zip.slice(0, 4).arrayBuffer()))).toBe(true);
    const reader = await ZipReader.open(zip);
    expect(reader.list().map((entry) => [entry.name, entry.method])).toEqual([
      ['world.json', 8],
      ['textures/a.png', 0],
    ]);
    expect(await (await reader.read(reader.entry('world.json')!)).text()).toBe('{"version":1,"name":"Grüße 🌍"}');
    expect(new Uint8Array(await (await reader.read(reader.entry('textures/a.png')!)).arrayBuffer())).toEqual(image);
  });

  it('streams a large blob through the sink in pieces instead of one buffer', async () => {
    const size = 3 * 1024 * 1024;
    const { zip, chunks } = await zipWrite((writer) => writer.addBlob('big.bin', new Blob([bytesCounting(size)])));
    expect(chunks.length).toBeGreaterThan(2);
    expect(Math.max(...chunks)).toBeLessThan(size);
    const reader = await ZipReader.open(zip);
    expect((await reader.read(reader.entry('big.bin')!)).size).toBe(size);
  });

  it('opens by reading only the end of the file and returns stored entries unread', async () => {
    const { zip } = await zipWrite(async (writer) => {
      await writer.addText('world.json', '{}');
      for (let index = 0; index < 4; index += 1)
        await writer.addBlob(`textures/${index}.png`, new Blob([bytesCounting(200_000)]));
    });
    const read = vi.spyOn(Blob.prototype, 'arrayBuffer');
    const reader = await ZipReader.open(zip);
    const slices = await Promise.all(
      reader
        .list()
        .slice(1)
        .map((entry) => reader.read(entry)),
    );
    const bytesRead = await Promise.all(read.mock.contexts.map((blob) => (blob as Blob).size));
    expect(slices.map((slice) => slice.size)).toEqual([200_000, 200_000, 200_000, 200_000]);
    expect(bytesRead.reduce((sum, size) => sum + size, 0)).toBeLessThan(70_000);
  });

  it('reads zips written by other tools, with extra fields and deflated entries', async () => {
    const hello = Uint8Array.from([104, 101, 108, 108, 111]);
    const zip = new Blob([zipSync({ 'a.txt': [hello, { level: 9, extra: { 0x1234: Uint8Array.from([1, 2]) } }] })]);
    const reader = await ZipReader.open(zip);
    expect(await (await reader.read(reader.entry('a.txt')!)).text()).toBe('hello');
  });

  it('rejects files that are not zips', async () => {
    expect(zipReaderSignatureIs(new TextEncoder().encode('{"version":1}'))).toBe(false);
    await expect(ZipReader.open(new Blob(['{"version":1}']))).rejects.toThrow('Not a zip file');
  });
});
