/**
 * Shared auth utilities for Cloudflare Pages Functions.
 *
 * Uses HMAC-SHA-256 to derive a session token from the admin secret.
 * The token is NOT the password itself, so storing it in localStorage
 * does not expose the underlying credential.
 */

const SESSION_LABEL = 'nav-admin-session-v1';

/**
 * Derives a deterministic session token from the admin secret.
 * @param {string} secret - Value of the ADMIN_TOKEN env var
 * @returns {Promise<string>} Base64-encoded HMAC-SHA-256 signature
 */
export async function generateSessionToken(secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(SESSION_LABEL)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verifies the Bearer token in the Authorization header using a
 * constant-time comparison to prevent timing-based attacks.
 *
 * @param {Request} request
 * @param {object} env - Cloudflare env bindings
 * @returns {Promise<boolean>}
 */
export async function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  if (!env.ADMIN_TOKEN) return false;

  const token = authHeader.slice(7);
  const expected = await generateSessionToken(env.ADMIN_TOKEN);
  return timingSafeEqual(token, expected);
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
