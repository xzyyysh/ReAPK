import * as path from "path";
import * as fs from "fs";
import { commands, ProgressLocation, Uri, window } from "vscode";
import { APK_FILE_EXTENSION, outputChannel } from "../core/constants";
import { QuickPicks } from "./quick-picks";
import { apktool } from "../tools/apktool";
import { jadx } from "../tools/jadx";
import { antisplit } from "../tools/antisplit";
export namespace Workflows {
  export async function pickAapt(): Promise<"aapt1" | "aapt2" | undefined> {
    const items = QuickPicks.getQuickPickItems("aaptQuickPickItems");
    QuickPicks.setQuickPickDefault("aaptQuickPickItems", "aapt1");
    const picked = await window.showQuickPick(items, {
      placeHolder: "Select aapt version for building resources",
      canPickMany: false,
      ignoreFocusOut: true,
    });
    return picked?.label as "aapt1" | "aapt2" | undefined;
  }

  export async function pickDecompileJava(): Promise<boolean> {
    const picked = await window.showQuickPick(
      QuickPicks.getQuickPickItems("decompileQuickPickItems"),
      {
        placeHolder: "Select decode mode",
        canPickMany: false,
        ignoreFocusOut: true,
      },
    );
    return picked?.label.includes("Java") ?? false;
  }

  export async function decodeApkFlow(apkFilePath: string): Promise<void> {
    const withJava = await pickDecompileJava();
    const projectDir = uniqueProjectDir(
      path.join(
        path.dirname(apkFilePath),
        `${path.parse(apkFilePath).name}_src`,
      ),
    );
    await apktool.decodeAPK(apkFilePath, projectDir, []);
    if (!fs.existsSync(path.join(projectDir, "apktool.yml"))) {
      window.showErrorMessage(
        "ReAPK: Decoding failed. Check the output channel for details.",
      );
      return;
    }
    if (withJava) {
      await jadx.decompileAPK(apkFilePath, projectDir, []);
    }
    if (!process.env["TEST"]) {
      await commands.executeCommand(
        "vscode.openFolder",
        Uri.file(projectDir),
        true,
      );
    }
  }

  export async function openApkFile(): Promise<void> {
    const result = await window.showOpenDialog({
      canSelectFolders: false,
      filters: {
        APK: [APK_FILE_EXTENSION.substring(1)],
        "Split bundle": ["apks", "xapk", "apkm"],
      },
      openLabel: "Select an APK file",
    });
    if (result && result.length === 1) {
      const apkFilePath = result[0].fsPath;
      const bundleExtension = path.extname(apkFilePath).toLowerCase();
      if ([".apks", ".xapk", ".apkm"].includes(bundleExtension)) {
        await Workflows.decodeSplitBundle(apkFilePath);
        return;
      }
      await Workflows.decodeApkFlow(apkFilePath);
    } else {
      outputChannel.appendLine("ReAPK: no APK file was chosen");
    }
  }

  function uniqueProjectDir(base: string): string {
    let projectDir = base;
    while (fs.existsSync(projectDir)) {
      projectDir = projectDir + "1";
    }
    return projectDir;
  }

  export async function decompileJava(apkFilePath?: Uri): Promise<void> {
    let apk = apkFilePath?.fsPath;
    if (!apk) {
      const picked = await window.showOpenDialog({
        canSelectFolders: false,
        filters: { APK: [APK_FILE_EXTENSION.substring(1)] },
        openLabel: "Select an APK file",
      });
      if (!picked || picked.length !== 1) {
        return;
      }
      apk = picked[0].fsPath;
    }
    const projectDir = uniqueProjectDir(
      path.join(path.dirname(apk), `${path.parse(apk).name}_java`),
    );
    await jadx.decompileAPK(apk, projectDir, []);
  }

  export async function decodeSplitBundle(bundlePath: string): Promise<void> {
    const mergedDir = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "ReAPK",
        cancellable: false,
      },
      async () => await antisplit.decodeBundle(bundlePath),
    );
    if (!mergedDir) {
      window.showErrorMessage(
        "ReAPK: Antisplit merge failed. Check the output channel for details.",
      );
      return;
    }
    const aapt = await pickAapt();
    if (!aapt) {
      return;
    }
    const mergedApk = await buildMergedApk(mergedDir, aapt);
    if (!mergedApk) {
      window.showErrorMessage(
        "ReAPK: Merged APK was not built. Check the output channel for details.",
      );
      return;
    }
    const bundleDir = path.dirname(bundlePath);
    const bundleName = path.basename(bundlePath, path.extname(bundlePath));
    let finalApkPath = path.join(bundleDir, path.basename(mergedApk));
    let n = 2;
    while (fs.existsSync(finalApkPath)) {
      finalApkPath = path.join(bundleDir, `${bundleName}_${n}.apk`);
      n++;
    }
    fs.renameSync(mergedApk, finalApkPath);
    fs.rmSync(mergedDir, { recursive: true, force: true });
    await Workflows.decodeApkFlow(finalApkPath);
  }

  async function buildMergedApk(
    mergedDir: string,
    aapt: "aapt1" | "aapt2",
  ): Promise<string | undefined> {
    const ymlPath = path.join(mergedDir, "apktool.yml");
    const apkFileName = apktool.getApkNameFromApkToolYaml(ymlPath);
    if (!apkFileName) {
      window.showErrorMessage(
        "ReAPK: Could not determine merged APK filename from apktool.yml",
      );
      return undefined;
    }
    const outputApkFilePath = path.join(mergedDir, "dist", apkFileName);
    await apktool.rebuildAPK(
      ymlPath,
      aapt === "aapt1" ? ["--use-aapt1"] : [],
      false,
    );
    if (!fs.existsSync(outputApkFilePath)) {
      return undefined;
    }
    return outputApkFilePath;
  }

  export async function rebuildAPK(apktoolYmlPath: string): Promise<void> {
    const aapt = await pickAapt();
    if (!aapt) {
      return;
    }
    await apktool.rebuildAPK(
      apktoolYmlPath,
      aapt === "aapt1" ? ["--use-aapt1"] : [],
    );
  }
}
