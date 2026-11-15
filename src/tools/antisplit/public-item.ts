import * as fs from "fs";

export const DUMMY_PREFIX = "APKTOOL_DUMMY_";
export const DUMMY_ID_PREFIX = DUMMY_PREFIX + "0x";

export class PublicItem {
  public altName: string | null;

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

export function renumberConflicts(items: PublicItem[]): Map<number, number> {
  const changed = new Map<number, number>();
  const seen = new Set<string>();
  for (const item of items) {
    if (item.isDummy) {
      continue;
    }
    const key = `${item.type}:${item.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    const typeId = (item.numericId & 0xffff0000) >>> 0;
    const usedIds = new Set(items.map((x) => x.numericId));
    let entry = 1;
    while (entry <= 0xffff && usedIds.has((typeId | entry) >>> 0)) {
      entry++;
    }
    if (entry > 0xffff) {
      continue;
    }
    const oldId = item.numericId;
    item.id = `0x${((typeId | entry) >>> 0).toString(16).padStart(8, "0")}`;
    usedIds.add(item.numericId);
    changed.set(oldId, item.numericId);
  }
  return changed;
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
