import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../core/constants";
import { executeProcess } from "../core/executor";
export namespace git {
  export async function initGitDir(
    projectDir: string,
    commitMsg: string,
  ): Promise<void> {
    if (!projectDir || !fs.existsSync(projectDir)) {
      outputChannel.appendLine(
        `Error: Project directory does not exist: ${projectDir}`,
      );
      return;
    }
    if (!commitMsg || commitMsg.trim().length === 0) {
      commitMsg = "Initial commit";
    }
    try {
      const gitignore = "/build\n/dist\n";
      await fs.promises.writeFile(
        path.join(projectDir, ".gitignore"),
        gitignore,
      );
      let initCmd = `git init && git config core.safecrlf false`;
      initCmd += ` && git add -A && git commit -q -m "${commitMsg}"`;
      const report = `Initializing ${projectDir} as Git repository`;
      await executeProcess({
        name: "Initializing Git",
        report: report,
        command: initCmd,
        args: [],
        shell: true,
        cwd: projectDir,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(
        `Error: Initializing project dir as Git repository: ${errorMessage}`,
      );
    }
  }
}
