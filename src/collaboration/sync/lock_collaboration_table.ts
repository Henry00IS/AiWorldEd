/**
 * Mirror of the room's selection locks: who holds which node id, plus the ids
 * this client requested optimistically before the relay confirmed them.
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
   * @returns Own user id, or -1 before welcome.
   */
  selfGet(): number {
    return this.self;
  }

  /**
   * Applies a lock change broadcast or confirmed by the relay.
   *
   * @param user Holder.
   * @param add Newly held ids.
   * @param remove Released ids.
   */
  apply(user: number, add: readonly string[], remove: readonly string[]): void {
    remove.forEach((id) => {
      if (this.holders.get(id) === user) this.holders.delete(id);
      if (user === this.self) this.requested.delete(id);
    });
    add.forEach((id) => this.holders.set(id, user));
  }

  /**
   * Replaces the optimistic request set.
   *
   * @param ids Ids the local user wants to hold.
   */
  requestSet(ids: Iterable<string>): void {
    this.requested.clear();
    for (const id of ids) this.requested.add(id);
  }

  /**
   * Adds ids to the optimistic request set (newly created nodes).
   *
   * @param ids Ids now held by the local user.
   */
  requestAdd(ids: Iterable<string>): void {
    for (const id of ids) {
      this.requested.add(id);
      if (!this.holders.has(id)) this.holders.set(id, this.self);
    }
  }

  /**
   * Returns the holder of an id.
   *
   * @param id Node id.
   * @returns Holder user id, or undefined.
   */
  holder(id: string): number | undefined {
    return this.holders.get(id);
  }

  /**
   * Returns whether another user holds an id.
   *
   * @param id Node id.
   * @returns True when held by somebody else.
   */
  heldByOther(id: string): boolean {
    const holder = this.holders.get(id);
    return holder !== undefined && holder !== this.self;
  }

  /**
   * Returns whether the local user holds or requested an id.
   *
   * @param id Node id.
   * @returns True when local edits of the id are allowed.
   */
  heldBySelf(id: string): boolean {
    if (this.heldByOther(id)) return false;
    return this.requested.has(id) || this.holders.get(id) === this.self;
  }

  /**
   * Returns the ids held by one user.
   *
   * @param user Holder.
   * @returns Held ids.
   */
  idsOf(user: number): string[] {
    const ids: string[] = [];
    this.holders.forEach((holder, id) => {
      if (holder === user) ids.push(id);
    });
    return ids;
  }

  /**
   * Returns every holder with at least one lock.
   *
   * @returns Map of user id to held ids.
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
   * Drops every lock of a user (for example after they left).
   *
   * @param user Holder.
   */
  userClear(user: number): void {
    this.apply(user, [], this.idsOf(user));
  }

  /** Forgets every lock. */
  clear(): void {
    this.holders.clear();
    this.requested.clear();
  }
}
