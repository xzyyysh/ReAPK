import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { APK_FILE_EXTENSION } from "../core/constants";
import { executeProcess } from "../core/executor";
export namespace adb {
  export async function installAPK(apkFilePath: string): Promise<void> {
    if (!apkFilePath || !fs.existsSync(apkFilePath)) {
      vscode.window.showErrorMessage(
        `ReAPK: APK file not found: ${apkFilePath}`,
      );
      return;
    }
    if (!apkFilePath.toLowerCase().endsWith(APK_FILE_EXTENSION)) {
      vscode.window.showErrorMessage(
        `ReAPK: File is not an APK: ${apkFilePath}`,
      );
      return;
    }
    const apkFileName = path.basename(apkFilePath);
    const report = `Installing ${apkFileName}`;
    const args = ["install", "-r", apkFilePath];
    await executeProcess({
      name: "Installing",
      report: report,
      command: "adb",
      args: args,
    });
  }
}
