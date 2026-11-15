/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-empty-function, @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-extraneous-class */
import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
describe("VSIX Build & Packaging Tests", function () {
  this.timeout(120000);
  const rootDir = path.resolve(__dirname, "../../..");
  const distDir = path.join(rootDir, "dist");
  const extensionFile = path.join(distDir, "extension.js");
  let vsixPath: string;
  before("Build and package extension", async function () {
    console.log("Building and Packaging VSIX...");
    const { stdout } = await execAsync("yarn package", {
      cwd: rootDir,
    });
    if (!fs.existsSync(extensionFile)) {
      assert.fail("Build failed: extension.js not found");
    }
    const match = stdout.match(/Packaged: (.+\.vsix)/);
    if (!match) {
      assert.fail("Could not find VSIX file in vsce output");
    }
    vsixPath = match[1];
    console.log(`VSIX created: ${vsixPath}`);
  });
  after("Cleanup", function () {});
  it("should build extension.js successfully", function () {
    assert.ok(
      fs.existsSync(extensionFile),
      "extension.js should exist after build",
    );
    const stats = fs.statSync(extensionFile);
    assert.ok(stats.size > 100000, "extension.js should be at least 100KB");
    console.log(`Extension bundle size: ${(stats.size / 1024).toFixed(2)} KB`);
  });
  it("should export activate function", function () {
    const Module = require("module");
    const originalLoad = Module._load;
    Module._load = function (
      request: string,
      _parent: unknown,
      ..._args: unknown[]
    ) {
      if (request === "vscode") {
        return createVSCodeMock();
      }
      return originalLoad.call(this, request, _parent, ..._args);
    };
    try {
      delete require.cache[extensionFile];
      const extension = require(extensionFile);
      assert.ok(extension, "Extension module should load without errors");
      assert.strictEqual(
        typeof extension.activate,
        "function",
        "Extension should export activate function",
      );
      console.log("✓ Extension exports:", Object.keys(extension).join(", "));
    } finally {
      Module._load = originalLoad;
    }
  });
  it("should activate without errors", async function () {
    const Module = require("module");
    const originalLoad = Module._load;
    Module._load = function (
      request: string,
      _parent: unknown,
      ..._args: unknown[]
    ) {
      if (request === "vscode") {
        return createVSCodeMock();
      }
      return originalLoad.call(this, request, _parent, ..._args);
    };
    try {
      delete require.cache[extensionFile];
      const extension = require(extensionFile);
      const mockContext = {
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: async () => {},
        },
        globalState: {
          get: () => undefined,
          update: async () => {},
          setKeysForSync: () => {},
        },
        extensionPath: path.dirname(extensionFile),
        asAbsolutePath: (relativePath: string) =>
          path.join(path.dirname(extensionFile), relativePath),
        storagePath: path.join(__dirname, "..", "..", "..", "storage"),
        globalStoragePath: path.join(
          __dirname,
          "..",
          "..",
          "..",
          "globalStorage",
        ),
        logPath: path.join(__dirname, "..", "..", "..", "logs"),
        extensionUri: { fsPath: path.dirname(extensionFile) },
        environmentVariableCollection: {
          persistent: false,
          replace: () => {},
          append: () => {},
          prepend: () => {},
          get: () => undefined,
          forEach: () => {},
          delete: () => {},
          clear: () => {},
        },
        extensionMode: 3,
        storageUri: undefined,
        globalStorageUri: { fsPath: "" },
        logUri: { fsPath: "" },
        secrets: {
          get: async () => undefined,
          store: async () => {},
          delete: async () => {},
          onDidChange: () => ({
            dispose: () => {},
          }),
        },
        extension: {
          id: "surendrajat.reapk",
          extensionUri: { fsPath: "" },
          extensionPath: "",
          isActive: true,
          packageJSON: {},
          exports: undefined,
          activate: async () => {},
          extensionKind: 1,
        },
        languageModelAccessInformation: {
          onDidChange: () => ({
            dispose: () => {},
          }),
          canSendRequest: () => undefined,
        },
      };
      await extension.activate(mockContext);
      console.log("✓ Extension activated successfully");
      assert.ok(
        mockContext.subscriptions !== undefined,
        "Extension should create subscriptions array",
      );
      console.log(
        `✓ Extension created ${mockContext.subscriptions.length} subscriptions`,
      );
    } finally {
      Module._load = originalLoad;
    }
  });
  it("should create valid VSIX package", async function () {
    assert.ok(fs.existsSync(vsixPath), "VSIX file should exist");
    const stats = fs.statSync(vsixPath);
    assert.ok(stats.size > 50000, "VSIX should be at least 50KB");
    console.log(`VSIX size: ${(stats.size / 1024).toFixed(2)} KB`);
    const tempDir = path.join(rootDir, ".vsix-test-temp");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);
    try {
      await execAsync(`unzip -q "${vsixPath}" -d "${tempDir}"`);
      const packageJsonPath = path.join(tempDir, "extension", "package.json");
      const extensionJsPath = path.join(
        tempDir,
        "extension",
        "dist",
        "extension.js",
      );
      assert.ok(
        fs.existsSync(packageJsonPath),
        "package.json should be in VSIX",
      );
      assert.ok(
        fs.existsSync(extensionJsPath),
        "extension.js should be in VSIX",
      );
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      assert.strictEqual(
        packageJson.name,
        "reapk",
        "Package name should be reapk",
      );
      assert.strictEqual(
        packageJson.main,
        "./dist/extension",
        "Main entry point should be ./dist/extension",
      );
      assert.ok(packageJson.activationEvents, "Should have activation events");
      console.log(
        "✓ VSIX structure validated:",
        packageJson.name,
        packageJson.version,
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  });
  it("should load extension from VSIX without errors", async function () {
    const tempDir = path.join(rootDir, ".vsix-test-load");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);
    try {
      await execAsync(`unzip -q "${vsixPath}" -d "${tempDir}"`);
      const vsixExtensionPath = path.join(
        tempDir,
        "extension",
        "dist",
        "extension.js",
      );
      const Module = require("module");
      const originalLoad = Module._load;
      Module._load = function (
        request: string,
        _parent: unknown,
        ..._args: unknown[]
      ) {
        if (request === "vscode") {
          return createVSCodeMock();
        }
        return originalLoad.call(this, request, _parent, ..._args);
      };
      try {
        delete require.cache[vsixExtensionPath];
        const extension = require(vsixExtensionPath);
        assert.ok(extension, "Extension should load from VSIX");
        assert.strictEqual(
          typeof extension.activate,
          "function",
          "activate function should be accessible from VSIX",
        );
        const mockContext = createExtensionContext();
        extension.activate(mockContext);
        assert.ok(
          mockContext.subscriptions.length > 0,
          "Extension should register subscriptions",
        );
        console.log(
          `✓ Extension loaded successfully from VSIX (${mockContext.subscriptions.length} subscriptions)`,
        );
      } finally {
        Module._load = originalLoad;
      }
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  });
  it("should not include test files in VSIX", async function () {
    const tempDir = path.join(rootDir, ".vsix-test-contents");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);
    try {
      await execAsync(`unzip -q "${vsixPath}" -d "${tempDir}"`);
      const extensionDir = path.join(tempDir, "extension");
      const testScriptPath = path.join(extensionDir, "test-vsix.sh");
      const testRequirePath = path.join(extensionDir, "test-require.js");
      const buildReportPath = path.join(extensionDir, "BUILD_REPORT.md");
      assert.ok(
        !fs.existsSync(testScriptPath),
        "test-vsix.sh should not be in VSIX",
      );
      assert.ok(
        !fs.existsSync(testRequirePath),
        "test-require.js should not be in VSIX",
      );
      assert.ok(
        !fs.existsSync(buildReportPath),
        "BUILD_REPORT.md should not be in VSIX",
      );
      const srcDir = path.join(extensionDir, "src");
      assert.ok(!fs.existsSync(srcDir), "src/ should not be in VSIX");
      console.log("✓ Test files correctly excluded from VSIX");
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  });
});
function createVSCodeMock() {
  const mockOutputChannel = {
    show: () => {},
    hide: () => {},
    dispose: () => {},
    appendLine: () => {},
    append: () => {},
    clear: () => {},
    replace: () => {},
    name: "ReAPK",
  };
  const mockConfiguration = {
    get: () => null,
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve(),
  };
  class StubClass {}
  const known: Record<string, unknown> = {
    window: {
      createOutputChannel: () => mockOutputChannel,
      showInformationMessage: () => Promise.resolve(),
      showErrorMessage: () => Promise.resolve(),
      showWarningMessage: () => Promise.resolve(),
      showQuickPick: () => Promise.resolve([]),
      showOpenDialog: () => Promise.resolve([]),
      showSaveDialog: () => Promise.resolve(),
      activeTextEditor: undefined,
      withProgress: (_options: unknown, task: unknown) => {
        const progress = {
          report: () => {},
        };
        const token = {
          isCancellationRequested: false,
          onCancellationRequested: () => {},
        };
        return (task as (...args: unknown[]) => unknown)(progress, token);
      },
    },
    workspace: {
      getConfiguration: () => mockConfiguration,
      workspaceFolders: [],
      onDidChangeConfiguration: () => ({
        dispose: () => {},
      }),
      onDidChangeWorkspaceFolders: () => ({
        dispose: () => {},
      }),
      onDidOpenTextDocument: () => ({
        dispose: () => {},
      }),
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
      }),
    },
    commands: {
      registerCommand: () => ({
        dispose: () => {},
      }),
      executeCommand: () => Promise.resolve(),
    },
    languages: {
      createDiagnosticCollection: () => ({
        set: () => {},
        delete: () => {},
        clear: () => {},
        dispose: () => {},
      }),
    },
    Uri: {
      file: (p: string) => ({
        fsPath: p,
        path: p,
        scheme: "file",
      }),
      parse: (str: string) => ({
        fsPath: str,
        path: str,
        scheme: "file",
      }),
    },
    ProgressLocation: {
      SourceControl: 1,
      Window: 10,
      Notification: 15,
    },
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: {},
    SymbolKind: {},
    CodeActionKind: {},
    DocumentHighlightKind: {},
    SignatureHelpTriggerKind: {},
    Disposable: StubClass,
    CallHierarchyItem: StubClass,
    CodeAction: StubClass,
    CodeLens: StubClass,
    CompletionItem: StubClass,
    Diagnostic: StubClass,
    DocumentLink: StubClass,
    InlayHint: StubClass,
    SymbolInformation: StubClass,
    TypeHierarchyItem: StubClass,
    EventEmitter: class {
      event = () => ({ dispose: () => {} });
      fire() {}
      dispose() {}
    },
    CancellationTokenSource: class {
      token = {};
      cancel() {}
      dispose() {}
    },
    CancellationToken: {
      None: {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      },
    },
  };
  return new Proxy(known, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === "__esModule") return false;
      if (typeof prop === "symbol") return undefined;
      return StubClass;
    },
  });
}
function createExtensionContext() {
  return {
    subscriptions: [] as unknown[],
    workspaceState: {
      get: () => undefined,
      update: () => Promise.resolve(),
    },
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
      keys: () => [],
    },
    extensionPath: __dirname,
    extensionUri: { fsPath: __dirname },
    environmentVariableCollection: {
      get: () => undefined,
      replace: () => {},
      append: () => {},
      prepend: () => {},
      clear: () => {},
    },
    extensionMode: 1,
    storagePath: "/tmp/storage",
    globalStoragePath: "/tmp/global-storage",
    logPath: "/tmp/logs",
    extension: {
      id: "xzyyysh.reapk",
      extensionPath: __dirname,
      isActive: true,
      packageJSON: {},
      exports: {},
    },
  };
}
