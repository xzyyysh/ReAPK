import { workspace } from "vscode";
import { extensionConfigName } from "../core/constants";
export function getJavaPath(): string {
  const config = workspace.getConfiguration(extensionConfigName);
  return config.get<string>("javaPath") || "java";
}
