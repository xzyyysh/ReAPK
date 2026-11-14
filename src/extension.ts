import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { reapkDataDir, DIST_DIR } from "./core/constants";
import { checkAndInstallTools, updateTools } from "./core/updater";
import { Workflows } from "./ui/workflows";
import { apkMitm } from "./tools/apk-mitm";
import { adb } from "./tools/adb";
import { apktool } from "./tools/apktool";
import { frida } from "./tools/frida";
import { smaliLsp } from "./tools/smali-lsp";
export function activate(context: vscode.ExtensionContext): void {
  console.log("Activated reapk extension!");
  if (!fs.existsSync(String(reapkDataDir))) {
    fs.mkdirSync(reapkDataDir);
  }
  const openApkFileCommand = vscode.commands.registerCommand(
    "reapk.openApkFile",
    async () => {
      await checkAndInstallTools();
      await Workflows.openApkFile();
    },
  );
  const rebuildAPkFileCommand = vscode.commands.registerCommand(
    "reapk.rebuildApkFile",
    async (uri: vscode.Uri) => {
      await checkAndInstallTools();
      await Workflows.rebuildAPK(uri.fsPath);
    },
  );
  const installAPkFileCommand = vscode.commands.registerCommand(
    "reapk.installApkFile",
    (uri: vscode.Uri) => adb.installAPK(uri.fsPath),
  );
  const rebuildAndInstallAPkFileCommand = vscode.commands.registerCommand(
    "reapk.rebuildAndInstallApkFile",
    async (uri: vscode.Uri) => {
      await checkAndInstallTools();
      await Workflows.rebuildAPK(uri.fsPath);
      const parentPath = path.parse(uri.fsPath).dir;
      const apkPath = path.join(
        parentPath,
        DIST_DIR,
        apktool.getApkNameFromApkToolYaml(uri.fsPath),
      );
      await adb.installAPK(apkPath);
    },
  );
  const patchApkForHttpsCommand = vscode.commands.registerCommand(
    "reapk.patchApkForHttps",
    (uri: vscode.Uri) => apkMitm.applyMitmPatches(uri.fsPath),
  );
  const emptyFrameworkDirCommand = vscode.commands.registerCommand(
    "reapk.emptyFrameworkDir",
    async () => {
      await checkAndInstallTools();
      await apktool.emptyFrameworkDir();
    },
  );
  const updateToolsCommand = vscode.commands.registerCommand(
    "reapk.updateTools",
    () => checkAndInstallTools(),
  );
  const generateFridaHookCommand = vscode.commands.registerCommand(
    "reapk.generateFridaHook",
    () => frida.generateHook(),
  );
  const injectFridaGadgetCommand = vscode.commands.registerCommand(
    "reapk.injectFridaGadget",
    (uri: vscode.Uri) => frida.injectGadget(uri),
  );
  context.subscriptions.push(
    openApkFileCommand,
    rebuildAPkFileCommand,
    installAPkFileCommand,
    rebuildAndInstallAPkFileCommand,
    patchApkForHttpsCommand,
    emptyFrameworkDirCommand,
    updateToolsCommand,
    generateFridaHookCommand,
    injectFridaGadgetCommand,
  );
  smaliLsp.register(context);
  updateTools();
}
export function deactivate(): Thenable<void> | undefined {
  return smaliLsp.stopServer();
}
