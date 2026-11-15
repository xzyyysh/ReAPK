import * as fs from "fs";

export const DUMMY_PREFIX = "APKTOOL_DUMMY_";
export const DUMMY_ID_PREFIX = DUMMY_PREFIX + "0x";

export class PublicItem {
  public altName: string | null;
  public prevId: string | null = null;

  constructor(
    public type: string,
    public name: string,
    public id: string,
    public owner: number,
  ) {
    this.altName = name.startsWith(DUMMY_PREFIX) ? name : null;
  }

  get isDummy(): boolean {
    return this.name.startsWith(DUMMY_PREFIX);
  }

  get numericId(): number {
    return parseInt(this.id, 16);
  }

  get packageByte(): number {
    return (this.numericId >>> 24) & 0xff;
  }

  get typeByte(): number {
    return (this.numericId >>> 16) & 0xff;
  }

  toString(): string {
    return `<public type="${this.type}" name="${this.name}" id="${this.id}" />`;
  }
}

export function parsePublicXml(file: string, owner: number): PublicItem[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const items: PublicItem[] = [];
  const lineRe = /<public\s+type="([^"]*)"\s+name="([^"]*)"\s+id="([^"]*)"/g;
  const text = fs.readFileSync(file, "utf-8");
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    items.push(new PublicItem(m[1], m[2], m[3], owner));
  }
  return items;
}

export function findSameId(items: PublicItem[], item: PublicItem): number {
  return items.findIndex((x) => x.numericId === item.numericId);
}

export function findByName(
  items: PublicItem[],
  type: string,
  name: string,
): number {
  return items.findIndex((x) => x.type === type && x.name === name);
}

export function mergePublicItems(
  base: PublicItem[],
  split: PublicItem[],
  changedIds: Map<number, number> | null,
  includeAllPackages: boolean,
): PublicItem[] {
  const result: PublicItem[] = [];
  for (const baseItem of base) {
    const idx = findSameId(split, baseItem);
    if (idx < 0) {
      result.push(baseItem);
      continue;
    }
    const splitItem = split[idx];
    if (changedIds && changedIds.has(splitItem.numericId)) {
      result.push(baseItem);
    } else if (splitItem.isDummy) {
      splitItem.owner = baseItem.owner;
      splitItem.name = baseItem.name;
      result.push(splitItem);
    } else {
      splitItem.altName = baseItem.altName;
      result.push(splitItem);
    }
  }
  let pkg = result.length ? result[0].packageByte : 127;
  if (pkg === 0) {
    pkg = 127;
  }
  for (const splitItem of split) {
    if (
      (includeAllPackages || splitItem.packageByte === pkg) &&
      findSameId(result, splitItem) < 0
    ) {
      result.push(splitItem);
    }
  }
  return result;
}

export function resolveConflicts(items: PublicItem[]): {
  items: PublicItem[];
  changed: Map<number, number>;
} {
  const seenNames = new Set<string>();
  const deduped: PublicItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.name}`;
    if (seenNames.has(key)) {
      continue;
    }
    seenNames.add(key);
    deduped.push(item);
  }
  const changed = new Map<number, number>();
  const usedIds = new Set<number>();
  for (const item of deduped) {
    if (item.isDummy) {
      usedIds.add(item.numericId);
      continue;
    }
    if (usedIds.has(item.numericId)) {
      const typeId = (item.numericId & 0xffff0000) >>> 0;
      let entry = 1;
      while (entry <= 0xffff && usedIds.has((typeId | entry) >>> 0)) {
        entry++;
      }
      if (entry <= 0xffff) {
        const oldId = item.numericId;
        item.prevId = item.id;
        item.id = `0x${((typeId | entry) >>> 0).toString(16).padStart(8, "0")}`;
        changed.set(oldId, item.numericId);
      }
    }
    usedIds.add(item.numericId);
  }
  return { items: deduped, changed };
}

export function writePublicXml(
  file: string,
  items: PublicItem[],
  includeDummies: boolean,
  excludeA: string | null,
  excludeB: string | null,
): void {
  const sorted = [...items].sort((a, b) =>
    a.type === b.type
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.type < b.type
        ? -1
        : 1,
  );
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?><resources>'];
  for (const item of sorted) {
    if (!includeDummies && item.isDummy) {
      continue;
    }
    if (excludeA !== null && item.type === "xml" && item.name === excludeA) {
      continue;
    }
    if (excludeB !== null && item.type === "xml" && item.name === excludeB) {
      continue;
    }
    lines.push("\t" + item.toString());
  }
  lines.push("</resources>");
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf-8");
}
