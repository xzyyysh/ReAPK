export function regexReplace(
  text: string,
  pattern: string,
  replacement: string,
): string {
  return text.replace(
    new RegExp(pattern, "g"),
    replacement.replace(/\$/g, "$$$$"),
  );
}
