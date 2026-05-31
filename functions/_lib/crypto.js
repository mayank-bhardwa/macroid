// Crypto helpers using the Web Crypto API (available in the Workers runtime).
// Passwords are hashed with PBKDF2-SHA256; tokens/ids are CSPRNG random.

const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

function toBase64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 128-bit random id (uuid-like, used for user ids).
export function randomId() {
  return crypto.randomUUID();
}

// 256-bit URL-safe random token (used for session tokens).
export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function pbkdf2(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

// Returns { hash, salt, iterations } — all strings safe to store.
export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return {
    hash: toBase64(hash),
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

// Constant-time comparison of two equal-length byte arrays.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, storedHash, storedSalt, iterations) {
  const saltBytes = fromBase64(storedSalt);
  const computed = await pbkdf2(password, saltBytes, iterations);
  const expected = fromBase64(storedHash);
  return timingSafeEqual(computed, expected);
}
