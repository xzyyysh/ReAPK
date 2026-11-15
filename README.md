# ReAPK

Android reverse engineering workbench for VS Code. Decode, analyze, modify and rebuild APK files without leaving the editor.

ReAPK integrates apktool, jadx, uber-apk-signer, smali-lsp, apk-mitm and frida behind a clean command surface. Tools are resolved from their official GitHub releases, so you always get the latest versions.

## Features

- Decode APK resources and dalvik bytecode with apktool
- Decompile to Java source with jadx into `java_src/`
- Smali syntax highlighting and language server integration
- Rebuild APKs from a decoded project directory
- Sign rebuilt APKs with uber-apk-signer
- Install APKs on a connected device with adb
- Generate Frida hooks from any smali method
- Inject a Frida gadget into the app entry point
- Patch APKs for HTTPS inspection with apk-mitm
- Initialize decoded projects as git repositories

## Tools

Managed tools are downloaded automatically into `~/.reapk` on first use. Versions are resolved from each project's official GitHub releases.

| Tool            | Source                     |
| --------------- | -------------------------- |
| apktool         | iBotPeaches/Apktool        |
| jadx            | skylot/jadx                |
| uber-apk-signer | patrickfav/uber-apk-signer |
| smali-lsp       | Surendrajat/smali-lsp      |

External tools are expected on the system PATH when you use the related features: java, adb, git, frida and node for apk-mitm.

Downloads honor the VS Code `http.proxy` setting or the `HTTPS_PROXY` environment variable.

## Usage

1. Install the extension and open the command palette
2. Run `ReAPK: Open an APK` and pick an APK file
3. Choose decode options in the QuickPick, for example `decompile_java`
4. Edit smali or Java sources in the generated project directory
5. Right click `apktool.yml` and run `ReAPK: Rebuild the APK`

## Commands

| Command                               | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `ReAPK: Open an APK`                  | Decode an APK into a project directory        |
| `ReAPK: Rebuild the APK`              | Rebuild an APK from `apktool.yml`             |
| `ReAPK: Rebuild and Install the APK`  | Rebuild and install on a device               |
| `ReAPK: Install the APK`              | Install an APK with adb                       |
| `ReAPK: Prepare for HTTPS inspection` | Apply apk-mitm patches                        |
| `ReAPK: Empty ApkTool Framework Dir`  | Clean the apktool framework cache             |
| `ReAPK: Update Tools`                 | Reinstall or update managed tools             |
| `ReAPK: Generate Frida Hook`          | Generate a hook from the current smali method |
| `ReAPK: Inject Frida Gadget`          | Inject a gadget library into the app          |

## Development

```
yarn install
yarn watch
yarn test
```

The bundle is built with esbuild. Tests run with mocha against a downloaded VS Code instance.

## License

MIT
