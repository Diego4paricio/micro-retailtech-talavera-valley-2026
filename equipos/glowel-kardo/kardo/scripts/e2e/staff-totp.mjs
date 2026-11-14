// Prints the current 6-digit TOTP code of the E2E staff account
// (e2e-staff@kardo.test, created by prepare-staff.mjs) so a person can sign
// in to Kardo Operations locally. Never prints the secret itself.
// Usage: node scripts/e2e/staff-totp.mjs
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const secret = fs
  .readFileSync(path.join(root, ".env"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("E2E_STAFF_TOTP_SECRET="))
  ?.slice("E2E_STAFF_TOTP_SECRET=".length)
  .trim();
if (!secret) {
  console.error("Falta E2E_STAFF_TOTP_SECRET en .env: ejecuta primero node scripts/e2e/prepare-staff.mjs");
  process.exit(1);
}

function totp(base32Secret, time) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid base32 secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const now = Date.now();
const secondsLeft = 30 - (Math.floor(now / 1000) % 30);
console.log(`Código TOTP de e2e-staff@kardo.test: ${totp(secret, now)} (vence en ${secondsLeft} s)`);
