import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../../core/constants";
import { regexReplace } from "./regex";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

export interface SplitInfo {
  dir: string;
  fusedModule: string | null;
}

export function readManifestText(dir: string): string | null {
  const manifestPath = path.join(dir, "AndroidManifest.xml");
  return fs.existsSync(manifestPath)
    ? fs.readFileSync(manifestPath, "utf-8")
    : null;
}

export function isFeatureSplitDir(dir: string): string | null {
  const text = readManifestText(dir);
  if (text === null) {
    return null;
  }
  if (/configForSplit="[^"]*"/.test(text)) {
    return null;
  }
  if (/isFeatureSplit="true"/.test(text)) {
    const m = text.match(/\ssplit="([^"]*)"/);
    return m ? m[1] : "";
  }
  return null;
}

export function isSplitDir(dir: string): boolean {
  const text = readManifestText(dir);
  if (text === null) {
    return false;
  }
  return (
    /configForSplit="[^"]*"/.test(text) ||
    /isFeatureSplit="true"/.test(text) ||
    /\ssplit="[^"]*"/.test(text)
  );
}

export function findBaseDir(dirs: string[]): string | null {
  for (const dir of dirs) {
    const text = readManifestText(dir);
    if (
      text !== null &&
      !/configForSplit="[^"]*"/.test(text) &&
      !/isFeatureSplit="true"/.test(text) &&
      !/\ssplit="[^"]*"/.test(text)
    ) {
      return dir;
    }
  }
  return null;
}

function deepMerge(target: Json, source: Json): void {
  for (const key of Object.keys(source)) {
    const targetValue = asObject(target[key]);
    const sourceValue = asObject(source[key]);
    if (targetValue !== null && sourceValue !== null) {
      deepMerge(targetValue, sourceValue);
    } else {
      target[key] = source[key];
    }
  }
}

function mergeJsonArrays(target: unknown, source: unknown[]): unknown[] {
  const base = Array.isArray(target) ? target : [];
  for (const item of source) {
    if (!base.some((x) => JSON.stringify(x) === JSON.stringify(item))) {
      base.push(item);
    }
  }
  return base;
}

export function mergeJsonFile(
  baseDir: string,
  splitDirs: string[],
  filename: string,
  skipKeys: string[] | null,
): void {
  const basePath = path.join(baseDir, filename);
  if (!fs.existsSync(basePath)) {
    return;
  }
  let base: Json;
  try {
    base = JSON.parse(fs.readFileSync(basePath, "utf-8")) as Json;
  } catch {
    return;
  }
  for (const splitDir of splitDirs) {
    const splitPath = path.join(splitDir, filename);
    if (!fs.existsSync(splitPath)) {
      continue;
    }
    let split: Json;
    try {
      split = JSON.parse(fs.readFileSync(splitPath, "utf-8")) as Json;
    } catch {
      continue;
    }
    for (const key of Object.keys(split)) {
      if (skipKeys !== null && skipKeys.includes(key)) {
        continue;
      }
      const sourceArray = Array.isArray(split[key])
        ? (split[key] as unknown[])
        : null;
      const targetObject = asObject(base[key]);
      const sourceObject = asObject(split[key]);
      if (sourceArray !== null) {
        base[key] = mergeJsonArrays(base[key], sourceArray);
      } else if (targetObject !== null && sourceObject !== null) {
        deepMerge(targetObject, sourceObject);
      } else {
        base[key] = split[key];
      }
    }
  }
  fs.writeFileSync(basePath, JSON.stringify(base, null, 2) + "\n", "utf-8");
}

export function mergeProjectJson(baseDir: string, splitDirs: string[]): void {
  mergeJsonFile(baseDir, splitDirs, "apktool.json", [
    "PackageInfo",
    "sdkInfo",
    "sharedLibrary",
    "isFrameworkApk",
  ]);
  mergeJsonFile(baseDir, splitDirs, "renamed.json", null);
}

export function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function md5(file: string): string {
  return createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

function elementKey(trimmedLine: string): string | null {
  const m = trimmedLine.match(/^<(\w+)[^>]*\bname="([^"]*)"/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function mergeValuesXml(dstPath: string, srcPath: string): void {
  const dstLines = fs.readFileSync(dstPath, "utf-8").split("\n");
  const srcLines = fs.readFileSync(srcPath, "utf-8").split("\n");
  const tagRe = /^<[^>]+(?<!\/)>$/;
  const dstKeys = new Set(
    dstLines
      .map((l) => elementKey(l.trim()))
      .filter((k): k is string => k !== null),
  );
  const out: string[] = [];
  for (const line of dstLines) {
    if (line.trim() === "</resources>") {
      let seenHeader = false;
      let inBlock = false;
      let skipBlock = false;
      for (const srcLine of srcLines) {
        const trimmed = srcLine.trim();
        if (trimmed === "<resources>") {
          seenHeader = true;
          continue;
        }
        if (trimmed === "</resources>") {
          break;
        }
        if (!seenHeader) {
          continue;
        }
        if (skipBlock) {
          if (trimmed.startsWith("</")) {
            skipBlock = false;
          }
          continue;
        }
        if (inBlock) {
          out.push(srcLine);
          if (trimmed.startsWith("</")) {
            inBlock = false;
          }
        } else {
          const key = elementKey(trimmed);
          if (key !== null && dstKeys.has(key)) {
            if (tagRe.test(trimmed) && !trimmed.startsWith("</")) {
              skipBlock = true;
            }
            continue;
          }
          inBlock = tagRe.test(trimmed) && !trimmed.startsWith("</");
          if (key !== null) {
            dstKeys.add(key);
          }
          out.push(srcLine);
        }
      }
    }
    out.push(line);
  }
  fs.writeFileSync(dstPath, out.join("\n"), "utf-8");
}

function copySplitEntry(srcFile: string, dstFile: string): void {
  if (!fs.existsSync(dstFile)) {
    fs.copyFileSync(srcFile, dstFile);
    return;
  }
  if (md5(srcFile) === md5(dstFile)) {
    return;
  }
  const parentName = path.basename(path.dirname(dstFile));
  if (
    parentName.startsWith("values") &&
    dstFile.endsWith(".xml") &&
    path.basename(dstFile) !== "public.xml"
  ) {
    mergeValuesXml(dstFile, srcFile);
  }
}

function copyDirMerge(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(s, d);
    } else {
      copySplitEntry(s, d);
    }
  }
}

export function copySplitDirs(
  baseDir: string,
  splitDirs: string[],
  copySignatures: boolean,
): void {
  for (const splitDir of splitDirs) {
    for (const entry of fs.readdirSync(splitDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "original") {
        continue;
      }
      copyDirMerge(
        path.join(splitDir, entry.name),
        path.join(baseDir, entry.name),
      );
    }
  }
  if (!copySignatures) {
    return;
  }
  const baseMeta = path.join(baseDir, "original", "META-INF");
  const baseHasSignature =
    fs.existsSync(baseMeta) &&
    fs.readdirSync(baseMeta).some((f) => /\.(RSA|DSA|EC)$/i.test(f));
  if (baseHasSignature) {
    return;
  }
  for (const splitDir of splitDirs) {
    const splitMeta = path.join(splitDir, "original", "META-INF");
    if (!fs.existsSync(splitMeta)) {
      continue;
    }
    const sigFile = fs
      .readdirSync(splitMeta)
      .find((f) => /\.(RSA|DSA|EC)$/i.test(f));
    if (sigFile) {
      fs.mkdirSync(baseMeta, { recursive: true });
      fs.copyFileSync(
        path.join(splitMeta, sigFile),
        path.join(baseMeta, sigFile),
      );
      break;
    }
  }
}

export function copyDexFiles(baseDir: string, splitDir: string): void {
  for (const dex of fs
    .readdirSync(splitDir)
    .filter((f) => /^classes\d*\.dex$/.test(f))) {
    let outName = dex;
    let n = 2;
    while (fs.existsSync(path.join(baseDir, outName))) {
      outName = `classes${n}.dex`;
      n++;
    }
    fs.copyFileSync(path.join(splitDir, dex), path.join(baseDir, outName));
  }
}

export function writeAntisplitMarker(
  baseDir: string,
  markerText: string,
): void {
  const unknownDir = path.join(baseDir, "unknown");
  fs.mkdirSync(unknownDir, { recursive: true });
  const markerName = "ANTISPLIT_BY_APKTOOL_M.txt";
  fs.writeFileSync(path.join(unknownDir, markerName), markerText, "utf-8");
  const jsonPath = path.join(baseDir, "apktool.json");
  let json: Json = {};
  if (fs.existsSync(jsonPath)) {
    try {
      json = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Json;
    } catch (err) {
      outputChannel.appendLine(`ReAPK: failed to read apktool.json: ${err}`);
    }
  }
  const unknownFiles = asObject(json.unknownFiles) ?? {};
  unknownFiles[markerName] = "8";
  json.unknownFiles = unknownFiles;
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf-8");
}

export function minSdkFromProject(baseDir: string): number {
  const jsonPath = path.join(baseDir, "apktool.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Json;
      const sdkInfo = asObject(json.sdkInfo);
      const v = sdkInfo?.minSdkVersion;
      if (typeof v === "string" || typeof v === "number") {
        return parseInt(String(v), 10);
      }
    } catch (err) {
      outputChannel.appendLine(`ReAPK: failed to read apktool.json: ${err}`);
    }
  }
  return 14;
}

export function setApkFileName(baseDir: string, apkFileName: string): void {
  const ymlPath = path.join(baseDir, "apktool.yml");
  if (fs.existsSync(ymlPath)) {
    const text = fs.readFileSync(ymlPath, "utf-8");
    fs.writeFileSync(
      ymlPath,
      regexReplace(text, "apkFileName: [^\\n]*", `apkFileName: ${apkFileName}`),
      "utf-8",
    );
  }
  const jsonPath = path.join(baseDir, "apktool.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Json;
      json.apkFileName = apkFileName;
      fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf-8");
    } catch (err) {
      outputChannel.appendLine(`ReAPK: failed to update apktool.json: ${err}`);
    }
  }
}
