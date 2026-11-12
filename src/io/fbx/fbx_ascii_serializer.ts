import { FBX_EXPORT_CREATOR } from './fbx_export_document.js';
import type { FbxExportNode, FbxExportValue } from './fbx_export_node.js';

/**
 * Writes an FBX record tree as ASCII FBX 7.4 text, following the Autodesk SDK's
 * layout: "Name: values {" blocks, "*N { a: ... }" arrays, a space before
 * quoted strings, "Class::name" object names and """ for quotes.
 */
export class FbxAsciiSerializer {
  /**
   * Serializes the top-level records.
   *
   * @param nodes Top-level records.
   * @returns FBX ASCII text ending with a newline.
   */
  serialize(nodes: readonly FbxExportNode[]): string {
    const lines = ['; FBX 7.4.0 project file', `; Created by ${FBX_EXPORT_CREATOR}`, '; ' + '-'.repeat(52), ''];
    for (const node of nodes) {
      this.writeNode(node, 0, lines);
      lines.push('');
    }
    return `${lines.join('\n')}\n`;
  }

  /**
   * Appends one record and its children.
   *
   * @param node Record.
   * @param depth Indentation depth.
   * @param lines Output lines.
   */
  private writeNode(node: FbxExportNode, depth: number, lines: string[]): void {
    const indent = '\t'.repeat(depth);
    const [only] = node.properties;
    if (node.properties.length === 1 && only !== undefined && isArrayValue(only)) {
      const values = only.value as readonly (number | boolean)[];
      lines.push(`${indent}${node.name}: *${values.length} {`);
      lines.push(
        `${indent}\ta: ${values.map((value) => (typeof value === 'boolean' ? (value ? '1' : '0') : formatNumber(value))).join(',')}`,
      );
      lines.push(`${indent}}`);
      return;
    }
    const head = `${indent}${node.name}: ${this.formatValues(node.properties)}`;
    if (node.children.length === 0 && node.properties.length > 0) {
      lines.push(head);
      return;
    }
    lines.push(`${head} {`);
    node.children.forEach((child) => this.writeNode(child, depth + 1, lines));
    lines.push(`${indent}}`);
  }

  /**
   * Formats scalar properties separated by commas, with a space before each
   * quoted string.
   *
   * @param values Values.
   * @returns Text.
   */
  private formatValues(values: readonly FbxExportValue[]): string {
    return values
      .map((value, index) => {
        const text = formatScalar(value);
        return index > 0 && text.startsWith('"') ? ` ${text}` : text;
      })
      .join(',');
  }
}

/**
 * Tells whether a value is an array.
 *
 * @param value Value.
 * @returns True for array type codes.
 */
function isArrayValue(value: FbxExportValue): boolean {
  return value.type === value.type.toLowerCase();
}

/**
 * Formats one scalar value.
 *
 * @param value Value.
 * @returns Text.
 */
function formatScalar(value: FbxExportValue): string {
  switch (value.type) {
    case 'C':
      return value.value ? 'Y' : 'N';
    case 'Y':
    case 'I':
    case 'L':
      return String(Math.trunc(value.value));
    case 'F':
    case 'D':
      return formatFloat(value.value);
    case 'S':
      return `"${escapeFbxString(value.objectClass === undefined ? value.value : `${value.objectClass}::${value.value}`)}"`;
    case 'R':
      return `"${bytesToBase64(value.value)}"`;
    default:
      throw new Error(`FBX array ${value.type} must be the record's only value`);
  }
}

/**
 * Formats a float so it reads back as one: full round-trip precision and always
 * a decimal point or exponent.
 *
 * @param value Number.
 * @returns Text such as "0.0" or "1.5".
 */
function formatFloat(value: number): string {
  const text = formatNumber(value);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/**
 * Formats a number with full round-trip precision, keeping the sign of zero so
 * ASCII and binary files hold the same values.
 *
 * @param value Number.
 * @returns Text; non-finite values become 0.
 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * Escapes a string for FBX double quotes (quotes become """, the FBX SDK's
 * escape; backslashes stay as written so Windows paths survive).
 *
 * @param value Raw string.
 * @returns Escaped string without surrounding quotes.
 */
function escapeFbxString(value: string): string {
  return value.replace(/"/g, '&quot;');
}

/**
 * Encodes raw bytes as base64, the FBX SDK's ASCII form for binary blobs.
 *
 * @param bytes Bytes.
 * @returns Base64 text.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}
