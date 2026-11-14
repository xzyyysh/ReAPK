import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { outputChannel, APKTOOL_YML_FILENAME } from "../../core/constants";
import {
  SmaliMethod,
  smaliTypeToJava,
  parseMethodFromLine,
  getClassNameFromDocument,
} from "./smali";

export const FRIDA_HOOKS_FILENAME = "frida_hooks.ts";

function generateFridaHook(method: SmaliMethod): string {
  const javaParams = method.paramTypes.map(smaliTypeToJava);
  const javaReturn = smaliTypeToJava(method.returnType);
  const overloadArgs = javaParams.map((p) => `'${p}'`).join(", ");
  const hookParams = method.paramTypes.map((_, i) => `arg${i}`).join(", ");
  if (method.isConstructor && method.methodName === "<init>") {
    return `
// Hook: ${method.className}.<init>(${javaParams.join(", ")})
Java.perform(() => {
    const cls = Java.use('${method.className}');
    cls.$init.overload(${overloadArgs}).implementation = function(${hookParams}) {
        console.log(\`[*] ${method.className}.<init> called\`);
${javaParams
  .map((_, i) => `        console.log(\`    arg${i}: \${arg${i}}\`);`)
  .join("\n")}
        return this.$init(${hookParams});
    };
});
`.trim();
  }
  const returnLine =
    javaReturn === "void"
      ? `this.${method.methodName}(${hookParams});`
      : `const ret = this.${method.methodName}(${hookParams});\n        console.log(\`    ret: \${ret}\`);\n        return ret;`;
  return `
// Hook: ${method.className}.${method.methodName}(${javaParams.join(", ")}): ${javaReturn}
Java.perform(() => {
    const cls = Java.use('${method.className}');
    cls.${method.methodName}.overload(${overloadArgs}).implementation = function(${hookParams}) {
        console.log(\`[*] ${method.className}.${method.methodName} called\`);
${javaParams
  .map((_, i) => `        console.log(\`    arg${i}: \${arg${i}}\`);`)
  .join("\n")}
        ${returnLine}
    };
});
`.trim();
}

function findProjectRoot(filePath: string): string | null {
  let dir = path.dirname(filePath);
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

export async function generateHook(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "smali") {
    vscode.window.showWarningMessage(
      "ReAPK: Open a .smali file to generate Frida hooks.",
    );
    return;
  }
  const document = editor.document;
  const line = document.lineAt(editor.selection.active.line);
  const lineText = line.text.trim();
  let methodLine = lineText;
  if (!methodLine.startsWith(".method ")) {
    for (let i = editor.selection.active.line; i >= 0; i--) {
      const l = document.lineAt(i).text.trim();
      if (l.startsWith(".method ")) {
        methodLine = l;
        break;
      }
      if (l.startsWith(".end method") && i < editor.selection.active.line) {
        break;
      }
    }
  }
  if (!methodLine.startsWith(".method ")) {
    vscode.window.showWarningMessage(
      "ReAPK: Place cursor on or inside a .method to generate a Frida hook.",
    );
    return;
  }
  const className = getClassNameFromDocument(document);
  const method = parseMethodFromLine(methodLine, className);
  if (!method) {
    vscode.window.showWarningMessage(
      "ReAPK: Could not parse method signature.",
    );
    return;
  }
  const hookCode = generateFridaHook(method);
  const projectRoot = findProjectRoot(document.uri.fsPath);
  if (!projectRoot) {
    vscode.window.showWarningMessage("ReAPK: No APKTool project found.");
    return;
  }
  const hooksFile = path.join(projectRoot, FRIDA_HOOKS_FILENAME);
  const separator = fs.existsSync(hooksFile) ? "\n\n" : "";
  const existing = fs.existsSync(hooksFile)
    ? fs.readFileSync(hooksFile, "utf-8")
    : "";
  fs.writeFileSync(hooksFile, existing + separator + hookCode + "\n");
  const doc = await vscode.workspace.openTextDocument(hooksFile);
  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
  outputChannel.appendLine(
    `Frida: Generated hook for ${method.className}.${method.methodName}`,
  );
  vscode.window.showInformationMessage(
    `Frida hook generated for ${method.methodName}`,
  );
}

export { generateFridaHook };
