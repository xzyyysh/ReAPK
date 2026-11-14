import * as fs from "fs";
import * as cross_spawn from "cross-spawn";
import * as vscode from "vscode";
import { outputChannel } from "../core/constants";
interface ProcessOptions {
  name: string;
  report: string;
  command: string;
  args: string[];
  shouldExist?: string;
  onSuccess?: () => void | Promise<void>;
  shell?: boolean;
  cwd?: string;
}
export function executeProcess(processOptions: ProcessOptions): Thenable<void> {
  outputChannel.show();
  outputChannel.appendLine("-".repeat(processOptions.report.length));
  outputChannel.appendLine(processOptions.report);
  outputChannel.appendLine("-".repeat(processOptions.report.length));
  outputChannel.appendLine(
    `${processOptions.command} ${processOptions.args.join(" ")}`,
  );
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "ReAPK",
      cancellable: true,
    },
    (progress, token) => {
      return new Promise<void>((resolve) => {
        progress.report({ message: processOptions.report });
        const cp = cross_spawn.spawn(
          processOptions.command,
          processOptions.args,
          {
            shell: processOptions.shell,
            cwd: processOptions.cwd,
          },
        );
        cp.stdout.on("data", (data) =>
          outputChannel.appendLine(data.toString().trim()),
        );
        cp.stderr.on("data", (data) =>
          outputChannel.appendLine(data.toString().trim()),
        );
        cp.on("error", (data) => {
          outputChannel.appendLine(data.toString().trim());
          vscode.window.showErrorMessage(
            `ReAPK: ${processOptions.name} process failed.`,
          );
          resolve();
        });
        cp.on("exit", async (code) => {
          const expectedFileExists = processOptions.shouldExist
            ? fs.existsSync(processOptions.shouldExist)
            : true;
          if (code === 0 && expectedFileExists) {
            outputChannel.appendLine(
              `${processOptions.name} process was successful`,
            );
            vscode.window.showInformationMessage(
              `ReAPK: ${processOptions.name} process was successful.`,
            );
            if (processOptions.onSuccess) {
              await processOptions.onSuccess();
            }
          } else {
            const errorMsg =
              code !== 0
                ? `${processOptions.name} process exited with code ${code}`
                : `${processOptions.name} process didn't create ${processOptions.shouldExist}`;
            outputChannel.appendLine(errorMsg);
            vscode.window.showErrorMessage(
              `ReAPK: ${processOptions.name} process failed.`,
            );
          }
          resolve();
        });
        token.onCancellationRequested(() => {
          outputChannel.appendLine(
            `User canceled the ${processOptions.name} process`,
          );
          if (!cp.killed) {
            cp.kill();
          }
        });
      });
    },
  );
}
