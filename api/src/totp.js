import crypto from 'node:crypto';

/* Double authentification par application (TOTP, RFC 6238) : codes à 6 chiffres renouvelés toutes les 30 s.
   Compatible Google Authenticator, Aegis, 2FAS, Microsoft Authenticator, 1Password… */

export const ISSUER = 'Agend-A';
const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

/** Code attendu pour un pas de temps donné. */
export function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

/**
 * Vérifie un code en tolérant une période d'écart (horloge du téléphone un peu décalée).
 * Renvoie le pas de temps reconnu, ou null. `afterStep` refuse un code déjà utilisé (rejeu).
 */
export function verifyTotp(secret, code, { now = Date.now(), afterStep = -1 } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const cur = stepAt(now);
  for (const s of [cur - 1, cur, cur + 1]) {
    if (s <= afterStep) continue;
    const exp = hotp(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUrl = (secret, email) =>
  `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP}`;

/* ---------- Secret chiffré en base (AES-256-GCM) ---------- */
const keyFrom = (s) => crypto.createHash('sha256').update('agenda-totp:' + s).digest();

export function seal(secret, keySource) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(keySource), iv);
  const data = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function unseal(box, keySource) {
  const [iv, tag, data] = box.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(keySource), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/* ---------- Codes de secours (usage unique) ---------- */
export const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z2-7]/g, '')).digest('hex');

export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const s = base32Encode(crypto.randomBytes(7)).slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Un code de secours ressemble à « ABCDE-FGH23 » ; un code d'appli à 6 chiffres. */
export const looksLikeRecovery = (code) => String(code || '').replace(/[^A-Za-z2-7]/g, '').length === 10;
