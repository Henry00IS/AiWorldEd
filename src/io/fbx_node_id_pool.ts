/**
 * Allocates unique 64-bit-style integer identifiers for FBX object records and
 * records parent/child links used by the Connections block.
 */

/** One OO or OP link between two FBX object ids. */
export interface FbxObjectLink {
  /** Child object id (left side of C:). */
  childId: number;
  /** Parent object id (right side of C:), or 0 for scene root. */
  parentId: number;
  /** Connection kind: object-object or object-property. */
  kind: 'OO' | 'OP';
  /** Property name when kind is OP (e.g. DiffuseColor). */
  propertyName?: string;
}

/** Sequential id allocator and connection list for one export session. */
export class FbxNodeIdPool {
  private nextId = 2000;
  private readonly links: FbxObjectLink[] = [];

  /**
   * Allocates the next unused object id.
   *
   * @returns A new positive integer id.
   */
  takeId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  /**
   * Records an object-object connection (child under parent).
   *
   * @param childId Child object id.
   * @param parentId Parent object id, or 0 for the document root.
   */
  linkChildToParent(childId: number, parentId: number): void {
    this.links.push({ childId, parentId, kind: 'OO' });
  }

  /**
   * Records an object-property connection (e.g. texture drives DiffuseColor).
   *
   * @param childId Source object id.
   * @param parentId Target object id that owns the property.
   * @param propertyName FBX property name on the parent.
   */
  linkProperty(childId: number, parentId: number, propertyName: string): void {
    this.links.push({ childId, parentId, kind: 'OP', propertyName });
  }

  /**
   * Returns all recorded links in insertion order.
   *
   * @returns Connection list for the Connections block.
   */
  getLinks(): readonly FbxObjectLink[] {
    return this.links;
  }
}
