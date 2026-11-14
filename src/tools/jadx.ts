import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { extensionConfigName, JAVA_SOURCE_DIR } from "../core/constants";
import { executeProcess } from "../core/executor";
export namespace jadx {
  export async function decompileAPK(
    apkFilePath: string,
    projectDir: string,
    jadxArgs: string[],
  ): Promise<void> {
    if (!apkFilePath || !path.isAbsolute(apkFilePath)) {
      vscode.window.showErrorMessage(
        `ReAPK: Invalid APK file path: ${apkFilePath}`,
      );
      return;
    }
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const jadxDirPath = extensionConfig.get("jadxDirPath");
    if (!jadxDirPath) {
      vscode.window.showErrorMessage(
        "ReAPK: Jadx not configured. Please check your configuration.",
      );
      return;
    }
    const jadxExeName = `jadx${process.platform.startsWith("win") ? ".bat" : ""}`;
    const jadxPath = path.join(String(jadxDirPath), "bin", jadxExeName);
    if (!fs.existsSync(jadxPath)) {
      vscode.window.showErrorMessage(
        `ReAPK: Jadx executable not found at: ${jadxPath}`,
      );
      return;
    }
    const apkDecompileDir = path.join(projectDir, JAVA_SOURCE_DIR);
    const apkFileName = path.basename(apkFilePath);
    const report = `Decompiling ${apkFileName} into ${apkDecompileDir}`;
    let args = ["-r", "-q", "-ds", apkDecompileDir, apkFilePath];
    if (jadxArgs && jadxArgs.length > 0) {
      args = jadxArgs.concat(args);
    }
    await executeProcess({
      name: "Decompiling",
      report: report,
      command: jadxPath,
      args: args,
      shouldExist: apkDecompileDir,
    });
  }
}
