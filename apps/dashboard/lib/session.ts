const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function hmacKey() {
  const secret = process.env.AEGIS_ADMIN_TOKEN;
  if (!secret) throw new Error("Dashboard session signing secret is not configured");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function createSessionToken(username: string): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60
  })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return payload + "." + encodeBase64Url(new Uint8Array(signature));
}
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(), decodeBase64Url(parts[1]), encoder.encode(parts[0]));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { sub?: string; exp?: number };
    return Boolean(payload.sub && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}
