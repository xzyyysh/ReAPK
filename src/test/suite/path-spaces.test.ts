import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { apktool } from "../../tools/apktool";
import { jadx } from "../../tools/jadx";
import { checkAndInstallTools } from "../../core/updater";
import { reapkDataDir } from "../../core/constants";
describe("Path Handling - Spaces in Paths", function () {
  this.timeout(300000);
  const testDataDir = path.resolve(__dirname, "../../../testdata");
  const simpleKeyboardDir = path.join(testDataDir, "simplekeyboard");
  const testDirWithSpaces = path.join(testDataDir, "test with spaces");
  before("Install tools and setup test directory", async function () {
    if (!fs.existsSync(reapkDataDir)) {
      fs.mkdirSync(reapkDataDir);
    }
    if (!fs.existsSync(testDirWithSpaces)) {
      fs.mkdirSync(testDirWithSpaces, { recursive: true });
    }
    console.log("Installing the tools...");
    await checkAndInstallTools()
      .then(() => {
        console.log("Tools Installed!");
      })
      .catch(() => {
        assert.fail("Failed to install tools!");
      });
  });
  after("Cleanup test directory", function () {
    if (fs.existsSync(testDirWithSpaces)) {
      fs.rmSync(testDirWithSpaces, { recursive: true });
    }
  });
  afterEach("Clearing output directories", function () {
    const projectDir = path.join(testDirWithSpaces, "test project");
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
    }
  });
  it("Decode APK with spaces in directory path", async function () {
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(testDirWithSpaces, "test.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(testDirWithSpaces, "test project");
    console.log(`Decoding ${targetApk} into ${projectDir}...`);
    await apktool.decodeAPK(targetApk, projectDir, []);
    const apktoolYmlPath = path.join(projectDir, "apktool.yml");
    if (!fs.existsSync(apktoolYmlPath)) {
      assert.fail(`File ${apktoolYmlPath} not found!`);
    }
    console.log("✓ Successfully decoded APK with spaces in path");
  });
  it("Decode APK with spaces in filename", async function () {
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(testDirWithSpaces, "test file with spaces.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(testDirWithSpaces, "test file with spaces");
    console.log(`Decoding ${targetApk} into ${projectDir}...`);
    await apktool.decodeAPK(targetApk, projectDir, []);
    const apktoolYmlPath = path.join(projectDir, "apktool.yml");
    if (!fs.existsSync(apktoolYmlPath)) {
      assert.fail(`File ${apktoolYmlPath} not found!`);
    }
    console.log("✓ Successfully decoded APK with spaces in filename");
  });
  it("Decompile APK with spaces in path", async function () {
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(testDirWithSpaces, "test.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(testDirWithSpaces, "test project");
    fs.mkdirSync(projectDir, { recursive: true });
    console.log(`Decompiling ${targetApk} into ${projectDir}...`);
    await jadx.decompileAPK(targetApk, projectDir, []);
    const javaSrcDir = path.join(projectDir, "java_src");
    if (!fs.existsSync(javaSrcDir)) {
      assert.fail(`Directory ${javaSrcDir} not found!`);
    }
    console.log("✓ Successfully decompiled APK with spaces in path");
  });
  it("Rebuild APK from directory with spaces", async function () {
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(testDirWithSpaces, "test.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(testDirWithSpaces, "test project");
    console.log(`Decoding ${targetApk}...`);
    await apktool.decodeAPK(targetApk, projectDir, []);
    const apktoolYmlPath = path.join(projectDir, "apktool.yml");
    console.log(`Rebuilding from ${apktoolYmlPath}...`);
    await apktool.rebuildAPK(apktoolYmlPath, []);
    const outApkPath = path.join(projectDir, "dist", "test.apk");
    if (!fs.existsSync(outApkPath)) {
      assert.fail(`Rebuilt APK ${outApkPath} not found!`);
    }
    console.log("✓ Successfully rebuilt APK from directory with spaces");
  });
  it("Handle deeply nested path with multiple spaces", async function () {
    const deepDir = path.join(
      testDirWithSpaces,
      "level one",
      "level two",
      "level three",
    );
    fs.mkdirSync(deepDir, { recursive: true });
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(deepDir, "test.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(deepDir, "test project");
    console.log(`Decoding ${targetApk} into ${projectDir}...`);
    await apktool.decodeAPK(targetApk, projectDir, []);
    const apktoolYmlPath = path.join(projectDir, "apktool.yml");
    if (!fs.existsSync(apktoolYmlPath)) {
      assert.fail(`File ${apktoolYmlPath} not found!`);
    }
    console.log("✓ Successfully handled deeply nested path with spaces");
    const topLevelDir = path.join(testDirWithSpaces, "level one");
    if (fs.existsSync(topLevelDir)) {
      fs.rmSync(topLevelDir, { recursive: true });
    }
  });
  it("Handle special characters in path (Windows-safe)", async function () {
    const specialDir = path.join(testDirWithSpaces, "test (with) special");
    fs.mkdirSync(specialDir, { recursive: true });
    const sourceApk = path.resolve(simpleKeyboardDir, "test.apk");
    const targetApk = path.join(specialDir, "test.apk");
    fs.copyFileSync(sourceApk, targetApk);
    const projectDir = path.join(specialDir, "test project");
    console.log(`Decoding ${targetApk} into ${projectDir}...`);
    await apktool.decodeAPK(targetApk, projectDir, []);
    const apktoolYmlPath = path.join(projectDir, "apktool.yml");
    if (!fs.existsSync(apktoolYmlPath)) {
      assert.fail(`File ${apktoolYmlPath} not found!`);
    }
    console.log("✓ Successfully handled special characters in path");
    if (fs.existsSync(specialDir)) {
      fs.rmSync(specialDir, { recursive: true });
    }
  });
});
