import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import ical from 'node-ical';

const TZ = () => process.env.CAL_TZ || 'Europe/Paris';
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
/** Intervalle entre deux imports automatiques (minutes). */
export const refreshMs = () => num(process.env.HP_REFRESH_MIN, 10) * 60e3;
/** Délai minimum entre deux imports pour un même étudiant, même demandés à la main (secondes). */
export const minGapMs = () => num(process.env.HP_MIN_GAP_SEC, 60) * 1e3;
const MAX_BYTES = 5 * 1024 * 1024;
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

/* ---------- Validation de l'URL (évite qu'on fasse appeler un réseau interne au serveur) ---------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('webcal://')) s = 'https://' + s.slice(9);
  let u;
  try { u = new URL(s); } catch { throw new Error("Ce lien n'est pas une adresse valide."); }
  if (u.protocol !== 'https:') throw new Error('Le lien iCal doit commencer par https://');
  if (u.username || u.password) throw new Error('Le lien ne doit pas contenir d\'identifiants.');
  return u.toString();
}

async function assertPublicHost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('Adresse non autorisée.');
  const addrs = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Adresse non autorisée.');
}

export async function fetchIcs(rawUrl, { fetchImpl = fetch, skipHostCheck = false } = {}) {
  let url = normalizeUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(url);
    if (!skipHostCheck) await assertPublicHost(u.hostname);
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar, */*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = normalizeUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`Hyperplanning a répondu ${res.status}. Vérifie que le lien iCal est toujours valide.`);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel(); throw new Error('Le fichier iCal est trop volumineux.'); }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error("Ce lien ne renvoie pas un calendrier iCal. Copie le lien d'export iCal d'Hyperplanning.");
    return text;
  }
  throw new Error('Trop de redirections.');
}

/* ---------- Conversion des VEVENT ---------- */
function localParts(d) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const textOf = (v) => (v && typeof v === 'object' && 'val' in v ? v.val : v) ?? '';

export function parseDescription(desc) {
  const out = {};
  String(desc || '').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^:]{2,30}?)\s*:\s*(.+)$/);
    if (m) out[m[1].trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] = m[2].trim();
  });
  return out;
}

export function guessType(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(ds|examen|exam|partiel|controle|evaluation|soutenance|qcm|rattrapage)\b/.test(t)) return 'eval';
  if (/\bsae\b|\bs\.a\.e\b|\bprojet tutore\b/.test(t)) return 'sae';
  if (/\b(stage|alternance|entreprise)\b/.test(t)) return 'stage';
  return 'cours';
}

export function toEvents(icsText, { now = new Date() } = {}) {
  const data = ical.sync.parseICS(icsText);
  const from = new Date(now.getTime() - 60 * 864e5);
  const to = new Date(now.getTime() + 365 * 864e5);
  const out = [];
  const push = (v, start, end, suffix = '') => {
    if (!(start instanceof Date) || Number.isNaN(+start)) return;
    if (start < from || start > to) return;
    const allDay = v.datetype === 'date';
    const s = localParts(start);
    const e = end instanceof Date && !Number.isNaN(+end) ? localParts(end) : s;
    const summary = String(textOf(v.summary)).trim();
    const info = parseDescription(textOf(v.description));
    const subject = info['matiere'] || info['matieres'] || info['cours'] || '';
    const kind = info['type'] || '';
    let title = subject || summary || 'Cours';
    if (kind && !title.toLowerCase().includes(kind.toLowerCase())) title = `${title} (${kind})`;
    const location = String(textOf(v.location) || info['salle'] || info['salles'] || '').trim().slice(0, 80);
    const hpInfo = [
      info['enseignant'] || info['enseignants'] ? `Enseignant : ${info['enseignant'] || info['enseignants']}` : '',
      info['td'] || info['groupe'] || info['groupes'] || info['promotion'] ? `Groupe : ${info['td'] || info['groupe'] || info['groupes'] || info['promotion']}` : '',
      info['memo'] ? `Mémo : ${info['memo']}` : '',
      summary && summary !== title ? summary : '',
    ].filter(Boolean).join('\n').slice(0, 1000);
    const uid = String(v.uid || summary + start.toISOString()) + suffix;
    const ev = {
      id: 'hp-' + sha(uid).slice(0, 24),
      title: title.slice(0, 120),
      type: guessType(`${summary} ${kind} ${subject}`),
      date: s.date,
      start: allDay ? '08:00' : s.time,
      end: allDay ? '18:00' : (e.date === s.date ? e.time : '23:59'),
      location,
      hpInfo,
    };
    if (ev.end < ev.start) ev.end = ev.start;
    ev.hpHash = sha(JSON.stringify([ev.title, ev.type, ev.date, ev.start, ev.end, ev.location, ev.hpInfo]));
    out.push(ev);
  };
  for (const v of Object.values(data)) {
    if (v.type !== 'VEVENT' || !v.start) continue;
    if (String(v.status || '').toUpperCase() === 'CANCELLED') continue;
    if (v.rrule) {
      const dur = (v.end ? +v.end : +v.start) - +v.start;
      for (const d of v.rrule.between(from, to, true)) push(v, d, new Date(+d + dur), '@' + d.toISOString());
    } else push(v, v.start, v.end);
  }
  return out;
}

/* ---------- Synchronisation d'un étudiant ---------- */
const inflight = new Map();

/**
 * Importe l'iCal d'un étudiant. Deux demandes simultanées partagent le même import,
 * et un import de moins de HP_MIN_GAP_SEC n'est pas relancé (sauf `force`, utilisé quand le lien change).
 */
export function syncUser(db, user, opts = {}) {
  const id = String(user._id);
  if (inflight.has(id)) return inflight.get(id);
  if (!opts.force && user.hpLastSync && Date.now() - user.hpLastSync < minGapMs()) {
    return Promise.resolve({ ok: !user.hpError, skipped: true, count: user.hpCount || 0, changed: 0, error: user.hpError || undefined });
  }
  const p = runSync(db, user, opts).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

async function runSync(db, user, opts) {
  const users = db.collection('users');
  const events = db.collection('events');
  try {
    const text = await fetchIcs(user.hpUrl, opts);
    const incoming = toEvents(text);
    const existing = await events.find({ userId: user._id, source: 'hp' }, { projection: { id: 1, hpHash: 1, date: 1, deleted: 1 } }).toArray();
    const byId = new Map(existing.map((e) => [e.id, e]));
    const now = Date.now();
    const ops = [];
    const seen = new Set();
    for (const ev of incoming) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const old = byId.get(ev.id);
      if (old && old.hpHash === ev.hpHash) continue;
      ops.push({
        updateOne: {
          filter: { userId: user._id, id: ev.id },
          update: {
            $set: { ...ev, source: 'hp', serverUpdatedAt: now, updatedAt: now },
            $setOnInsert: { notes: '', alarm: 10, alarms: [10], repeat: 'none', until: '', skip: [], done: false, deleted: false },
          },
          upsert: true,
        },
      });
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const old of existing) {
      if (!seen.has(old.id) && !old.deleted && old.date >= today) {
        ops.push({ updateOne: { filter: { userId: user._id, id: old.id }, update: { $set: { deleted: true, serverUpdatedAt: now, updatedAt: now } } } });
      }
    }
    if (ops.length) await events.bulkWrite(ops, { ordered: false });
    await users.updateOne({ _id: user._id }, { $set: { hpLastSync: now, hpError: null, hpCount: seen.size } });
    return { ok: true, count: seen.size, changed: ops.length };
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'Hyperplanning ne répond pas (délai dépassé).' : err.message;
    await users.updateOne({ _id: user._id }, { $set: { hpLastSync: Date.now(), hpError: message } });
    return { ok: false, error: message };
  }
}

/** Relance régulière : chaque minute, importe les étudiants dont le dernier import date de plus de HP_REFRESH_MIN. */
export function startScheduler(db, { everyMs = 60e3, staleMs = refreshMs() } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const list = await db.collection('users')
        .find({ hpUrl: { $type: 'string' }, $or: [{ hpLastSync: { $lt: Date.now() - staleMs } }, { hpLastSync: null }] })
        .sort({ hpLastSync: 1 }).limit(50).toArray();
      for (const u of list) await syncUser(db, u);
    } catch (e) {
      console.error('[hyperplanning] planificateur :', e.message);
    } finally {
      running = false;
    }
  };
  const t = setInterval(run, everyMs);
  t.unref?.();
  setTimeout(run, 5000).unref?.();
  return () => clearInterval(t);
}
