/**
 * Lease table of a room as this client sees it: which member's running edit
 * (lease) holds each node exclusively, plus the local candidate set (the
 * selection's subtrees and nodes this client created) whose live changes are
 * streamed. Selecting never locks anything; only the relay's lease broadcasts
 * fill the holder map.
 */
export class LockCollaborationTable {
  private readonly holders: Map<string, number>;
  private readonly requested: Set<string>;
  private self: number;

  /** Creates an empty table. */
  constructor() {
    this.holders = new Map();
    this.requested = new Set();
    this.self = -1;
  }

  /**
   * Sets the local user id.
   *
   * @param user Own user id.
   */
  selfSet(user: number): void {
    this.self = user;
  }

  /**
   * Returns the local user id.
   *
   * @returns Own user id, or -1 before joining.
   */
  selfGet(): number {
    return this.self;
  }

  /**
   * Applies a lease change of one member.
   *
   * @param user Holder.
   * @param add Ids now held.
   * @param remove Ids released.
   */
  apply(user: number, add: readonly string[], remove: readonly string[]): void {
    remove.forEach((id) => {
      if (this.holders.get(id) === user) this.holders.delete(id);
    });
    add.forEach((id) => this.holders.set(id, user));
  }

  /**
   * Replaces the local candidate set.
   *
   * @param ids Selected subtrees and created ids.
   */
  requestSet(ids: Iterable<string>): void {
    this.requested.clear();
    for (const id of ids) this.requested.add(id);
  }

  /**
   * Adds candidates (nodes this client just created).
   *
   * @param ids Ids.
   */
  requestAdd(ids: Iterable<string>): void {
    for (const id of ids) this.requested.add(id);
  }

  /**
   * Removes candidates (deleted nodes).
   *
   * @param ids Ids.
   */
  requestRemove(ids: Iterable<string>): void {
    for (const id of ids) this.requested.delete(id);
  }

  /**
   * Returns the local candidate set.
   *
   * @returns Ids.
   */
  requestedIds(): ReadonlySet<string> {
    return this.requested;
  }

  /**
   * Returns the member whose running edit holds a node.
   *
   * @param id Node id.
   * @returns Holder, or undefined.
   */
  holder(id: string): number | undefined {
    return this.holders.get(id);
  }

  /**
   * Returns whether another member's running edit holds a node.
   *
   * @param id Node id.
   * @returns True when held by somebody else.
   */
  heldByOther(id: string): boolean {
    const holder = this.holders.get(id);
    return holder !== undefined && holder !== this.self;
  }

  /**
   * Returns whether the local user's running edit holds a node.
   *
   * @param id Node id.
   * @returns True when held by this client.
   */
  heldBySelf(id: string): boolean {
    return this.holders.get(id) === this.self;
  }

  /**
   * Returns the ids one member holds.
   *
   * @param user Member.
   * @returns Ids.
   */
  idsOf(user: number): string[] {
    const ids: string[] = [];
    this.holders.forEach((holder, id) => {
      if (holder === user) ids.push(id);
    });
    return ids;
  }

  /**
   * Groups held ids by member.
   *
   * @returns Ids per member.
   */
  byUser(): Map<number, string[]> {
    const result = new Map<number, string[]>();
    this.holders.forEach((holder, id) => {
      const list = result.get(holder);
      if (list === undefined) result.set(holder, [id]);
      else list.push(id);
    });
    return result;
  }

  /**
   * Drops every lease of one member.
   *
   * @param user Member.
   */
  userClear(user: number): void {
    this.apply(user, [], this.idsOf(user));
  }

  /** Forgets everything. */
  clear(): void {
    this.holders.clear();
    this.requested.clear();
  }
}
