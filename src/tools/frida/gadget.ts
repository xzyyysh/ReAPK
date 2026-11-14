import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { outputChannel } from "../../core/constants";
import { findMainActivity } from "../manifest";
import { FRIDA_HOOKS_FILENAME } from "./hooks";

export const GADGET_INJECT_MARKER = "# reapk-gadget-inject";

export async function injectGadget(apktoolYmlUri: vscode.Uri): Promise<void> {
  const projectDir = path.dirname(apktoolYmlUri.fsPath);
  const gadgetFiles = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Select Frida Gadget .so",
    filters: { "Shared Library": ["so"] },
  });
  if (!gadgetFiles || gadgetFiles.length === 0) return;
  const gadgetSoPath = gadgetFiles[0].fsPath;
  const detectedArch = detectArch(gadgetSoPath);
  const archOptions = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"];
  if (detectedArch && archOptions.includes(detectedArch)) {
    archOptions.splice(archOptions.indexOf(detectedArch), 1);
    archOptions.unshift(detectedArch);
  }
  const selectedArch = await vscode.window.showQuickPick(archOptions, {
    placeHolder: detectedArch
      ? `Detected: ${detectedArch} — confirm or pick another`
      : "Select target architecture",
    canPickMany: false,
  });
  if (!selectedArch) return;
  const manifestPath = path.join(projectDir, "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) {
    vscode.window.showErrorMessage(
      "ReAPK: AndroidManifest.xml not found in project.",
    );
    return;
  }
  const mainActivityClass = findMainActivity(manifestPath);
  if (!mainActivityClass) {
    vscode.window.showErrorMessage(
      "ReAPK: Could not find main/launcher activity in AndroidManifest.xml.",
    );
    return;
  }
  outputChannel.appendLine(
    `Frida Gadget: Main activity is ${mainActivityClass}`,
  );
  const gadgetBaseName = generateGadgetName();
  const libName = `lib${gadgetBaseName}.so`;
  const libDir = path.join(projectDir, "lib", selectedArch);
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  const gadgetDest = path.join(libDir, libName);
  fs.copyFileSync(gadgetSoPath, gadgetDest);
  outputChannel.appendLine(`Frida Gadget: Copied to ${gadgetDest}`);
  const configName = `lib${gadgetBaseName}.config.so`;
  const hooksFile = path.join(projectDir, FRIDA_HOOKS_FILENAME);
  const hasHooks = fs.existsSync(hooksFile);
  const scriptName = `lib${gadgetBaseName}.js.so`;
  const gadgetConfig = {
    interaction: {
      type: hasHooks ? "script" : "listen",
      ...(hasHooks
        ? { path: `./${scriptName}` }
        : { address: "0.0.0.0", port: 27042 }),
    },
  };
  const configDest = path.join(libDir, configName);
  fs.writeFileSync(configDest, JSON.stringify(gadgetConfig, null, 2) + "\n");
  outputChannel.appendLine(`Frida Gadget: Config written to ${configDest}`);
  if (hasHooks) {
    const scriptDest = path.join(libDir, scriptName);
    fs.copyFileSync(hooksFile, scriptDest);
    outputChannel.appendLine(`Frida Gadget: Script copied to ${scriptDest}`);
  }
  const activitySmaliPath = findSmaliFile(projectDir, mainActivityClass);
  if (!activitySmaliPath) {
    vscode.window.showErrorMessage(
      `ReAPK: Could not find smali file for ${mainActivityClass}.`,
    );
    return;
  }
  const patched = patchSmaliWithGadgetLoad(activitySmaliPath, gadgetBaseName);
  if (patched) {
    outputChannel.appendLine(`Frida Gadget: Patched ${activitySmaliPath}`);
    vscode.window.showInformationMessage(
      `Frida gadget injected! Patched ${mainActivityClass}`,
    );
  } else {
    vscode.window.showInformationMessage(
      "Frida gadget files copied. Main activity already patched or no onCreate found.",
    );
  }
}

export function detectArch(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(20);
      fs.readSync(fd, header, 0, 20, 0);
      if (
        header[0] !== 0x7f ||
        header[1] !== 0x45 ||
        header[2] !== 0x4c ||
        header[3] !== 0x46
      ) {
        return detectArchFromFilename(filePath);
      }
      const eMachine = header.readUInt16LE(18);
      switch (eMachine) {
        case 0x28:
          return "armeabi-v7a";
        case 0xb7:
          return "arm64-v8a";
        case 0x03:
          return "x86";
        case 0x3e:
          return "x86_64";
        default:
          return detectArchFromFilename(filePath);
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return detectArchFromFilename(filePath);
  }
}

export function detectArchFromFilename(filePath: string): string | null {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes("arm64") || name.includes("aarch64")) return "arm64-v8a";
  if (name.includes("arm")) return "armeabi-v7a";
  if (name.includes("x86_64") || name.includes("x64")) return "x86_64";
  if (name.includes("x86") || name.includes("i386")) return "x86";
  return null;
}

export function findSmaliFile(
  projectDir: string,
  className: string,
): string | null {
  const relativePath = className.replace(/\./g, "/") + ".smali";
  const entries = fs.readdirSync(projectDir);
  const smaliDirs = entries.filter((e) => e.startsWith("smali")).sort();
  for (const dir of smaliDirs) {
    const candidate = path.join(projectDir, dir, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function generateGadgetName(): string {
  const hex = crypto.randomBytes(4).toString("hex");
  return `ndk_${hex}`;
}

export function patchSmaliWithGadgetLoad(
  smaliPath: string,
  libBaseName: string,
): boolean {
  const content = fs.readFileSync(smaliPath, "utf-8");
  if (content.includes(GADGET_INJECT_MARKER)) return false;
  const lines = content.split("\n");
  const result: string[] = [];
  let patched = false;
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    if (
      !patched &&
      lines[i].trim().match(/\.method\s+.*onCreate\(Landroid\/os\/Bundle;\)V/)
    ) {
      for (i++; i < lines.length; i++) {
        result.push(lines[i]);
        const trimmed = lines[i].trim();
        if (trimmed.startsWith(".locals") || trimmed.startsWith(".registers")) {
          const localsMatch = trimmed.match(/\.(locals|registers)\s+(\d+)/);
          if (!localsMatch) break;
          const directive = localsMatch[1];
          const count = parseInt(localsMatch[2]);
          let safeReg: string;
          if (directive === "locals") {
            safeReg = `v${count}`;
          } else {
            safeReg = `v${count - 2}`;
          }
          result[result.length - 1] = lines[i].replace(
            /\d+/,
            String(count + 1),
          );
          result.push("");
          result.push(`    ${GADGET_INJECT_MARKER}`);
          result.push(`    const-string ${safeReg}, "${libBaseName}"`);
          result.push("");
          result.push(
            `    invoke-static {${safeReg}}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V`,
          );
          result.push("");
          patched = true;
          break;
        }
      }
    }
  }
  if (patched) {
    fs.writeFileSync(smaliPath, result.join("\n"));
  }
  return patched;
}
