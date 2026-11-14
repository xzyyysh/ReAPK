import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { reapkDataDir, extensionConfigName, outputChannel } from "./constants";
import { Tool, resolveLatestTools } from "./tool-sources";
import { downloadTool } from "./downloader";
import { apktool } from "../tools/apktool";

function getToolInstallPath(tool: Tool): string {
  return path.join(
    reapkDataDir,
    tool.zipped && tool.unzipDir ? tool.unzipDir : tool.fileName,
  );
}

function isToolInstalled(tool: Tool): boolean {
  const installPath = getToolInstallPath(tool);
  if (!fs.existsSync(installPath)) return false;
  if (tool.zipped && tool.unzipDir) {
    return fs.readdirSync(installPath).length > 0;
  }
  return true;
}

async function syncToolConfig(tool: Tool): Promise<void> {
  const installPath = getToolInstallPath(tool);
  const current = vscode.workspace
    .getConfiguration(extensionConfigName)
    .get(tool.configName);
  if (current !== installPath) {
    await vscode.workspace
      .getConfiguration(extensionConfigName)
      .update(tool.configName, installPath, vscode.ConfigurationTarget.Global);
  }
}

export async function updateTools(): Promise<void> {
  const firstRunFile = path.resolve(reapkDataDir, "first_run_completed");
  if (!fs.existsSync(firstRunFile)) {
    fs.writeFileSync(firstRunFile, "");
    return;
  }
  const extensionConfig =
    vscode.workspace.getConfiguration(extensionConfigName);
  if (!extensionConfig.get("updateTools")) return;

  const needsUpdate: Tool[] = [];

  const tools = await resolveLatestTools();
  for (const tool of tools) {
    if (isToolInstalled(tool)) {
      await syncToolConfig(tool);
    } else {
      needsUpdate.push(tool);
    }
  }

  if (needsUpdate.length > 0) {
    vscode.window
      .showInformationMessage(
        "ReAPK: Some of the needed tools are missing or outdated.",
        "Update tools",
        "Cancel",
      )
      .then(async (updateAction) => {
        if (updateAction === "Update tools") {
          const downloadPromises = needsUpdate.map((tool) =>
            downloadTool(tool),
          );

          const results = await Promise.allSettled(downloadPromises);
          const failures = results.filter((r) => r.status === "rejected");
          if (failures.length > 0) {
            outputChannel.appendLine(
              `Failed to update ${failures.length} tool(s)`,
            );
          }
        }
      });
  }
}

export async function checkAndInstallTools(): Promise<void> {
  const tools = await resolveLatestTools();
  if (!tools || tools.length === 0) {
    throw new Error(
      "ReAPK: could not resolve tool versions from GitHub releases",
    );
  }

  const results = await Promise.allSettled(
    tools.map(async (tool) => {
      if (isToolInstalled(tool)) {
        await syncToolConfig(tool);
        return;
      }
      await downloadTool(tool);
      if (!isToolInstalled(tool)) {
        throw new Error(
          `could not install ${tool.name} from ${tool.downloadUrl}`,
        );
      }
      if (tool.name === "apktool") {
        await apktool.emptyFrameworkDir();
      }
    }),
  );

  const failures = results
    .filter((r) => r.status === "rejected")
    .map((r) => String((r as PromiseRejectedResult).reason));
  if (failures.length > 0) {
    const msg = `ReAPK: failed to install tools: ${failures.join("; ")}`;
    outputChannel.appendLine(msg);
    throw new Error(msg);
  }
}
