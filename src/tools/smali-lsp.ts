import * as fs from "fs";
import * as path from "path";
import {
  workspace,
  window,
  Uri,
  TextDocument,
  ExtensionContext,
  StatusBarItem,
  StatusBarAlignment,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
} from "vscode-languageclient/node";
import {
  extensionConfigName,
  outputChannel,
  APKTOOL_YML_FILENAME,
} from "../core/constants";
import { getJavaPath } from "../core/java";
let client: LanguageClient | undefined;
let statusBarItem: StatusBarItem | undefined;
let noProjectGuidanceShown = false;
let missingJarWarningShown = false;
function findApktoolProjectRoot(startPath: string): string | null {
  let dir = startPath;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, APKTOOL_YML_FILENAME))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function resolveServerJar(): string | null {
  const config = workspace.getConfiguration(extensionConfigName);
  const jarPath = config.get<string>("smaliLspPath");
  if (jarPath && fs.existsSync(jarPath)) {
    return jarPath;
  }
  return null;
}
export namespace smaliLsp {
  export async function startServer(document: TextDocument): Promise<void> {
    if (client) return;
    const projectRoot = findApktoolProjectRoot(
      path.dirname(document.uri.fsPath),
    );
    if (!projectRoot) {
      outputChannel.appendLine(
        "Smali LSP: No APKTool project found (no apktool.yml in parent dirs)",
      );
      if (!noProjectGuidanceShown) {
        noProjectGuidanceShown = true;
        window.showInformationMessage(
          "ReAPK: Smali language features are disabled — no APKTool project (apktool.yml) found in parent folders. Decode an APK via 'ReAPK: Open an APK' to enable them.",
        );
      }
      return;
    }
    const javaPath = getJavaPath();
    const serverJar = resolveServerJar();
    if (!serverJar) {
      outputChannel.appendLine(
        "Smali LSP: Server JAR not found at configured path",
      );
      if (!missingJarWarningShown) {
        missingJarWarningShown = true;
        window.showWarningMessage(
          "ReAPK: Smali LSP server JAR not found. Use 'ReAPK: Update Tools' to trigger download, or set reapk.smaliLspPath.",
        );
      }
      return;
    }
    outputChannel.appendLine(`Smali LSP: Starting for project ${projectRoot}`);
    outputChannel.appendLine(`  Java: ${javaPath}`);
    outputChannel.appendLine(`  Server: ${serverJar}`);
    const serverOptions: ServerOptions = {
      command: javaPath,
      args: ["-jar", serverJar, "lsp"],
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: "file", language: "smali" }],
      synchronize: {
        fileEvents: workspace.createFileSystemWatcher("**/*.smali"),
      },
      outputChannelName: "Smali Language Server",
      revealOutputChannelOn: 4,
      workspaceFolder: {
        uri: Uri.file(projectRoot),
        name: path.basename(projectRoot),
        index: 0,
      },
      middleware: {
        handleWorkDoneProgress: (_token, params, next) => {
          if ("kind" in params) {
            if (params.kind === "begin" || params.kind === "report") {
              const pct =
                params.percentage !== undefined ? ` ${params.percentage}%` : "";
              const msg = params.message ? ` (${params.message})` : "";
              showStatusBar(
                `$(sync~spin) Smali: Indexing${pct}`,
                `Indexing Smali${pct}${msg}`,
              );
            } else if (params.kind === "end") {
              showStatusBar(
                "$(check) Smali LSP",
                "Smali Language Server ready",
              );
            }
          }
          next(_token, params);
        },
      },
    };
    client = new LanguageClient(
      "smaliLsp",
      "Smali Language Server",
      serverOptions,
      clientOptions,
    );
    client.onDidChangeState((event) => {
      updateStatusBar(event.newState);
    });
    try {
      await client.start();
      outputChannel.appendLine("Smali LSP: Server started successfully");
    } catch (err) {
      outputChannel.appendLine(`Smali LSP: Failed to start: ${err}`);
      window.showErrorMessage(
        "ReAPK: Failed to start Smali LSP. Check Output for details.",
      );
      showStatusBar("$(error) Smali LSP", "Failed to start");
      client = undefined;
    }
  }
  export async function stopServer(): Promise<void> {
    if (client) {
      await client.stop();
      client = undefined;
    }
    if (statusBarItem) {
      statusBarItem.dispose();
      statusBarItem = undefined;
    }
    outputChannel.appendLine("Smali LSP: Server stopped");
  }
  export function register(context: ExtensionContext): void {
    const onOpen = workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "smali" && !client) {
        startServer(document);
      }
    });
    context.subscriptions.push(onOpen);
    const activeEditor = window.activeTextEditor;
    if (activeEditor?.document.languageId === "smali") {
      startServer(activeEditor.document);
    }
  }
  export function isRunning(): boolean {
    return client !== undefined;
  }
}
function showStatusBar(text: string, tooltip: string): void {
  if (!statusBarItem) {
    statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
  }
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();
}
function updateStatusBar(state: State): void {
  switch (state) {
    case State.Running:
      showStatusBar("$(check) Smali LSP", "Smali Language Server ready");
      break;
    case State.Starting:
      showStatusBar(
        "$(sync~spin) Smali: Starting...",
        "Starting Smali Language Server",
      );
      break;
    case State.Stopped:
      if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = undefined;
      }
      break;
  }
}
