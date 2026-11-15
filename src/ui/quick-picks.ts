import { QuickPickItem } from "vscode";
const quickPickItems: Record<string, QuickPickItem[]> = {
  aaptQuickPickItems: [
    {
      label: "aapt1",
      detail: "Build resources with aapt1 (more tolerant, Apktool M default)",
      alwaysShow: true,
    },
    {
      label: "aapt2",
      detail:
        "Build resources with aapt2 (stricter, required by some modern APKs)",
      alwaysShow: true,
    },
  ],
};
export namespace QuickPicks {
  export function getQuickPickItems(category: string): QuickPickItem[] {
    return quickPickItems[category];
  }
  export function setQuickPickDefault(category: string, label: string): void {
    if (quickPickItems[category]) {
      const targetOption = quickPickItems[category].filter(
        (x) => x.label === label,
      )[0];
      if (targetOption) {
        targetOption.picked = true;
      }
    }
  }
}
