import { URL } from "url";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import AdmZip from "adm-zip";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  extensionConfigName,
  reapkDataDir,
  outputChannel,
} from "../core/constants";
import { Tool } from "./tool-sources";
const USER_AGENT = "ReAPK-VSCode-Extension";
function getProxyUrl(): string | undefined {
  const configProxy = vscode.workspace
    .getConfiguration("http")
    .get<string>("proxy");
  if (configProxy && configProxy.trim().length > 0) {
    return configProxy.trim();
  }
  const envProxy =
    process.env["HTTPS_PROXY"] ||
    process.env["https_proxy"] ||
    process.env["HTTP_PROXY"] ||
    process.env["http_proxy"];
  if (envProxy && envProxy.trim().length > 0) {
    return envProxy.trim();
  }
  return undefined;
}
export function getRequestOptions(): https.RequestOptions {
  const options: https.RequestOptions = {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
    },
  };
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    outputChannel.appendLine(`Using proxy: ${proxyUrl}`);
    options.agent = new HttpsProxyAgent(proxyUrl);
  }
  return options;
}
export async function downloadTool(tool: Tool): Promise<string | null> {
  try {
    outputChannel.show();
    outputChannel.appendLine("-".repeat(50));
    outputChannel.appendLine(`Downloading file: ${tool.fileName}`);
    outputChannel.appendLine("-".repeat(50));
    const buffer = await downloadFile(tool.downloadUrl);
    fs.mkdirSync(reapkDataDir, { recursive: true });
    const filePath = path.join(reapkDataDir, tool.fileName);
    fs.writeFileSync(filePath, buffer);
    let configPath = filePath;
    if (tool.zipped && tool.unzipDir) {
      configPath = path.join(reapkDataDir, tool.unzipDir);
      try {
        new AdmZip(filePath).extractAllTo(configPath, true, true);
        outputChannel.appendLine(`Extracted ${filePath} into ${configPath}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(
          `Error: Extracting file ${filePath}: ${errorMessage}`,
        );
      }
    }
    await vscode.workspace
      .getConfiguration(extensionConfigName)
      .update(tool.configName, configPath, vscode.ConfigurationTarget.Global);
    return filePath;
  } catch (error) {
    outputChannel.appendLine(`Error: ${error}`);
    return null;
  }
}
const MAX_REDIRECTS = 5;
export async function downloadFile(
  urlString: string,
  redirectCount = 0,
): Promise<Buffer> {
  if (redirectCount >= MAX_REDIRECTS) {
    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
  }
  const buffers: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    const request = https.request(
      new URL(urlString),
      getRequestOptions(),
      (response) => {
        if (
          (response.statusCode === 301 || response.statusCode === 302) &&
          response.headers.location
        ) {
          return resolve(
            downloadFile(response.headers.location, redirectCount + 1),
          );
        } else if (response.statusCode !== 200) {
          const errorMsg = `Download failed with response code: ${response.statusCode}`;
          outputChannel.appendLine(errorMsg);
          reject(new Error(errorMsg));
          response.resume();
          return;
        }
        const contentLength = response.headers["content-length"]
          ? response.headers["content-length"]
          : "0";
        const packageSize = parseInt(contentLength, 10);
        let downloadedBytes = 0;
        let downloadPercentage = 0;
        outputChannel.appendLine(
          `Download size: ${(packageSize / 1024 / 1024).toFixed(2)} MB`,
        );
        response.on("data", (data) => {
          downloadedBytes += data.length;
          buffers.push(data);
          const newPercentage = Math.ceil(
            100 * (downloadedBytes / packageSize),
          );
          if (newPercentage !== downloadPercentage) {
            downloadPercentage = newPercentage;
            outputChannel.appendLine(`Downloaded ${downloadPercentage}%`);
          }
        });
        response.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        response.on("error", (err) => {
          reject(err.message);
        });
      },
    );
    request.on("error", (err) => {
      reject(err.message);
    });
    request.end();
  });
}
