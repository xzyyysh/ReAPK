import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../../core/constants";
import { clearSplitMarker, cleanManifest, findSplitsXmlName } from "./manifest";
import { ChangedIds, patchProjectDexes } from "./dex-ids";
import {
  copyDexFiles,
  copySplitDirs,
  findBaseDir,
  isSplitDir,
  mergeProjectJson,
  setApkFileName,
  writeAntisplitMarker,
} from "./project";
import {
  DUMMY_PREFIX,
  PublicItem,
  mergePublicItems,
  parsePublicXml,
  resolveConflicts,
  writePublicXml,
} from "./public-item";
import {
  fixAttrValues,
  fixStyleItems,
  nullifyUnresolvableDummies,
  parseAttrsXml,
  replaceDummyItems,
  replaceDummyName,
  replaceUnknownTypeDummies,
  stripFalseDummyItems,
} from "./dummy";
import { decryptApkm, isApkmEncrypted } from "./apkm";
import { decodeSources } from "./sources";

export interface AntisplitOptions {
  decodeSources: boolean;
  removeProperties: boolean;
  fixDexIds: boolean;
  apktoolArgs: string[];
}

const MARKER_TEXT = [
  "~".repeat(126),
  "",
  "PLEASE, DO NOT DELETE THIS FILE!!!",
  "",
  "This apk is compiled from split APKs using ReAPK.",
  "",
  "~".repeat(126),
  "",
].join("\n");

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function collectXmlFiles(dir: string): string[] {
  const files: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith(".xml")) {
        files.push(full);
      }
    }
  }
  return files;
}

function processXmlFile(
  filePath: string,
  dirHash: number,
  items: PublicItem[],
  attrMap: Map<string, { name: string; values: Map<number, string> }>,
  isBase: boolean,
  isManifest: boolean,
): void {
  let text = fs.readFileSync(filePath, "utf-8");
  if (text.indexOf(DUMMY_PREFIX) < 0) {
    return;
  }
  if (!isManifest) {
    text = stripFalseDummyItems(text);
    const hasDummyIds = text.indexOf(`${DUMMY_PREFIX}0x`) >= 0;
    text = replaceDummyItems(text, items, dirHash, hasDummyIds);
    text = replaceUnknownTypeDummies(text, items);
    text = nullifyUnresolvableDummies(text);
    if (!isBase) {
      const parentName = path.basename(path.dirname(filePath));
      if (parentName.startsWith("values")) {
        if (path.basename(filePath) === "styles.xml") {
          text = fixStyleItems(text, attrMap);
        }
      } else {
        text = fixAttrValues(text, attrMap);
      }
    }
  } else {
    for (const item of items) {
      if (item.altName !== null) {
        text = replaceDummyName(text, item.type, item.name, item.altName);
      }
    }
    text = replaceUnknownTypeDummies(text, items);
    text = nullifyUnresolvableDummies(text);
  }
  fs.writeFileSync(filePath, text, "utf-8");
}

function packageNameOf(dir: string): string {
  const manifestPath = path.join(dir, "AndroidManifest.xml");
  if (fs.existsSync(manifestPath)) {
    const text = fs.readFileSync(manifestPath, "utf-8");
    const m = text.match(/\spackage="([^"]+)"/);
    if (m) {
      return m[1];
    }
  }
  return "";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export async function decodeBundleFn(
  bundlePath: string,
  options: AntisplitOptions,
): Promise<string | undefined> {
  const bundleDir = path.dirname(bundlePath);
  const bundleName = path.basename(bundlePath, path.extname(bundlePath));
  const ext = path.extname(bundlePath).toLowerCase();
  let apksPath = bundlePath;
  let decryptSucceeded = false;
  if (ext === ".apkm" && isApkmEncrypted(bundlePath)) {
    apksPath = path.join(bundleDir, `${bundleName}.apks`);
    try {
      await decryptApkm(bundlePath, apksPath);
      decryptSucceeded = true;
    } catch (err) {
      outputChannel.appendLine(
        `ReAPK: apkkm decryption failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }
  const extractDir = path.join(bundleDir, `${bundleName}.reapk-extract`);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(apksPath);
    const apkFiles: string[] = [];
    for (const entry of zip.getEntries()) {
      if (
        !entry.isDirectory &&
        entry.entryName.toLowerCase().endsWith(".apk") &&
        !entry.entryName.toLowerCase().startsWith("instant/")
      ) {
        const target = path.join(extractDir, path.basename(entry.entryName));
        fs.writeFileSync(target, entry.getData());
        apkFiles.push(target);
      }
    }
    if (apkFiles.length === 0) {
      outputChannel.appendLine("ReAPK: no APK entries found in the bundle");
      return undefined;
    }
    const decodedDirs: string[] = [];
    const frameDir = path.join(extractDir, "framework");
    for (const apkFile of apkFiles) {
      const outDir = path.join(extractDir, path.basename(apkFile, ".apk"));
      const filtered = options.apktoolArgs.filter(
        (a) => a !== "--no-res" && a !== "-r" && a !== "--no-src" && a !== "-s",
      );
      filtered.push("-s");
      filtered.push("-p", frameDir);
      const { apktool } = await import("../apktool");
      await apktool.decodeAPK(apkFile, outDir, filtered);
      if (!fs.existsSync(path.join(outDir, "AndroidManifest.xml"))) {
        outputChannel.appendLine(
          `ReAPK: decode failed for ${path.basename(apkFile)}`,
        );
        return undefined;
      }
      if (!isSplitDir(outDir)) {
        await apktool.installFramework(apkFile, frameDir);
      }
      decodedDirs.push(outDir);
    }
    const baseDir = findBaseDir(decodedDirs);
    if (baseDir === null) {
      outputChannel.appendLine(
        "ReAPK: could not identify the base APK in the bundle",
      );
      return undefined;
    }
    const splitDirs = decodedDirs.filter((d) => d !== baseDir && isSplitDir(d));
    mergeProjectJson(baseDir, splitDirs);
    for (const splitDir of splitDirs) {
      copyDexFiles(baseDir, splitDir);
    }
    const items: PublicItem[] = parsePublicXml(
      path.join(baseDir, "res", "values", "public.xml"),
      hashCode(baseDir),
    );
    for (const splitDir of splitDirs) {
      const splitItems = parsePublicXml(
        path.join(splitDir, "res", "values", "public.xml"),
        hashCode(splitDir),
      );
      const merged = mergePublicItems(items, splitItems, null, false);
      items.length = 0;
      items.push(...merged);
    }
    const changedIds = new ChangedIds(null);
    const resolved = resolveConflicts(items);
    items.length = 0;
    items.push(...resolved.items);
    for (const [oldId, newId] of resolved.changed) {
      changedIds.add(packageNameOf(baseDir), oldId, newId);
    }
    const attrMap = parseAttrsXml(
      path.join(baseDir, "res", "values", "attrs.xml"),
    );
    for (const dir of [baseDir, ...splitDirs]) {
      const resDir = path.join(dir, "res");
      if (fs.existsSync(resDir)) {
        for (const file of collectXmlFiles(resDir)) {
          processXmlFile(
            file,
            hashCode(dir),
            items,
            attrMap,
            dir === baseDir,
            false,
          );
        }
      }
      const manifestPath = path.join(dir, "AndroidManifest.xml");
      if (fs.existsSync(manifestPath)) {
        processXmlFile(
          manifestPath,
          hashCode(dir),
          items,
          attrMap,
          dir === baseDir,
          true,
        );
      }
    }
    const splitsXmlName = findSplitsXmlName(
      path.join(baseDir, "AndroidManifest.xml"),
    );
    if (splitsXmlName !== null) {
      clearSplitMarker(baseDir);
    }
    const localeName = cleanManifest(
      path.join(baseDir, "AndroidManifest.xml"),
      {
        injectStamps: true,
        removeProperties: options.removeProperties,
      },
    );
    if (localeName !== null) {
      const localeXml = path.join(baseDir, "res", "xml", `${localeName}.xml`);
      if (fs.existsSync(localeXml)) {
        fs.rmSync(localeXml);
      }
    }
    writePublicXml(
      path.join(baseDir, "res", "values", "public.xml"),
      items,
      false,
      splitsXmlName,
      localeName,
    );
    writeAntisplitMarker(baseDir, MARKER_TEXT);
    if (options.fixDexIds && !changedIds.isEmpty()) {
      changedIds.save(path.join(baseDir, "changed_ids.json"));
      const result = patchProjectDexes(
        baseDir,
        changedIds.lookup(packageNameOf(baseDir)),
      );
      outputChannel.appendLine(
        `ReAPK: patched ${result.replaced} resource id references in dex files, ${result.skipped} skipped`,
      );
    }
    copySplitDirs(baseDir, splitDirs, true);
    if (options.decodeSources) {
      await decodeSources(
        baseDir,
        frameDir,
        decodedDirs.map((decodedDir) => ({
          apkPath: path.join(extractDir, `${path.basename(decodedDir)}.apk`),
          decodedDir,
        })),
      );
    }
    const now = new Date();
    const outName = `out_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_src`;
    let finalDir = path.join(bundleDir, outName);
    let n = 2;
    while (fs.existsSync(finalDir)) {
      finalDir = path.join(bundleDir, `${outName}_${n}`);
      n++;
    }
    setApkFileName(baseDir, `${path.basename(finalDir)}.apk`);
    fs.renameSync(baseDir, finalDir);
    if (decryptSucceeded) {
      fs.rmSync(apksPath);
    }
    return finalDir;
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

export namespace antisplit {
  export const decodeBundle = decodeBundleFn;
}
