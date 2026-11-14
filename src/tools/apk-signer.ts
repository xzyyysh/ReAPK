import * as fs from "fs";
import * as vscode from "vscode";
import { extensionConfigName } from "../core/constants";
import { executeProcess } from "../core/executor";
import { getJavaPath } from "../core/java";
export namespace apkSigner {
  export async function signAPK(apkFilePath: string): Promise<void> {
    if (!apkFilePath || !fs.existsSync(apkFilePath)) {
      vscode.window.showErrorMessage(
        `ReAPK: APK file not found: ${apkFilePath}`,
      );
      return;
    }
    const extensionConfig =
      vscode.workspace.getConfiguration(extensionConfigName);
    const apkSignerPath = extensionConfig.get("apkSignerPath");
    if (!apkSignerPath || !fs.existsSync(String(apkSignerPath))) {
      vscode.window.showErrorMessage(
        "ReAPK: uber-apk-signer not found. Please check your configuration.",
      );
      return;
    }
    const keystorePath = extensionConfig.get("keystorePath");
    const keystorePassword = extensionConfig.get("keystorePassword");
    const keyAlias = extensionConfig.get("keyAlias");
    const keyPassword = extensionConfig.get("keyPassword");
    const report = `Signing ${apkFilePath}`;
    const args = [
      "-jar",
      String(apkSignerPath),
      "-a",
      apkFilePath,
      "--allowResign",
      "--overwrite",
    ];
    if (
      keystorePath &&
      fs.existsSync(String(keystorePath)) &&
      keystorePassword &&
      keyAlias &&
      keyPassword
    ) {
      args.push(
        "--ks",
        String(keystorePath),
        "--ksPass",
        String(keystorePassword),
        "--ksAlias",
        String(keyAlias),
        "--ksKeyPass",
        String(keyPassword),
      );
    }
    await executeProcess({
      name: "Signing",
      report: report,
      command: getJavaPath(),
      args: args,
      shouldExist: apkFilePath,
    });
  }
}
