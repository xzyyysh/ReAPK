import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../../core/constants";

export class ChangedIds {
  private entries = new Map<string, string[]>();

  constructor(file: string | null) {
    if (file !== null && fs.existsSync(file)) {
      try {
        const json = JSON.parse(fs.readFileSync(file, "utf-8"));
        for (const pkg of Object.keys(json)) {
          if (Array.isArray(json[pkg])) {
            this.entries.set(pkg, json[pkg]);
          }
        }
      } catch (err) {
        outputChannel.appendLine(
          `ReAPK: failed to read changed_ids.json: ${err}`,
        );
      }
    }
  }

  add(pkg: string, oldId: number, newId: number): void {
    const list = this.entries.get(pkg) ?? [];
    const formatted = `${hex8(oldId)} -> ${hex8(newId)}`;
    const prefix = `${hex8(oldId)} -> `;
    const idx = list.findIndex((x) => x.startsWith(prefix));
    if (idx >= 0) {
      if (!list.includes(formatted)) {
        list[idx] = formatted;
      }
    } else {
      list.push(formatted);
    }
    this.entries.set(pkg, list);
  }

  lookup(pkg: string): Map<number, number> {
    const map = new Map<number, number>();
    for (const entry of this.entries.get(pkg) ?? []) {
      const m = entry.match(/^([0-9a-f]{8}) -> ([0-9a-f]{8})$/);
      if (m) {
        map.set(parseInt(m[1], 16), parseInt(m[2], 16));
      }
    }
    return map;
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  save(file: string): void {
    const json: Record<string, string[]> = {};
    for (const pkg of [...this.entries.keys()].sort()) {
      json[pkg] = this.entries.get(pkg) as string[];
    }
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf-8");
  }
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, "0");
}

const INSN_SIZES: number[] = buildInsnSizes();

function buildInsnSizes(): number[] {
  const sizes = new Array(0x100).fill(1);
  for (const op of [
    0x02, 0x05, 0x08, 0x0b, 0x0c, 0x0d, 0x13, 0x15, 0x16, 0x19, 0x1a, 0x1c,
    0x1f, 0x20, 0x22, 0x23,
  ]) {
    sizes[op] = 2;
  }
  for (const op of [0x14, 0x17, 0x1b, 0x24, 0x25, 0x26, 0x2a, 0x2b, 0x2c]) {
    sizes[op] = 3;
  }
  sizes[0x18] = 5;
  for (let op = 0x2d; op <= 0x3d; op++) {
    sizes[op] = 2;
  }
  for (let op = 0x44; op <= 0x6d; op++) {
    sizes[op] = 2;
  }
  for (let op = 0x6e; op <= 0x72; op++) {
    sizes[op] = 3;
  }
  for (let op = 0x74; op <= 0x78; op++) {
    sizes[op] = 3;
  }
  for (let op = 0x90; op <= 0xaf; op++) {
    sizes[op] = 2;
  }
  for (let op = 0xd0; op <= 0xd7; op++) {
    sizes[op] = 2;
  }
  for (let op = 0xd8; op <= 0xe2; op++) {
    sizes[op] = 2;
  }
  sizes[0xfa] = 4;
  sizes[0xfb] = 4;
  sizes[0xfc] = 3;
  sizes[0xfd] = 3;
  sizes[0xfe] = 3;
  sizes[0xff] = 3;
  return sizes;
}

function readUInt(buf: Buffer, off: number, width: number): number {
  let result = 0;
  for (let i = width - 1; i >= 0; i--) {
    result = result * 256 + buf[off + i];
  }
  return result;
}

function writeUInt(
  buf: Buffer,
  off: number,
  width: number,
  value: number,
): void {
  let v = value;
  for (let i = 0; i < width; i++) {
    buf[off + i] = v & 0xff;
    v = Math.floor(v / 256);
  }
}

function readSleb128(
  buf: Buffer,
  off: number,
): { value: number; length: number } {
  let result = 0;
  let shift = 0;
  let count = 0;
  let byte: number;
  do {
    byte = buf[off + count];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    count++;
  } while (byte & 0x80);
  if (shift < 32 && byte & 0x40) {
    result |= -(1 << shift);
  }
  return { value: result, length: count };
}

function readUleb128(
  buf: Buffer,
  off: number,
): { value: number; length: number } {
  let result = 0;
  let shift = 0;
  let count = 0;
  let byte: number;
  do {
    byte = buf[off + count];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    count++;
  } while (byte & 0x80);
  return { value: result, length: count };
}

export function patchDexFile(
  dexPath: string,
  changedIds: Map<number, number>,
): { replaced: number; skipped: number } {
  if (changedIds.size === 0) {
    return { replaced: 0, skipped: 0 };
  }
  const buf = fs.readFileSync(dexPath);
  const mapOff = readUInt(buf, 0x34, 4);
  if (mapOff === 0 || mapOff + 4 > buf.length) {
    return { replaced: 0, skipped: 0 };
  }
  const mapSize = readUInt(buf, mapOff, 4);
  let codeItemOff = 0;
  let codeItemCount = 0;
  for (let i = 0; i < mapSize; i++) {
    const entryOff = mapOff + 4 + i * 12;
    if (entryOff + 12 > buf.length) {
      break;
    }
    const type = readUInt(buf, entryOff, 2);
    if (type === 0x2001) {
      codeItemCount = readUInt(buf, entryOff + 8, 4);
      codeItemOff = readUInt(buf, entryOff + 4, 4);
      break;
    }
  }
  if (codeItemOff === 0) {
    return { replaced: 0, skipped: 0 };
  }
  let replaced = 0;
  let skipped = 0;
  let off = codeItemOff;
  for (let i = 0; i < codeItemCount && off + 16 <= buf.length; i++) {
    const insnsSize = readUInt(buf, off + 12, 4);
    const r = patchInsns(buf, off + 16, insnsSize, changedIds);
    replaced += r.replaced;
    skipped += r.skipped;
    let p = off + 16 + insnsSize * 2;
    if (p % 4 !== 0) {
      p += 2;
    }
    const triesSize = readUInt(buf, off + 6, 2);
    if (triesSize > 0 && p + triesSize * 8 + 4 <= buf.length) {
      p += triesSize * 8;
      const handlerCount = readUInt(buf, p, 4);
      p += 4;
      for (let h = 0; h < handlerCount && p < buf.length; h++) {
        const sz = readSleb128(buf, p);
        p += sz.length;
        p += Math.abs(sz.value) * 4;
        if (sz.value <= 0 && p < buf.length) {
          const catchAll = readUleb128(buf, p);
          p += catchAll.length;
        }
      }
    }
    off = p;
  }
  if (replaced + skipped > 0) {
    fs.writeFileSync(dexPath, buf);
  }
  return { replaced, skipped };
}

function patchInsns(
  buf: Buffer,
  insnsOff: number,
  insnsSize: number,
  changedIds: Map<number, number>,
): { replaced: number; skipped: number } {
  let replaced = 0;
  let skipped = 0;
  let off = 0;
  while (off < insnsSize) {
    if (insnsOff + (off + 8) * 2 > buf.length) {
      break;
    }
    const op = buf[insnsOff + off * 2];
    if (op === 0x00) {
      const subOp = buf[insnsOff + off * 2 + 1];
      if (subOp === 0x01 && off + 2 < insnsSize) {
        const size = readUInt(buf, insnsOff + (off + 1) * 2, 2);
        if (off + 4 + size * 2 <= insnsSize) {
          const firstKey = buf.readInt32LE(insnsOff + (off + 2) * 2);
          if (changedIds.has(firstKey >>> 0)) {
            buf.writeInt32LE(
              changedIds.get(firstKey >>> 0) as number,
              insnsOff + (off + 2) * 2,
            );
            replaced++;
          }
          off += 4 + size * 2;
          continue;
        }
        break;
      }
      if (subOp === 0x02 && off + 1 < insnsSize) {
        const size = readUInt(buf, insnsOff + (off + 1) * 2, 2);
        if (off + 2 + size * 4 <= insnsSize) {
          for (let i = 0; i < size; i++) {
            const key = buf.readInt32LE(insnsOff + (off + 2 + i * 2) * 2);
            if (changedIds.has(key >>> 0)) {
              buf.writeInt32LE(
                changedIds.get(key >>> 0) as number,
                insnsOff + (off + 2 + i * 2) * 2,
              );
              replaced++;
            }
          }
          off += 2 + size * 4;
          continue;
        }
        break;
      }
      if (subOp === 0x03 && off + 3 < insnsSize) {
        const elementWidth = readUInt(buf, insnsOff + (off + 1) * 2, 2);
        const size = readUInt(buf, insnsOff + (off + 2) * 2, 4);
        const total = 4 + Math.ceil((size * elementWidth) / 2);
        if (off + total > insnsSize) {
          break;
        }
        if (elementWidth === 4) {
          for (let i = 0; i < size; i++) {
            const value = buf.readInt32LE(insnsOff + (off + 4 + i * 2) * 2);
            if (changedIds.has(value >>> 0)) {
              buf.writeInt32LE(
                changedIds.get(value >>> 0) as number,
                insnsOff + (off + 4 + i * 2) * 2,
              );
              replaced++;
            }
          }
        } else if (elementWidth === 8) {
          for (let i = 0; i < size; i++) {
            const value = readUInt(buf, insnsOff + (off + 4 + i * 4) * 2, 8);
            if (value < 2 ** 32 && changedIds.has(value >>> 0)) {
              writeUInt(
                buf,
                insnsOff + (off + 4 + i * 4) * 2,
                8,
                changedIds.get(value >>> 0) as number,
              );
              replaced++;
            }
          }
        }
        off += total;
        continue;
      }
      off += 1;
      continue;
    }
    const size = INSN_SIZES[op];
    if (size === undefined) {
      break;
    }
    if (off + size > insnsSize) {
      break;
    }
    if (op === 0x14) {
      const value = buf.readInt32LE(insnsOff + (off + 1) * 2);
      if (changedIds.has(value >>> 0)) {
        buf.writeInt32LE(
          changedIds.get(value >>> 0) as number,
          insnsOff + (off + 1) * 2,
        );
        replaced++;
      }
    } else if (op === 0x15) {
      const value =
        ((readUInt(buf, insnsOff + (off + 1) * 2, 2) << 16) >>> 0) >>> 0;
      if (changedIds.has(value)) {
        const newId = changedIds.get(value) as number;
        if ((newId & 0xffff) === 0) {
          writeUInt(buf, insnsOff + (off + 1) * 2, 2, (newId >>> 16) & 0xffff);
          replaced++;
        } else {
          skipped++;
        }
      }
    } else if (op === 0x18) {
      const value = readUInt(buf, insnsOff + (off + 1) * 2, 8);
      if (value < 2 ** 32 && changedIds.has(value >>> 0)) {
        writeUInt(
          buf,
          insnsOff + (off + 1) * 2,
          8,
          changedIds.get(value >>> 0) as number,
        );
        replaced++;
      }
    }
    off += size;
  }
  return { replaced, skipped };
}

export function patchProjectDexes(
  projectDir: string,
  changedIds: Map<number, number>,
): { replaced: number; skipped: number } {
  let replaced = 0;
  let skipped = 0;
  for (const entry of fs.readdirSync(projectDir)) {
    if (/^classes\d*\.dex$/.test(entry)) {
      const r = patchDexFile(path.join(projectDir, entry), changedIds);
      replaced += r.replaced;
      skipped += r.skipped;
    }
  }
  return { replaced, skipped };
}
