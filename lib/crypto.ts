// token encryption: AES-256-GCM, key from SF_ENCRYPTION_KEY (32 bytes, base64).
// ciphertext format: v1:<iv b64>:<ciphertext b64>:<auth tag b64>
// the database never sees plaintext tokens; nothing here ever logs key material.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = process.env.SF_ENCRYPTION_KEY;

export const isConfigured = Boolean(KEY_ENV);

function keyBytes(): Buffer {
  if (!KEY_ENV) throw new Error("SF_ENCRYPTION_KEY not set on the server");
  const raw = Buffer.from(KEY_ENV, "base64");
  if (raw.length !== 32) {
    throw new Error("SF_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)");
  }
  return raw;
}

export function encrypt(plaintext: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    body.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export function decrypt(encrypted: string): string {
  const key = keyBytes();
  const parts = encrypted.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("bad ciphertext format");
  }
  const [, ivB64, bodyB64, tagB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(bodyB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
