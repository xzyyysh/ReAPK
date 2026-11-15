import * as fs from "fs";
import * as path from "path";
import { resolveAndroidPrefix } from "./dummy";
import { regexReplace } from "./regex";

export interface ManifestOptions {
  injectStamps: boolean;
  removeProperties: boolean;
}

export function rmSplitsMetaIsSplit(text: string, prefix: string): string {
  let out = regexReplace(
    text,
    `\\s+${prefix}:isSplitRequired="(false|true)"`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.vending\\.splits\\.required"\\s+${prefix}:value="(false|true)"\\s*/>`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.vending\\.splits"\\s+${prefix}:(value|resource)="[^"]+"\\s*/>`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.vending\\.derived\\.apk\\.id"\\s+${prefix}:value="\\d+"\\s*/>`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.stamp\\.source"\\s+${prefix}:(value|resource)="[^"]+"\\s*/>`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.stamp\\.type"\\s+${prefix}:(value|resource)="[^"]+"\\s*/>`,
    "",
  );
  out = regexReplace(
    out,
    `\\s+<meta-data\\s+${prefix}:name="com\\.android\\.dynamic\\.apk\\.fused\\.modules"\\s+${prefix}:(value|resource)="[^"]+"\\s*/>`,
    "",
  );
  return out;
}

export function rmSplitTypes(text: string): string {
  const androidPrefix = resolveAndroidPrefix(text);
  const distMatch = text.match(
    /\sxmlns:(\w+)="http:\/\/schemas\.android\.com\/apk\/distribution"/,
  );
  const distPrefix = distMatch ? distMatch[1] : androidPrefix;
  const prefixGroup = distMatch
    ? `(${distPrefix}:|${androidPrefix}:)?`
    : `(${androidPrefix}:)?`;
  let out = regexReplace(text, `\\s+${prefixGroup}splitTypes="[^"]*"`, "");
  out = regexReplace(out, `\\s+${prefixGroup}requiredSplitTypes="[^"]*"`, "");
  if (distMatch && !new RegExp(`\\s${distPrefix}:\\w+="[^"]*"`).test(out)) {
    out = regexReplace(
      out,
      `\\s+xmlns:${distPrefix}="http://schemas.android.com/apk/distribution"`,
      "",
    );
  }
  return out;
}

export function removePropertyTags(text: string, prefix: string): string {
  return regexReplace(
    text,
    `\\s+<property\\s+${prefix}:name="[^"]+"\\s+${prefix}:(value|resource)="[^"]*"\\s*/>`,
    "",
  );
}

export function findLocaleConfigName(
  text: string,
  prefix: string,
): string | null {
  const m = text.match(new RegExp(`\\s+${prefix}:localeConfig="@xml/([^"]+)"`));
  return m ? m[1] : null;
}

export function cleanManifest(
  manifestPath: string,
  options: ManifestOptions,
): string | null {
  const text = fs.readFileSync(manifestPath, "utf-8");
  const prefix = resolveAndroidPrefix(text);
  let out = text;
  const localeName = findLocaleConfigName(out, prefix);
  if (localeName !== null) {
    out = regexReplace(
      out,
      `\\s+${prefix}:localeConfig="@xml/${localeName}"`,
      "",
    );
  }
  out = rmSplitsMetaIsSplit(out, prefix);
  if (options.injectStamps) {
    const stampType = `\t<meta-data ${prefix}:name="com.android.stamp.type" ${prefix}:value="STAMP_TYPE_STANDALONE_APK" />\n\t</application>`;
    const fusedModules = `\t<meta-data ${prefix}:name="com.android.dynamic.apk.fused.modules" ${prefix}:value="base" />\n\t</application>`;
    out = regexReplace(out, "</application>", stampType);
    out = regexReplace(out, "</application>", fusedModules);
  }
  out = rmSplitTypes(out);
  if (options.removeProperties) {
    out = removePropertyTags(out, prefix);
  }
  fs.writeFileSync(manifestPath, out, "utf-8");
  return localeName;
}

export function findSplitsXmlName(manifestPath: string): string | null {
  const text = fs.readFileSync(manifestPath, "utf-8");
  const prefix = resolveAndroidPrefix(text);
  const m = text.match(
    new RegExp(
      `<meta-data\\s+${prefix}:name="com\\.android\\.vending\\.splits"\\s+${prefix}:(value|resource)="@xml/(splits\\d+)"\\s*/>`,
    ),
  );
  return m ? m[2] : null;
}

export function clearSplitMarker(dir: string): void {
  const manifestPath = path.join(dir, "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) {
    return;
  }
  const name = findSplitsXmlName(manifestPath);
  if (name === null) {
    return;
  }
  const xmlPath = path.join(dir, "res", "xml", `${name}.xml`);
  if (fs.existsSync(xmlPath)) {
    fs.rmSync(xmlPath);
  }
}
