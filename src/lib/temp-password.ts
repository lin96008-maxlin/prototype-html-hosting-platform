import { customAlphabet } from "nanoid";

const randomPassword = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%",
  14,
);

export function createTemporaryPassword() {
  return randomPassword();
}

export function temporaryPasswordExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
