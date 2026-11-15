import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../../core/constants";
import { apktool } from "../apktool";

function listSmaliDirs(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name === "smali" || /^smali_classes\d+$/.test(name))
    .sort((a, b) => smaliIndex(a) - smaliIndex(b));
}

function smaliIndex(name: string): number {
  return name === "smali"
    ? 1
    : parseInt(name.slice("smali_classes".length), 10);
}

function smaliDirName(index: number): string {
  return index === 1 ? "smali" : `smali_classes${index}`;
}

export async function decodeSources(
  baseDir: string,
  frameDir: string,
  apkEntries: { apkPath: string; decodedDir: string }[],
): Promise<void> {
  let offset = 0;
  for (const entry of apkEntries) {
    const tempDir = `${entry.decodedDir}-sources`;
    fs.rmSync(tempDir, { recursive: true, force: true });
    await apktool.decodeAPK(entry.apkPath, tempDir, [
      "-r",
      "-f",
      "-p",
      frameDir,
    ]);
    const smaliDirs = listSmaliDirs(tempDir);
    if (smaliDirs.length === 0) {
      outputChannel.appendLine(
        `ReAPK: source decode produced no smali for ${path.basename(entry.apkPath)}`,
      );
      fs.rmSync(tempDir, { recursive: true, force: true });
      continue;
    }
    for (let i = 0; i < smaliDirs.length; i++) {
      const targetName = smaliDirName(offset + i + 1);
      const target = path.join(baseDir, targetName);
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(path.join(tempDir, smaliDirs[i]), target);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    offset += smaliDirs.length;
  }
  for (const dex of fs
    .readdirSync(baseDir)
    .filter((f) => /^classes\d*\.dex$/.test(f))) {
    fs.rmSync(path.join(baseDir, dex));
  }
}
