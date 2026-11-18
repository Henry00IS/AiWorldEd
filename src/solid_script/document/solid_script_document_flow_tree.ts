import type { SolidScriptBlock } from './solid_script_document.js';
import { solidScriptDocumentActiveLines } from './solid_script_document_active.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';

/** One line that is on, with the lines of its block when it opens one. */
export interface SolidScriptFlowNode {
  /** 0-based line. */
  readonly line: number;
  /** The line. */
  readonly block: SolidScriptBlock;
  /** Lines inside the block, before its Else. */
  readonly children: SolidScriptFlowNode[];
  /** Lines after its Else, or null without one. */
  otherwise: SolidScriptFlowNode[] | null;
  /** 0-based line of its Else, or -1. */
  elseLine: number;
  /** 0-based line of its End, or the line after the script when it has none. */
  end: number;
}

/**
 * Arranges the lines that are on into blocks for the checks that read the
 * script without running it. Unlike a run it never stops: a stray End or Else
 * is skipped and a block without an End closes at the end of the script.
 *
 * @param blocks Lines of the script.
 * @returns Top-level lines.
 */
export function solidScriptFlowTree(blocks: readonly SolidScriptBlock[]): SolidScriptFlowNode[] {
  const top: SolidScriptFlowNode[] = [];
  const open: SolidScriptFlowNode[] = [];
  for (const { block, line } of solidScriptDocumentActiveLines(blocks)) {
    const parent = open[open.length - 1];
    const nesting = solidScriptBlockNesting(block);
    if (nesting === 'close') solidScriptFlowTreeClose(open.pop(), line);
    else if (nesting === 'continue') solidScriptFlowTreeElse(parent, line);
    else {
      const node = solidScriptFlowTreeNode(block, line, blocks.length);
      (parent ? (parent.otherwise ?? parent.children) : top).push(node);
      if (nesting === 'open') open.push(node);
    }
  }
  return top;
}

/**
 * Makes the node of one line, closing at the end of the script until its End is
 * found.
 *
 * @param block Line.
 * @param line 0-based line.
 * @param end Lines in the script.
 * @returns Node.
 */
function solidScriptFlowTreeNode(block: SolidScriptBlock, line: number, end: number): SolidScriptFlowNode {
  return { line, block, children: [], otherwise: null, elseLine: -1, end };
}

/**
 * Closes a block at its End line.
 *
 * @param node Block, or undefined for a stray End.
 * @param line 0-based line of the End.
 */
function solidScriptFlowTreeClose(node: SolidScriptFlowNode | undefined, line: number): void {
  if (node) node.end = line;
}

/**
 * Starts the Else part of a block.
 *
 * @param node Innermost open block, or undefined for a stray Else.
 * @param line 0-based line of the Else.
 */
function solidScriptFlowTreeElse(node: SolidScriptFlowNode | undefined, line: number): void {
  if (!node || node.otherwise) return;
  node.otherwise = [];
  node.elseLine = line;
}
