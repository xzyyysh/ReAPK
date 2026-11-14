import * as fs from "fs";
export function findMainActivity(manifestPath: string): string | null {
  const content = fs.readFileSync(manifestPath, "utf-8");
  const activityRegex =
    /<activity[^>]*android:name="([^"]+)"[^]*?<\/activity>/g;
  let match: RegExpExecArray | null;
  while ((match = activityRegex.exec(content)) !== null) {
    const block = match[0];
    const activityName = match[1];
    const hasMainAction = block.includes("android.intent.action.MAIN");
    const hasLauncherCategory = block.includes(
      "android.intent.category.LAUNCHER",
    );
    if (hasMainAction && hasLauncherCategory) {
      return resolveActivityName(content, activityName);
    }
  }
  return null;
}
function resolveActivityName(
  manifestContent: string,
  activityName: string,
): string {
  if (!activityName.startsWith(".")) {
    if (!activityName.includes(".")) {
      const pkg = getPackageName(manifestContent);
      return pkg ? `${pkg}.${activityName}` : activityName;
    }
    return activityName;
  }
  const pkg = getPackageName(manifestContent);
  return pkg ? `${pkg}${activityName}` : activityName;
}
function getPackageName(manifestContent: string): string | null {
  const match = manifestContent.match(/<manifest[^>]*package="([^"]+)"/);
  return match ? match[1] : null;
}
