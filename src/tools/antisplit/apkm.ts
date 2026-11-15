import * as fs from "fs";
import * as path from "path";

const MEM_LIMIT = 0x20000000;
const PASSPHRASE = "#$%@#dfas4d00fFSDF9GSD56$^53$%7WRGF3dzzqasD!@";

function isZipFile(file: string): boolean {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  const sig = buf.readUInt32LE(0);
  return sig === 0x04034b50 || sig === 0x06054b50 || sig === 0x08074b50;
}

export function isApkmEncrypted(file: string): boolean {
  try {
    return !isZipFile(file);
  } catch {
    return false;
  }
}

export async function decryptApkm(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const sodium = await import("libsodium-wrappers-sumo");
  await sodium.ready;
  const data = fs.readFileSync(inputPath);
  let off = 1;
  const alg = data[off];
  off += 1;
  if (alg !== 1 && alg !== 2) {
    throw new Error("invalid apkm encryption algorithm");
  }
  const algo =
    alg === 1
      ? sodium.crypto_pwhash_ALG_ARGON2I13
      : sodium.crypto_pwhash_ALG_ARGON2ID13;
  const opsLimit = Number(data.readBigUInt64LE(off));
  off += 8;
  const memLimit = Number(data.readBigUInt64LE(off));
  off += 8;
  if (memLimit === 0 || memLimit > MEM_LIMIT) {
    throw new Error("invalid apkm memlimit");
  }
  const chunkSize = Number(data.readBigUInt64LE(off));
  off += 8;
  const salt = data.subarray(off, off + 16);
  off += 16;
  const header = data.subarray(off, off + 24);
  off += 24;
  const key = sodium.crypto_pwhash(
    32,
    PASSPHRASE,
    salt,
    opsLimit,
    memLimit,
    algo,
  );
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
    header,
    key,
  );
  const chunks: Buffer[] = [];
  const chunkSizePlusPadding = chunkSize + 0x11;
  while (off < data.length) {
    const cipherChunk = data.subarray(
      off,
      Math.min(off + chunkSizePlusPadding, data.length),
    );
    off += cipherChunk.length;
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(
      state,
      cipherChunk,
      null,
    );
    if (!result) {
      throw new Error("apkm decryption failed: corrupted chunk");
    }
    chunks.push(Buffer.from(result.message));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
}
