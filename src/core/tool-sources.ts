import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { reapkDataDir, outputChannel } from "./constants";
import { getRequestOptions } from "./downloader";

export interface Tool {
  name: string;
  version: string;
  downloadUrl: string;
  fileName: string;
  configName: string;
  zipped: boolean;
  unzipDir?: string;
}

interface ToolSource {
  name: string;
  repo: string;
  assetPattern: RegExp;
  configName: string;
  zipped: boolean;
  pinned?: { url: string; fileName: string; version: string };
}

const TOOL_SOURCES: ToolSource[] = [
  {
    name: "apktool",
    repo: "iBotPeaches/Apktool",
    assetPattern: /^apktool_[^/]*\.jar$/i,
    configName: "apktoolPath",
    zipped: false,
    pinned: {
      url: "https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar",
      fileName: "apktool_2.9.3.jar",
      version: "2.9.3",
    },
  },
  {
    name: "smali-lsp",
    repo: "Surendrajat/smali-lsp",
    assetPattern: /^smali-lsp-[^/]*\.jar$/i,
    configName: "smaliLspPath",
    zipped: false,
  },
  {
    name: "uber-apk-signer",
    repo: "patrickfav/uber-apk-signer",
    assetPattern: /^uber-apk-signer-[^/]*\.jar$/i,
    configName: "apkSignerPath",
    zipped: false,
  },
  {
    name: "jadx",
    repo: "skylot/jadx",
    assetPattern: /^jadx-\d[^/]*\.zip$/i,
    configName: "jadxDirPath",
    zipped: true,
  },
];

const RESOLVE_CACHE_TTL_MS = 3600000; // 1 hour

interface ResolvedCache {
  fetchedAt: number;
  tools: Tool[];
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  assets?: GithubAsset[];
}

function versionFromTag(tag: string | undefined, fallback: string): string {
  if (!tag) return fallback;
  return tag.replace(/^v/i, "");
}

function unzipDirFor(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function fetchLatestRelease(repo: string): Promise<GithubRelease | null> {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const request = https.get(url, getRequestOptions(), (response) => {
      if (response.statusCode !== 200) {
        outputChannel.appendLine(
          `GitHub API ${repo}: response code ${response.statusCode}`,
        );
        response.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (err) {
          outputChannel.appendLine(`GitHub API ${repo}: invalid JSON: ${err}`);
          resolve(null);
        }
      });
      response.on("error", () => resolve(null));
    });
    request.on("error", (err) => {
      outputChannel.appendLine(`GitHub API ${repo}: ${err.message}`);
      resolve(null);
    });
    request.end();
  });
}

async function resolveTool(source: ToolSource): Promise<Tool | null> {
  if (source.pinned) {
    return {
      name: source.name,
      version: source.pinned.version,
      downloadUrl: source.pinned.url,
      fileName: source.pinned.fileName,
      configName: source.configName,
      zipped: source.zipped,
    };
  }
  const release = await fetchLatestRelease(source.repo);
  if (!release || !release.assets) {
    return null;
  }
  const asset = release.assets.find((a) => source.assetPattern.test(a.name));
  if (!asset) {
    outputChannel.appendLine(
      `No matching asset for ${source.name} in ${source.repo} latest release`,
    );
    return null;
  }
  const version = versionFromTag(release.tag_name, "unknown");
  if (source.zipped) {
    const fileName = asset.name;
    return {
      name: source.name,
      version,
      downloadUrl: asset.browser_download_url,
      fileName,
      configName: source.configName,
      zipped: true,
      unzipDir: unzipDirFor(fileName),
    };
  }
  return {
    name: source.name,
    version,
    downloadUrl: asset.browser_download_url,
    fileName: asset.name,
    configName: source.configName,
    zipped: false,
  };
}

export async function resolveLatestTools(): Promise<Tool[]> {
  const cacheFile = path.resolve(reapkDataDir, "config.json");
  let cached: ResolvedCache | null = null;
  if (fs.existsSync(cacheFile)) {
    try {
      cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    } catch (err) {
      outputChannel.appendLine(`Failed to read resolve cache: ${err}`);
      cached = null;
    }
  }
  if (
    cached &&
    cached.tools &&
    cached.tools.length > 0 &&
    Date.now() - cached.fetchedAt < RESOLVE_CACHE_TTL_MS
  ) {
    return cached.tools;
  }

  const tools: Tool[] = [];
  for (const source of TOOL_SOURCES) {
    const tool = await resolveTool(source);
    if (tool) {
      tools.push(tool);
    }
  }
  if (tools.length === TOOL_SOURCES.length) {
    const cache: ResolvedCache = { fetchedAt: Date.now(), tools };
    try {
      fs.mkdirSync(reapkDataDir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 4));
    } catch (err) {
      outputChannel.appendLine(`Failed to write resolve cache: ${err}`);
    }
    return tools;
  }
  if (cached && cached.tools && cached.tools.length > 0) {
    outputChannel.appendLine("Using cached tool versions after failed refresh");
    return cached.tools;
  }
  return tools;
}
