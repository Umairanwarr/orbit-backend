import crypto from "crypto";

const ALG = "aes-256-gcm";

export function encryptBuffer(
  plaintext: Buffer,
  secret: string,
): { payload: Buffer; meta: { iv: string; salt: string; tag: string } } {
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    payload: enc,
    meta: {
      iv: iv.toString("base64"),
      salt: salt.toString("base64"),
      tag: tag.toString("base64"),
    },
  };
}

export function decryptBuffer(
  payload: Buffer,
  secret: string,
  meta: { iv: string; salt: string; tag: string },
): Buffer {
  const iv = Buffer.from(meta.iv, "base64");
  const salt = Buffer.from(meta.salt, "base64");
  const tag = Buffer.from(meta.tag, "base64");
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

