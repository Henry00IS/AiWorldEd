import { FbxImportAsciiTokenizer } from './fbx_import_ascii_tokenizer.js';
import { FbxImportNode, type FbxImportValue } from './fbx_import_node.js';

/** Record name holding the values of an ASCII array ("Vertices: *3 { a: ... }"). */
const FBX_IMPORT_ASCII_ARRAY_RECORD = 'a';

/**
 * Parses ASCII FBX (7.x) into the same record tree as binary files: arrays
 * become float64 arrays and every other value keeps its scalar type.
 */
export class FbxImportParserAscii {
  /**
   * Parses a file.
   *
   * @param text File text.
   * @returns Top-level records.
   */
  parse(text: string): FbxImportNode[] {
    return this.recordListRead(new FbxImportAsciiTokenizer(text));
  }

  /**
   * Reads records until a closing brace or the end of the file.
   *
   * @param tokenizer Tokenizer.
   * @returns Records.
   */
  private recordListRead(tokenizer: FbxImportAsciiTokenizer): FbxImportNode[] {
    const records: FbxImportNode[] = [];
    for (let token = tokenizer.next(); token.kind !== 'end' && token.kind !== 'close'; token = tokenizer.next()) {
      if (token.kind === 'key') records.push(this.recordRead(tokenizer, token.text));
    }
    return records;
  }

  /**
   * Reads the values and nested records of one record.
   *
   * @param tokenizer Tokenizer after the record name.
   * @param name Record name.
   * @returns Record.
   */
  private recordRead(tokenizer: FbxImportAsciiTokenizer, name: string): FbxImportNode {
    const properties: FbxImportValue[] = [];
    let isArray = false;
    for (let token = tokenizer.peek(); ; token = tokenizer.peek()) {
      if (token.kind === 'value') properties.push(token.value);
      else if (token.kind === 'count') isArray = true;
      else if (token.kind !== 'comma') break;
      tokenizer.next();
    }
    const children = this.blockRead(tokenizer);
    return isArray ? fbxImportAsciiArrayRecord(name, children) : new FbxImportNode(name, properties, children);
  }

  /**
   * Reads the nested records of a "{ ... }" block when one follows.
   *
   * @param tokenizer Tokenizer after the record values.
   * @returns Nested records, or an empty list without a block.
   */
  private blockRead(tokenizer: FbxImportAsciiTokenizer): FbxImportNode[] {
    if (tokenizer.peek().kind !== 'open') return [];
    tokenizer.next();
    return this.recordListRead(tokenizer);
  }
}

/**
 * Builds the record of an ASCII array from its "a:" values.
 *
 * @param name Record name.
 * @param children Nested records of the array block.
 * @returns Record whose only property is the array.
 */
function fbxImportAsciiArrayRecord(name: string, children: readonly FbxImportNode[]): FbxImportNode {
  const values = children.find((child) => child.name === FBX_IMPORT_ASCII_ARRAY_RECORD)?.properties ?? [];
  const array = new Float64Array(values.length);
  values.forEach((value, index) => (array[index] = typeof value === 'string' ? 0 : Number(value)));
  return new FbxImportNode(name, [array], []);
}
