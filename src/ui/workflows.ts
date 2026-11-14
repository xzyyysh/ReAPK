import * as path from "path";
import * as fs from "fs";
import { commands, QuickPickItem, Uri, window, workspace } from "vscode";
import {
  APK_FILE_EXTENSION,
  extensionConfigName,
  outputChannel,
} from "../core/constants";
import { QuickPicks } from "./quick-picks";
import { apktool } from "../tools/apktool";
import { git } from "../tools/git";
import { jadx } from "../tools/jadx";
export namespace Workflows {
  export async function showArgsQuickPick(
    items: QuickPickItem[],
    placeHolder: string,
  ): Promise<QuickPickItem[] | undefined> {
    return await window.showQuickPick(items, {
      placeHolder: placeHolder,
      canPickMany: true,
      matchOnDetail: true,
      matchOnDescription: true,
      ignoreFocusOut: true,
    });
  }
  export async function openApkFile(): Promise<void> {
    const result = await window.showOpenDialog({
      canSelectFolders: false,
      filters: {
        APK: [APK_FILE_EXTENSION.substring(1)],
      },
      openLabel: "Select an APK file",
    });
    if (result && result.length === 1) {
      const quickPickItems = await showArgsQuickPick(
        QuickPicks.getQuickPickItems("decodeQuickPickItems"),
        "Additional features & Apktool/Jadx arguments",
      );
      if (quickPickItems) {
        const args = quickPickItems.map<string>((item) => item.label);
        const argDescriptions = quickPickItems.map<string | undefined>(
          (item) => item.description,
        );
        const decompileJavaIndex = argDescriptions.indexOf("[Use Jadx]");
        const jadxOptionsIndex = argDescriptions.indexOf("jadx");
        const jadxOptionsNumber = argDescriptions.filter(
          (item) => item === "jadx",
        ).length;
        let decompileJava = false;
        let jadxArgs: string[] = [];
        if (jadxOptionsIndex !== -1) {
          jadxArgs = args.splice(jadxOptionsIndex, jadxOptionsNumber);
        }
        if (decompileJavaIndex !== -1) {
          decompileJava = true;
          args.splice(decompileJavaIndex, 1);
        }
        const apkFilePath = result[0].fsPath;
        let projectDir = path.join(
          path.dirname(apkFilePath),
          path.parse(apkFilePath).name,
        );
        while (fs.existsSync(projectDir)) {
          projectDir = projectDir + "1";
        }
        await apktool.decodeAPK(apkFilePath, projectDir, args);
        if (decompileJava) {
          await jadx.decompileAPK(apkFilePath, projectDir, jadxArgs);
        }
        const initializeGit = workspace
          .getConfiguration(extensionConfigName)
          .get("initProjectDirAsGit");
        if (initializeGit)
          await git.initGitDir(projectDir, "Initial ReAPK project");
        if (!process.env["TEST"]) {
          await commands.executeCommand(
            "vscode.openFolder",
            Uri.file(projectDir),
            true,
          );
        }
      }
    } else {
      outputChannel.appendLine("ReAPK: no APK file was chosen");
    }
  }
  export async function rebuildAPK(apktoolYmlPath: string): Promise<void> {
    const quickPickItems = await showArgsQuickPick(
      QuickPicks.getQuickPickItems("rebuildQuickPickItems"),
      "Additional Apktool arguments",
    );
    const args = quickPickItems
      ? quickPickItems.map<string>((item) => item.label)
      : undefined;
    if (args) {
      await apktool.rebuildAPK(apktoolYmlPath, args);
    }
  }
}
