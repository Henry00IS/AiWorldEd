/** How a line shapes the block structure, as its command declares. */
export type SolidScriptBlockNesting = 'open' | 'continue' | 'close' | 'none';

/** What the block tree needs to know about a command. */
export interface SolidScriptTreeCommand {
  /** Visible name, for messages. */
  readonly label: string;
  /** How the line shapes the block structure. */
  readonly nesting: SolidScriptBlockNesting;
  /** False for lines that do nothing when run, such as notes and blank lines. */
  readonly runs: boolean;
}

/** One line of a script ready to run, with the lines inside its block. */
export interface SolidScriptBlockNode<Command extends SolidScriptTreeCommand> {
  /** 1-based line number in the script. */
  line: number;
  /** Command of the line. */
  command: Command;
  /** Stored values of the line. */
  values: Readonly<Record<string, string>>;
  /** Lines up to its End, or up to its Else when it has one. */
  children: SolidScriptBlockNode<Command>[];
  /** Lines between its Else and End, or null without an Else. */
  otherwise: SolidScriptBlockNode<Command>[] | null;
}

/** One stored line. */
export interface SolidScriptTreeLine {
  command: string;
  values: Readonly<Record<string, string>>;
  /** True for a line turned off: it and the lines of its block do not run. */
  off?: boolean;
}

/**
 * Arranges the lines of a script into blocks by their End and Else lines. A
 * stray End, an Else outside an If, a missing End or an unknown command stops
 * the script before anything runs, at the line in question.
 *
 * @param lines Stored lines.
 * @param find Looks up the command of a line.
 * @returns Top-level lines.
 */
export function solidScriptBlockTree<Command extends SolidScriptTreeCommand>(
  lines: readonly SolidScriptTreeLine[],
  find: (id: string) => Command | undefined,
): SolidScriptBlockNode<Command>[] {
  const top: SolidScriptBlockNode<Command>[] = [];
  const open: { node: SolidScriptBlockNode<Command>; id: string }[] = [];
  const target = (): SolidScriptBlockNode<Command>[] => {
    const parent = open[open.length - 1]?.node;
    return parent ? (parent.otherwise ?? parent.children) : top;
  };
  lines.forEach((stored, index) => {
    const line = index + 1;
    const command = find(stored.command);
    if (!command) throw new Error(`line ${line}: this editor does not know the command "${stored.command}"`);
    const node: SolidScriptBlockNode<Command> = { line, command, values: stored.values, children: [], otherwise: null };
    if (command.nesting === 'close') {
      if (!open.pop()) throw new Error(`line ${line}: this End has no block above it to close; remove it`);
      return;
    }
    if (command.nesting === 'continue') {
      const parent = open[open.length - 1];
      if (!parent || parent.id !== 'if' || parent.node.otherwise)
        throw new Error(`line ${line}: ${command.label} must follow the lines of an If, before its End`);
      parent.node.otherwise = [];
      return;
    }
    if (command.runs && !(stored.off === true && (command.nesting === 'none' || command.nesting === 'open')))
      target().push(node);
    if (command.nesting === 'open') open.push({ node, id: stored.command });
  });
  const unclosed = open.pop();
  if (unclosed)
    throw new Error(
      `line ${unclosed.node.line}: ${unclosed.node.command.label} has no End; add an End below the lines it should apply to`,
    );
  return top;
}
