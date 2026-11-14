import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
const outputChannelName = "ReAPK";
export const outputChannel =
  vscode.window.createOutputChannel(outputChannelName);
export const extensionConfigName = "reapk";
export const reapkDataDir = path.join(os.homedir(), ".reapk");
export const APK_FILE_EXTENSION = ".apk";
export const APKTOOL_YML_FILENAME = "apktool.yml";
export const JAVA_SOURCE_DIR = "java_src";
export const DIST_DIR = "dist";
