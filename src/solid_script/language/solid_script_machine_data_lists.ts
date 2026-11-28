import { solidScriptKindNamed } from './solid_script_kinds.js';
import {
  solidScriptListIndex,
  solidScriptListItemRead,
  solidScriptListItemRemove,
  solidScriptListItemTargetParse,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { SolidScriptMachineMembers, type SolidScriptMemberValue } from './solid_script_machine_members.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptMemberWriteParse, type SolidScriptMemberWrite } from './solid_script_name_rules.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { SolidScriptDictionary, SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';

/** One .Data key on one element or Dictionary. */
interface SolidScriptDataHolder {
  data: SolidScriptElement;
  name: string;
  present: boolean;
  value: SolidScriptValue;
  owner: SolidScriptValue;
  shown: string;
}

/**
 * A value under .Data that a list or Dictionary line can change: the key
 * itself, or an item of a list stored there.
 */
interface SolidScriptDataSlot {
  value: SolidScriptValue | undefined;
  holder: SolidScriptDataHolder;
  shown: string;
  atKey: boolean;
}

/**
 * Changes lists and Dictionaries stored under .Data in place, the same way list
 * lines change an ordinary variable: Add Item appends, it does not replace the
 * list, and every name for that list sees the change.
 */
export abstract class SolidScriptMachineDataLists extends SolidScriptMachineMembers {
  /**
   * Writes a Data key, or one item of a list stored under that key, such as Set
   * Box.Data.Items(2).
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @param valueOf Value of each item.
   */
  protected override dataWrite(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    valueOf: SolidScriptMemberValue,
  ): void {
    if (this.dataStoredListItemWrite(scope, write, valueOf)) return;
    super.dataWrite(scope, write, valueOf);
  }

  /**
   * Sets or adds one item of a list stored under a Data key, such as
   * Box.Data.Items(2) or Box.Data.Items(), when the owner is one element and
   * the key already holds a list.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @param valueOf Value of the item.
   * @returns True when the name was such a list item.
   */
  private dataStoredListItemWrite(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    valueOf: SolidScriptMemberValue,
  ): boolean {
    if (write.item === null) return false;
    const holders = this.dataHolders(scope, write);
    if (holders.length !== 1 || !Array.isArray(holders[0]!.value)) return false;
    const items = holders[0]!.value;
    const index = write.item.trim() === '' ? null : this.indexValue(write.item, scope);
    const at = index === null ? items.length : solidScriptListIndex(write.shown, index, (name) => name);
    const value = valueOf(at < items.length ? items[at] : '', at, items.length);
    this.listEditCheck(items, write.shown, value);
    solidScriptListItemWrite(write.shown, items, index, value, (name) => name);
    this.persistentOwnerKeep(write.owner, scope);
    return true;
  }

  /**
   * Reads a list stored under .Data, such as Box.Data.Items, for Find Item.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @returns The list.
   */
  protected override listRead(scope: SolidScriptScope, name: string): SolidScriptValue[] {
    const write = solidScriptMemberWriteParse(name);
    if (write?.kind !== 'data') return super.listRead(scope, name);
    const slots = this.dataListSlots(scope, write);
    if (slots.length === 1) return this.dataListFromSlot(slots[0]!, false);
    const value = this.fieldVariable(name, scope);
    if (!Array.isArray(value)) this.dataListWrong(name, value);
    return value;
  }

  /**
   * Changes lists under .Data in place for a list line, or returns false when
   * the name is not a Data member.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param change Changes each list.
   * @param create Whether a missing key becomes a list.
   * @returns True when the name was a Data member.
   */
  protected dataListChange(
    scope: SolidScriptScope,
    name: string,
    change: (items: SolidScriptValue[]) => void,
    create: boolean,
  ): boolean {
    const write = solidScriptMemberWriteParse(name);
    if (write?.kind !== 'data') return false;
    for (const slot of this.dataListSlots(scope, write)) this.dataListSlotChange(slot, change, create);
    this.persistentOwnerKeep(write.owner, scope);
    return true;
  }

  /**
   * Changes Dictionaries under .Data in place, or returns false when the name
   * is not a Data member.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param create Whether a missing key becomes a Dictionary.
   * @param change Changes each Dictionary.
   * @returns True when the name was a Data member.
   */
  protected dataDictionaryChange(
    scope: SolidScriptScope,
    name: string,
    create: boolean,
    change: (dictionary: SolidScriptDictionary) => void,
  ): boolean {
    const write = solidScriptMemberWriteParse(name);
    if (write?.kind !== 'data') return false;
    for (const slot of this.dataListSlots(scope, write)) this.dataDictionarySlot(slot, create, change);
    this.persistentOwnerKeep(write.owner, scope);
    return true;
  }

  /**
   * Empties Data keys for Clear Variable, or returns false when the name is not
   * a Data key.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @returns True when the keys were emptied.
   */
  protected dataClear(scope: SolidScriptScope, name: string): boolean {
    const write = solidScriptMemberWriteParse(name);
    if (write?.kind !== 'data') return false;
    const slots = this.dataListSlots(scope, write);
    if (slots.some((slot) => !slot.atKey)) return false;
    for (const slot of slots) this.dataSlotClear(slot);
    this.persistentOwnerKeep(write.owner, scope);
    return true;
  }

  /**
   * Takes one item out of a list under .Data, such as Box.Data.Items(2) or
   * Faces(2).Data.Kind(), or returns false when the target is not such a name.
   *
   * @param scope Scope of the line.
   * @param target Item as written.
   * @returns True when an item was removed.
   */
  protected dataItemRemove(scope: SolidScriptScope, target: string): boolean {
    const item = solidScriptListItemTargetParse(target);
    if (!item) return false;
    const write = solidScriptMemberWriteParse(item.name);
    if (write?.kind !== 'data') return false;
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    for (const slot of this.dataListSlots(scope, write)) this.dataSlotItemRemove(slot, index);
    this.persistentOwnerKeep(write.owner, scope);
    return true;
  }

  /**
   * Mutates the list in one Data slot, making a list when the line may create
   * one and the key is not set yet.
   *
   * @param slot The slot.
   * @param change Changes the list.
   * @param create Whether a missing key becomes a list.
   */
  private dataListSlotChange(
    slot: SolidScriptDataSlot,
    change: (items: SolidScriptValue[]) => void,
    create: boolean,
  ): void {
    const items = this.dataListFromSlot(slot, create);
    this.listEditCheck(slot.holder.data, slot.shown);
    this.listEditCheck(items, slot.shown);
    change(items);
  }

  /**
   * Returns the list in a slot, or writes a new one when the line may create
   * it.
   *
   * @param slot The slot.
   * @param create Whether a missing key becomes a list.
   * @returns The list.
   */
  private dataListFromSlot(slot: SolidScriptDataSlot, create: boolean): SolidScriptValue[] {
    if (Array.isArray(slot.value)) return slot.value;
    if (slot.value !== undefined) this.dataListWrong(slot.shown, slot.value);
    if (!create || !slot.atKey) this.dataListMissing(slot.shown);
    const made: SolidScriptValue[] = [];
    this.listEditCheck(slot.holder.data, slot.shown, made);
    this.elements.dataWrite(slot.holder.data, solidScriptNameKey(slot.holder.name), slot.holder.name, made);
    return made;
  }

  /**
   * Mutates the Dictionary in one Data slot, making one when the line may
   * create it and the key is not set yet.
   *
   * @param slot The slot.
   * @param create Whether a missing key becomes a Dictionary.
   * @param change Changes the Dictionary.
   */
  private dataDictionarySlot(
    slot: SolidScriptDataSlot,
    create: boolean,
    change: (dictionary: SolidScriptDictionary) => void,
  ): void {
    const dictionary = this.dataDictionaryFromSlot(slot, create);
    this.listEditCheck(slot.holder.data, slot.shown);
    this.listEditCheck(dictionary, slot.shown);
    change(dictionary);
  }

  /**
   * Returns the Dictionary in a slot, or writes a new one when the line may
   * create it.
   *
   * @param slot The slot.
   * @param create Whether a missing key becomes a Dictionary.
   * @returns The Dictionary.
   */
  private dataDictionaryFromSlot(slot: SolidScriptDataSlot, create: boolean): SolidScriptDictionary {
    if (slot.value instanceof SolidScriptDictionary) return slot.value;
    if (slot.value !== undefined) this.dataDictionaryWrong(slot.shown, slot.value);
    if (!create || !slot.atKey) this.dataDictionaryMissing(slot.shown);
    const made = new SolidScriptDictionary();
    this.listEditCheck(slot.holder.data, slot.shown, made);
    this.elements.dataWrite(slot.holder.data, solidScriptNameKey(slot.holder.name), slot.holder.name, made);
    return made;
  }

  /**
   * Writes a new empty value of the kind a Data key holds, so other names for
   * the old value keep it.
   *
   * @param slot The key.
   */
  private dataSlotClear(slot: SolidScriptDataSlot): void {
    this.listEditCheck(slot.holder.data, slot.shown);
    const empty = solidScriptValueEmpty(slot.value);
    this.elements.dataWrite(slot.holder.data, solidScriptNameKey(slot.holder.name), slot.holder.name, empty);
  }

  /**
   * Takes one item out of the list in a slot.
   *
   * @param slot The list.
   * @param index Item to remove, or null for the last item.
   */
  private dataSlotItemRemove(slot: SolidScriptDataSlot, index: SolidScriptValue | null): void {
    const items = this.dataListFromSlot(slot, false);
    this.listEditCheck(slot.holder.data, slot.shown);
    this.listEditCheck(items, slot.shown);
    solidScriptListItemRemove(slot.shown, items, index, (name) => name);
  }

  /**
   * Resolves the lists or Data keys a Data name names: every owner, or one
   * owner or list item when the name has a number.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @returns Slots to change.
   */
  private dataListSlots(scope: SolidScriptScope, write: SolidScriptMemberWrite): SolidScriptDataSlot[] {
    const holders = this.dataHolders(scope, write);
    if (write.item === null) return holders.map((holder) => this.dataKeySlot(holder, write.shown));
    return this.dataItemSlots(scope, write, holders);
  }

  /**
   * A slot for a Data key itself, not an item of a list stored there.
   *
   * @param holder The key on one owner.
   * @param shown Name for messages.
   * @returns The slot.
   */
  private dataKeySlot(holder: SolidScriptDataHolder, shown: string): SolidScriptDataSlot {
    return { value: holder.present ? holder.value : undefined, holder, shown, atKey: true };
  }

  /**
   * Resolves an item number on a Data name: an item of a list stored on one
   * owner, or one owner of a list.
   *
   * @param scope Scope of the line, for the number.
   * @param write The write.
   * @param holders Keys of every owner.
   * @returns One slot.
   */
  private dataItemSlots(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    holders: readonly SolidScriptDataHolder[],
  ): SolidScriptDataSlot[] {
    if (holders.length === 1 && Array.isArray(holders[0]!.value))
      return [this.dataNestedSlot(scope, write, holders[0]!)];
    return [this.dataPickedSlot(scope, write, holders)];
  }

  /**
   * Reads one item of a list stored under a Data key, such as item 0 of
   * Box.Data.Groups.
   *
   * @param scope Scope of the line, for the number.
   * @param write The write.
   * @param holder The key that holds the list.
   * @returns The slot for that item.
   */
  private dataNestedSlot(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    holder: SolidScriptDataHolder,
  ): SolidScriptDataSlot {
    const at = solidScriptListIndex(write.shown, this.indexValue(write.item!, scope), (name) => name);
    const inner = solidScriptListItemRead(write.shown, holder.value, at, (name) => name);
    return { value: inner, holder, shown: `${write.shown}(${at})`, atKey: false };
  }

  /**
   * Picks the Data key of one owner, such as Faces.Data.Kind(2).
   *
   * @param scope Scope of the line, for the number.
   * @param write The write.
   * @param holders Keys of every owner.
   * @returns The slot for that owner.
   */
  private dataPickedSlot(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    holders: readonly SolidScriptDataHolder[],
  ): SolidScriptDataSlot {
    const [picked] = this.memberPicked(
      scope,
      write,
      holders.map((holder) => holder.owner),
    );
    return this.dataKeySlot(holders[picked!.index]!, `${write.shown}(${picked!.index})`);
  }

  /**
   * Lists the Data key of each owner a write names.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @returns One holder per owner.
   */
  protected dataHolders(scope: SolidScriptScope, write: SolidScriptMemberWrite): SolidScriptDataHolder[] {
    const name = this.dataKeyNamed(scope, write);
    const owner = this.fieldVariable(solidScriptNameKey(write.owner), scope);
    if (owner === undefined) throw new Error(`${write.owner} is not set`);
    const items = Array.isArray(owner) ? owner : [owner];
    return items.map((item) => this.dataHolderOf(item, name, write.owner));
  }

  /**
   * Reads one Data key of one element or Dictionary.
   *
   * @param item Element or Dictionary.
   * @param name Key as written.
   * @param shown Owner name, for messages.
   * @returns The holder.
   */
  private dataHolderOf(item: SolidScriptValue, name: string, shown: string): SolidScriptDataHolder {
    if (!(item instanceof SolidScriptElement))
      throw new Error(
        `only solids, faces, edges, corners and dictionaries have .Data; ${shown} is ${solidScriptKindNamed(item)}`,
      );
    const data = item.kind === 'data' ? item : this.elements.data(item);
    const key = solidScriptNameKey(name);
    const present = this.elements.dataHas(data, name);
    return {
      data,
      name,
      present,
      value: present ? this.elements.dataRead(data, key, name) : undefined,
      owner: item,
      shown,
    };
  }

  /**
   * Stops a line that needs a list, when the Data value is something else.
   *
   * @param shown Name for the message.
   * @param value Value that is not a list.
   */
  private dataListWrong(shown: string, value: SolidScriptValue): never {
    throw new Error(
      `[${shown}] is ${solidScriptKindNamed(value)}, not a list; Set it to a list first, such as 1, 2, 3`,
    );
  }

  /**
   * Stops a line that needs a list, when the Data key is not set.
   *
   * @param shown Name for the message.
   */
  private dataListMissing(shown: string): never {
    throw new Error(`there is no list [${shown}]; make one with Add Item or Set ${shown}()`);
  }

  /**
   * Stops a line that needs a Dictionary, when the Data value is something
   * else.
   *
   * @param shown Name for the message.
   * @param value Value that is not a Dictionary.
   */
  private dataDictionaryWrong(shown: string, value: SolidScriptValue): never {
    throw new Error(
      `[${shown}] is ${solidScriptKindNamed(value)}, not a Dictionary; make one with Make Dictionary Into ${shown}`,
    );
  }

  /**
   * Stops a line that needs a Dictionary, when the Data key is not set.
   *
   * @param shown Name for the message.
   */
  private dataDictionaryMissing(shown: string): never {
    throw new Error(`there is no Dictionary [${shown}]; make one with Make Dictionary or Add Entry`);
  }
}

/**
 * Gives a new empty value of the kind a value holds, for Clear Variable: an
 * empty list for a list or nothing, an empty Dictionary for a Dictionary, 0 for
 * a number, No for a Yes/No and empty text for anything else. Other names for
 * the old value keep it.
 *
 * @param old Value the variable holds, undefined when it is not set.
 * @returns Empty value.
 */
export function solidScriptValueEmpty(old: SolidScriptValue): SolidScriptValue {
  if (old === undefined || Array.isArray(old)) return [];
  if (old instanceof SolidScriptDictionary) return new SolidScriptDictionary();
  if (typeof old === 'number') return 0;
  return typeof old === 'boolean' ? false : '';
}
