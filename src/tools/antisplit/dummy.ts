import * as fs from "fs";
import { DUMMY_ID_PREFIX, PublicItem } from "./public-item";

function replaceAll(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

export function resolveAndroidPrefix(text: string): string {
  const m = text.match(
    /\sxmlns:(\w+)="http:\/\/schemas\.android\.com\/apk\/res\/android"/,
  );
  return m ? m[1] : "android";
}

export function stripFalseDummyItems(text: string): string {
  return text.replace(
    /\s+<item[^>]+name="APKTOOL_DUMMY_[^"]+">false<\/item>/g,
    "",
  );
}

export function replaceDummyName(
  text: string,
  type: string,
  newName: string,
  oldName: string,
): string {
  let out = replaceAll(
    text,
    `type="${type}" name="${oldName}"`,
    `type="${type}" name="${newName}"`,
  );
  out = replaceAll(
    out,
    `${type} name="${oldName}"`,
    `${type} name="${newName}"`,
  );
  out = replaceAll(out, `"@${type}/${oldName}"`, `"@${type}/${newName}"`);
  out = replaceAll(out, `>@${type}/${oldName}<`, `>@${type}/${newName}<`);
  out = replaceAll(out, `<item name="${oldName}"`, `<item name="${newName}"`);
  out = replaceAll(out, `@unktype/${oldName}`, `@${type}/${newName}`);
  if (oldName.startsWith(DUMMY_ID_PREFIX)) {
    out = out.replace(
      new RegExp(`@([^\\s/]+/)?${oldName}"`, "g"),
      `@$1${newName}"`,
    );
  }
  if (type === "attr") {
    out = replaceAll(out, `"?${oldName}"`, `"?${newName}"`);
    out = replaceAll(out, `>?${oldName}<`, `>?${newName}<`);
  }
  if (type === "id") {
    out = replaceAll(out, `>${oldName}<`, `>${newName}<`);
  }
  return out;
}

export function replaceUnknownTypeDummies(
  text: string,
  items: PublicItem[],
): string {
  return text.replace(
    /@unktype\/APKTOOL_DUMMY_([A-Fa-f0-9]+)/g,
    (match, hex: string) => {
      const id = parseInt(hex, 16);
      const item = items.find((x) => x.numericId === id);
      return item ? `@${item.type}/${item.name}` : match;
    },
  );
}

export function replaceDummyItems(
  text: string,
  items: PublicItem[],
  dirHash: number,
  byId: boolean,
): string {
  let out = text;
  for (const item of items) {
    if (item.isDummy || item.owner === dirHash) {
      continue;
    }
    if (item.altName !== null) {
      out = replaceDummyName(out, item.type, item.name, item.altName);
    }
    if (byId) {
      out = replaceDummyName(
        out,
        item.type,
        item.name,
        DUMMY_ID_PREFIX + item.id.slice(2),
      );
    }
  }
  return out;
}

export function nullifyUnresolvableDummies(text: string): string {
  let out = text.replace(/@[^\s/]+\/APKTOOL_DUMMY_[\w\d]+/g, "@null");
  out = out.replace(/ parent="@null"/g, "");
  return out;
}

function convertAttrValue(
  attr: { values: Map<number, string> },
  value: string,
): string | null {
  let radix = 10;
  let sign = 1;
  let v = value;
  try {
    if (v.startsWith("0x")) {
      v = v.slice(2);
      radix = 16;
    } else if (v.startsWith("-0x")) {
      v = v.slice(3);
      radix = 16;
      sign = -1;
    }
    return attr.values.get(sign * parseInt(v, radix)) ?? null;
  } catch {
    return null;
  }
}

export function fixAttrValues(
  text: string,
  map: Map<string, EnumOrFlagAttr>,
): string {
  if (!map.size) {
    return text;
  }
  const names = [...map.keys()].join("|");
  return text.replace(
    new RegExp(`([^\\s]+:)?(${names})="([^"]+)"`, "g"),
    (match, prefix: string | undefined, name: string, value: string) => {
      const attr = map.get(name);
      if (!attr) {
        return match;
      }
      const converted = convertAttrValue(attr, value);
      if (converted === null) {
        return match;
      }
      return `${prefix ?? ""}${name}="${converted}"`;
    },
  );
}

export function fixStyleItems(
  text: string,
  map: Map<string, EnumOrFlagAttr>,
): string {
  if (!map.size) {
    return text;
  }
  const names = [...map.keys()].join("|");
  return text.replace(
    new RegExp(`<item name="([^"]+:)?(${names})">([^<]+)</item>`, "g"),
    (match, prefix: string | undefined, name: string, value: string) => {
      const attr = map.get(name);
      if (!attr) {
        return match;
      }
      const converted = convertAttrValue(attr, value);
      if (converted === null) {
        return match;
      }
      return `<item name="${prefix ?? ""}${name}">${converted}</item>`;
    },
  );
}

export interface EnumOrFlagAttr {
  name: string;
  values: Map<number, string>;
}

export function parseAttrsXml(file: string): Map<string, EnumOrFlagAttr> {
  const map = new Map<string, EnumOrFlagAttr>();
  if (!file || !fs.existsSync(file)) {
    return map;
  }
  const text = fs.readFileSync(file, "utf-8");
  const attrRe = /<attr\s+name="([^"]+)"[^>]*?(\/>|>([\s\S]*?)<\/attr>)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(text)) !== null) {
    if (m[2] === "/>") {
      continue;
    }
    const values = new Map<number, string>();
    const childRe = /<(enum|flag)\s+name="([^"]+)"\s+value="([^"]+)"[^>]*\/>/g;
    let c: RegExpExecArray | null;
    while ((c = childRe.exec(m[3])) !== null) {
      let radix = 10;
      let v = c[3];
      if (v.startsWith("0x")) {
        v = v.slice(2);
        radix = 16;
      }
      const n = parseInt(v, radix);
      if (!isNaN(n)) {
        values.set(n, c[2]);
      }
    }
    if (values.size) {
      map.set(m[1], { name: m[1], values });
    }
  }
  return map;
}
