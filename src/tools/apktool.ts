import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  APKTOOL_YML_FILENAME,
  DIST_DIR,
  extensionConfigName,
  outputChannel,
} from "../core/constants";
import { executeProcess } from "../core/executor";
import { getJavaPath } from "../core/java";
import { apkSigner } from "./apk-signer";
export namespace apktool {
  export function getApkNameFromApkToolYaml(apktoolYamlPath: string): string {
    if (!apktoolYamlPath || !fs.existsSync(apktoolYamlPath)) {
      outputChannel.appendLine(
        `Error: apktool.yml file not found at: ${apktoolYamlPath}`,
      );
      return "";
    }
    try {
      const fileContent = fs.readFileSync(apktoolYamlPath, "utf8");
      const regArr = /apkFileName: .*\.apk/.exec(fileContent);
      return regArr && regArr.length > 0 ? regArr[0].split(": ")[1] : "";
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(
        `Couldn't find apkFileName in apktool.yml: ${errorMessage}`,
      );
      return "";
    }
  }
  export async function installFramework(
    apkFilePath: string,
    frameDir: string,
  ): Promise<void> {
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const apktoolPath = extensionConfig.get("apktoolPath");
    if (!apktoolPath || !fs.existsSync(String(apktoolPath))) {
      vscode.window.showErrorMessage(
        "ReAPK: Apktool not found. Please check your configuration.",
      );
      return;
    }
    fs.mkdirSync(frameDir, { recursive: true });
    await executeProcess({
      name: "Installing framework",
      report: `Installing ${path.basename(apkFilePath)} as split framework`,
      command: getJavaPath(),
      args: ["-jar", String(apktoolPath), "if", "-p", frameDir, apkFilePath],
    });
  }
  export async function decodeAPK(
    apkFilePath: string,
    projectDir: string,
    apktoolArgs: string[],
  ): Promise<void> {
    if (!apkFilePath || !fs.existsSync(apkFilePath)) {
      vscode.window.showErrorMessage(
        `ReAPK: APK file not found: ${apkFilePath}`,
      );
      return;
    }
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const apktoolPath = extensionConfig.get("apktoolPath");
    if (!apktoolPath || !fs.existsSync(String(apktoolPath))) {
      vscode.window.showErrorMessage(
        "ReAPK: Apktool not found. Please check your configuration.",
      );
      return;
    }
    const apkFileName = path.basename(apkFilePath);
    const report = `Decoding ${apkFileName} into ${projectDir}`;
    let args = [
      "-jar",
      String(apktoolPath),
      "d",
      apkFilePath,
      "-o",
      projectDir,
    ];
    if (apktoolArgs && apktoolArgs.length > 0) {
      args = args.concat(apktoolArgs);
    }
    const shouldExist = path.join(projectDir, APKTOOL_YML_FILENAME);
    await executeProcess({
      name: "Decoding",
      report: report,
      command: getJavaPath(),
      args: args,
      shouldExist: shouldExist,
    });
  }
  export async function rebuildAPK(
    apktoolYmlPath: string,
    apktoolArgs: string[],
  ): Promise<void> {
    if (!apktoolYmlPath || !fs.existsSync(apktoolYmlPath)) {
      vscode.window.showErrorMessage(
        `ReAPK: apktool.yml file not found: ${apktoolYmlPath}`,
      );
      return;
    }
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const apktoolPath = extensionConfig.get("apktoolPath");
    if (!apktoolPath || !fs.existsSync(String(apktoolPath))) {
      vscode.window.showErrorMessage(
        "ReAPK: Apktool not found. Please check your configuration.",
      );
      return;
    }
    const apkFileName = getApkNameFromApkToolYaml(apktoolYmlPath);
    if (!apkFileName) {
      vscode.window.showErrorMessage(
        "ReAPK: Could not determine APK filename from apktool.yml",
      );
      return;
    }
    const projectDir = path.parse(apktoolYmlPath).dir;
    const report = `Rebuilding ${apkFileName} into ${path.basename(projectDir)}${path.sep}dist`;
    let args = ["-jar", String(apktoolPath), "b", projectDir];
    if (apktoolArgs && apktoolArgs.length > 0) {
      args = args.concat(apktoolArgs);
    }
    const outputApkFilePath = path.join(projectDir, DIST_DIR, apkFileName);
    let canBeSigned = false;
    await executeProcess({
      name: "Rebuilding",
      report: report,
      command: getJavaPath(),
      args: args,
      shouldExist: outputApkFilePath,
      onSuccess: () => {
        canBeSigned = true;
      },
    });
    if (canBeSigned) await apkSigner.signAPK(outputApkFilePath);
  }
  export async function emptyFrameworkDir(): Promise<void> {
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const apktoolPath = extensionConfig.get("apktoolPath");
    const report = "Cleaning up ApkTool Framework dir";
    const args = ["-jar", String(apktoolPath), "clean-frameworks"];
    await executeProcess({
      name: "Cleanup Apktool framework dir",
      report: report,
      command: getJavaPath(),
      args: args,
    });
  }
}
