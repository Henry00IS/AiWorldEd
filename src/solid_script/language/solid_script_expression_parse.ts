import type { SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptLexer } from './solid_script_lexer.js';
import { SolidScriptParserExpression } from './solid_script_parser_expression.js';

/** Parser of one value typed into a block, such as "[i * width, 0, 0]". */
class SolidScriptValueParser extends SolidScriptParserExpression {
  /**
   * Creates the parser.
   *
   * @param text Value text.
   */
  constructor(text: string) {
    super(new SolidScriptLexer(text).tokenize());
  }

  /**
   * Parses text that must be exactly one value.
   *
   * @returns Expression.
   */
  parseValue(): SolidScriptExpression {
    const value = this.parseExpression();
    if (this.peek().kind !== 'end')
      throw new Error(
        `"${this.peek().text}" follows a complete value; join values with an operator such as +, or put them in a list such as [1, 2, 3]`,
      );
    return value;
  }
}

/**
 * Parses the value of one block field: a number, a list, a text, a variable or
 * a formula of them.
 *
 * @param text Value text.
 * @returns Expression.
 */
export function solidScriptExpressionParse(text: string): SolidScriptExpression {
  try {
    return new SolidScriptValueParser(text).parseValue();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^line \d+: /, ''));
  }
}
