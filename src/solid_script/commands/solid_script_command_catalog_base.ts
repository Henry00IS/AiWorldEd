import type { SolidScriptCommand, SolidScriptCommandCategory } from './solid_script_command.js';

/**
 * A set of commands one editor works with: the commands, their palette groups
 * in palette order, and the favorites a palette starts with.
 */
export class SolidScriptCommandCatalog {
  /** Commands by id. */
  private readonly byId: ReadonlyMap<string, SolidScriptCommand>;

  /**
   * Creates the catalog.
   *
   * @param name Short name used to keep the catalog's own settings apart, such
   *   as its favorites.
   * @param categories Palette groups in palette order.
   * @param commands Every command, in palette order.
   * @param favoritesDefault Favorite command ids before the user changes them.
   */
  constructor(
    readonly name: string,
    readonly categories: readonly SolidScriptCommandCategory[],
    readonly commands: readonly SolidScriptCommand[],
    readonly favoritesDefault: readonly string[] = [],
  ) {
    this.byId = new Map(commands.map((command) => [command.id, command]));
  }

  /**
   * Finds a command.
   *
   * @param id Stored command id.
   * @returns Command, or undefined when unknown.
   */
  find(id: string): SolidScriptCommand | undefined {
    return this.byId.get(id);
  }

  /**
   * Palette commands of one group, with those it lists too, sorted by their
   * display name so a new command appears in order without hand-sorting the
   * registry.
   *
   * @param category Palette group.
   * @returns Commands of that group, sorted by label.
   */
  ofCategory(category: SolidScriptCommandCategory): SolidScriptCommand[] {
    return this.commands
      .filter((command) => command.inPalette && (command.category === category || command.alsoIn.includes(category)))
      .sort((left, right) => left.label.localeCompare(right.label));
  }
}
