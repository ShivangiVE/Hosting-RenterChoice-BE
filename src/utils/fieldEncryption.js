const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; 

function getKey() {
  const keyHex = process.env.PAYMENT_INFO_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "PAYMENT_INFO_ENCRYPTION_KEY is not set in the environment.",
    );
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "PAYMENT_INFO_ENCRYPTION_KEY must be a 32-byte value (64 hex characters).",
    );
  }
  return key;
}

function encryptField(plainText) {
  if (plainText === undefined || plainText === null || plainText === "") {
    return null;
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // store iv + authTag + ciphertext together, colon-separated, base64 encoded
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptField(payload) {
  if (!payload) return null;
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Malformed encrypted payload.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = { encryptField, decryptField };
