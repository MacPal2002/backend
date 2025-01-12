const SECRET = 'your-secret-key';

// Importowanie klucza jako CryptoKey
export const secretKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);
