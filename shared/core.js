/*
 * Noyau partagé d'Agend-A : dates, récurrences, ajout rapide, alarmes et synchronisation.
 * Ce fichier est copié tel quel dans desktop/web/core.js et mobile/src/core.js
 * par `node scripts/sync-core.mjs` (à la racine). Modifie-le ici, pas dans les copies.
 */

/* ---------- Constantes ---------- */
export const TYPES = {
  cours: { label: 'Cours', alarms: [10] },
  sae: { label: 'SAÉ', alarms: [15] },
  rendu: { label: 'Rendu', alarms: [10080, 1440] },
  eval: { label: 'Évaluation', alarms: [10080, 60] },
  stage: { label: 'Stage, alternance', alarms: [60] },
  perso: { label: 'Perso', alarms: [30] },
};
export const ALARMS = [
  [null, 'Aucune'], [0, "À l'heure"], [5, '5 min avant'], [10, '10 min avant'], [15, '15 min avant'],
  [30, '30 min avant'], [60, '1 h avant'], [120, '2 h avant'], [1440, 'La veille (24 h avant)'], [10080, '1 semaine avant'],
];
export const MAX_ALARMS = 4;
const SHORT = { 0: "à l'heure", 1440: 'la veille', 10080: '1 semaine avant' };
export const alarmLabel = (a) => (ALARMS.find((x) => x[0] === a) || [a, a == null ? 'Aucune' : `${a} min avant`])[1];
/** Liste des rappels d'un événement (anciens événements : champ `alarm` unique). Triée du plus tôt au plus tard. */
export const alarmsOf = (ev) => {
  const raw = Array.isArray(ev.alarms) ? ev.alarms : (ev.alarm == null || ev.alarm === '' ? [] : [ev.alarm]);
  return [...new Set(raw.map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => b - a);
};
/** « 1 semaine avant + la veille » */
export const alarmsLabel = (ev) => {
  const l = alarmsOf(ev);
  if (!l.length) return 'Aucune alarme';
  return l.map((a) => SHORT[a] || alarmLabel(a).replace(' avant', '')).join(' + ') + (l.every((a) => SHORT[a]) ? '' : ' avant');
};
/** Ajoute ou retire un rappel de la liste. */
export const toggleAlarm = (list, a) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a].sort((x, y) => y - x).slice(0, MAX_ALARMS));
export const defaultAlarms = (type) => [...(TYPES[type]?.alarms || [])];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const WD = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const WDS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/* ---------- Dates ---------- */
export const pad = (n) => String(n).padStart(2, '0');
export const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
export const wdIdx = (d) => (d.getDay() + 6) % 7;
export const sow = (d) => addDays(d, -wdIdx(d));
export const today0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
export const toMin = (s) => { if (!s) return 0; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
export const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const at = (k, min) => { const d = fromKey(k); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d; };
export const dayDiff = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
export const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
export const semester = (d) => { const m = d.getMonth(); return (m >= 8 || m === 0) ? 'S5' : 'S6'; };
export const rel = (ms) => { const m = Math.round(ms / 60000); if (m < 1) return "moins d'une minute"; if (m < 60) return `${m} min`; const h = Math.floor(m / 60), mm = m % 60; if (h < 24) return mm ? `${h} h ${pad(mm)}` : `${h} h`; const d = Math.floor(h / 24), hh = h % 24; return hh ? `${d} j ${hh} h` : `${d} j`; };
export const niceDate = (k) => { const d = fromKey(k); const diff = Math.round((d - today0()) / 864e5); if (diff === 0) return "aujourd'hui"; if (diff === 1) return 'demain'; if (diff === -1) return 'hier'; return `${WDS[wdIdx(d)]} ${d.getDate()} ${MSHORT[d.getMonth()]}`; };
export const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const snap = (m) => Math.round(m / 15) * 15;
export const isPoint = (o) => o.e <= o.s;

/* ---------- Occurrences ---------- */
export const mk = (ev, k, s, e) => ({ ev, date: k, s, e, oid: ev.id + '|' + k });

/** Occurrences des événements entre `from` (inclus) et `to` (exclu), triées. `hidden` : types masqués. */
export function occurrences(events, from, to, hidden) {
  const out = [], fk = key(from), tk = key(to);
  for (const ev of events) {
    if (ev.deleted || (hidden && hidden.has(ev.type))) continue;
    const s = toMin(ev.start), e = Math.max(toMin(ev.end || ev.start), s);
    if (ev.repeat === 'weekly') {
      let d = fromKey(ev.date);
      const until = ev.until ? fromKey(ev.until) : addDays(to, 1);
      if (d < from) { const w = Math.floor(Math.round((from - d) / 864e5) / 7); d = addDays(d, w * 7); }
      let guard = 0;
      while (d < to && d <= until && guard++ < 600) {
        const k = key(d);
        if (d >= from && !(ev.skip || []).includes(k)) out.push(mk(ev, k, s, e));
        d = addDays(d, 7);
      }
    } else if (ev.date >= fk && ev.date < tk) out.push(mk(ev, ev.date, s, e));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.s - b.s);
}

export function findOcc(events, oid) {
  const i = oid.lastIndexOf('|');
  const id = oid.slice(0, i), k = oid.slice(i + 1);
  const ev = events.find((e) => e.id === id && !e.deleted);
  if (!ev) return null;
  const s = toMin(ev.start);
  return mk(ev, k, s, Math.max(toMin(ev.end || ev.start), s));
}

/** Colonnes pour les événements qui se chevauchent dans une journée : ajoute lane (colonne) et n (nb de colonnes). */
export function layoutDay(arr) {
  arr.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], end = -1;
  const flush = () => { const n = Math.max(...cluster.map((o) => o.lane)) + 1; cluster.forEach((o) => { o.n = n; }); cluster = []; };
  for (const o of arr) {
    const oe = isPoint(o) ? o.s + 30 : Math.max(o.e, o.s + 20);
    if (cluster.length && o.s >= end) { flush(); end = -1; }
    const ends = [];
    cluster.forEach((c) => { ends[c.lane] = Math.max(ends[c.lane] || 0, c._e); });
    let lane = 0;
    while (ends[lane] != null && ends[lane] > o.s) lane++;
    o.lane = lane; o._e = oe; cluster.push(o); end = Math.max(end, oe);
  }
  if (cluster.length) flush();
  return arr;
}

/** Prochain événement (en cours ou à venir) dans les 21 jours. */
export function nextOccurrence(events, hidden, now = Date.now()) {
  const t = today0();
  return occurrences(events, t, addDays(t, 21), hidden).find((o) => {
    const st = at(o.date, o.s).getTime(), en = at(o.date, o.e).getTime();
    return isPoint(o) ? st > now && !o.ev.done : en > now;
  }) || null;
}

/** Rendus et évaluations à venir (non terminés). */
export function upcomingDeadlines(events, days = 45, now = Date.now()) {
  const t = today0();
  return occurrences(events, t, addDays(t, days)).filter((o) => (o.ev.type === 'rendu' || o.ev.type === 'eval') && !o.ev.done && at(o.date, o.s).getTime() > now);
}

/** Alarmes à programmer : { key, fireAt, occ } entre maintenant et `days` jours. */
export function upcomingAlarms(events, days = 14, now = Date.now()) {
  const t = today0();
  const out = [];
  // La fenêtre d'occurrences va plus loin que l'horizon : un rappel « 1 semaine avant » vise un événement 7 jours plus tard.
  for (const o of occurrences(events, addDays(t, -1), addDays(t, days + 9))) {
    if (o.ev.done) continue;
    for (const a of alarmsOf(o.ev)) {
      const fireAt = at(o.date, o.s).getTime() - a * 60000;
      if (fireAt < now - 10 * 60000 || fireAt > now + days * 864e5) continue;
      out.push({ key: `${o.oid}@${a}@${o.ev.start}`, fireAt, lead: a, occ: o });
    }
  }
  return out.sort((x, y) => x.fireAt - y.fireAt);
}

/* ---------- Ajout rapide en langage naturel ---------- */
const KW = {
  rendu: ['rendu', 'rendre', 'deadline', 'dépôt', 'depot', 'livrable', 'remise'],
  eval: ['partiel', 'exam', 'examen', 'éval', 'eval', 'évaluation', 'evaluation', 'soutenance', 'oral', 'qcm', 'contrôle', 'controle', 'ds'],
  sae: ['saé', 'sae', 'projet'],
  stage: ['stage', 'alternance', 'entretien', 'entreprise', 'agence', 'tuteur'],
  cours: ['cm', 'td', 'tp', 'cours', 'amphi', 'anglais', 'ressource'],
};
export function parseQuick(txt, now = new Date()) {
  let s = ' ' + txt.trim() + ' ';
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = null, start = null, end = null, loc = '', alarm;
  const rm = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
  let m;
  if (rm(/\s(aujourd'hui|aujourd’hui|auj)\s/i)) date = t;
  else if (rm(/\sapr[eè]s[- ]demain\s/i)) date = addDays(t, 2);
  else if (rm(/\sdemain\s/i)) date = addDays(t, 1);
  else if ((m = rm(/\s(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s+prochain)?\s/i))) { const i = WD.indexOf(m[1].toLowerCase()); let diff = (i - wdIdx(t) + 7) % 7; if (m[2]) diff = diff || 7; date = addDays(t, diff); }
  else if ((m = rm(/\s(?:le\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/i))) { const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : t.getFullYear(); date = new Date(y, Number(m[2]) - 1, Number(m[1])); if (!m[3] && date < t) date = new Date(y + 1, Number(m[2]) - 1, Number(m[1])); }
  else if ((m = rm(/\sle\s(\d{1,2})(?:er)?(?:\s(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre))?\s/i))) {
    const mo = m[2] ? MONTHS.indexOf(m[2].toLowerCase().replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre')) : t.getMonth();
    date = new Date(t.getFullYear(), mo, Number(m[1]));
    if (date < t) date = m[2] ? new Date(t.getFullYear() + 1, mo, Number(m[1])) : new Date(t.getFullYear(), t.getMonth() + 1, Number(m[1]));
  }
  if ((m = rm(/\s(?:rappel|alarme)\s(\d+)\s?(min|h|j|sem|semaines?)?(?:\savant)?\s/i))) { const n = Number(m[1]); const u = (m[2] || '').toLowerCase(); alarm = u === 'h' ? n * 60 : u === 'j' ? n * 1440 : u.startsWith('sem') ? n * 10080 : n; alarm = Math.min(alarm, 10080); }
  if ((m = rm(/\s(?:de\s|à\s|a\s)?(\d{1,2})\s?[h:]\s?(\d{2})?\s*(?:-|–|à|a|jusqu'à)\s*(\d{1,2})\s?[h:]\s?(\d{2})?\s/i))) { if (+m[1] < 24 && +m[3] < 24) { start = +m[1] * 60 + (+m[2] || 0); end = +m[3] * 60 + (+m[4] || 0); } }
  else if ((m = rm(/\s(?:à\s|a\s|vers\s|pour\s)?(\d{1,2})\s?[h:]\s?(\d{2})?\s/i))) { if (+m[1] < 24) start = +m[1] * 60 + (+m[2] || 0); }
  if ((m = rm(/\s((?:salle|amphi|labo|bâtiment|batiment)\s+[\wÀ-ÿ.-]+)\s/i))) loc = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  else if ((m = rm(/\s@(\S+)\s/))) loc = m[1];
  const words = s.toLowerCase().split(/[\s,.;:!?()'’]+/).filter(Boolean);
  let type = 'perso';
  for (const k of ['rendu', 'eval', 'sae', 'stage', 'cours']) { if (words.some((w) => KW[k].includes(w))) { type = k; break; } }
  let title = s.replace(/\s+/g, ' ').trim();
  title = title ? title.charAt(0).toUpperCase() + title.slice(1) : TYPES[type].label;
  if (!date) date = t;
  if (start == null) {
    if (type === 'rendu') start = 23 * 60 + 59;
    else if (key(date) === key(t)) start = Math.min(22 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 60) * 60);
    else start = 9 * 60;
  }
  if (end == null || end <= start) end = type === 'rendu' ? start : Math.min(start + 60, 23 * 60 + 59);
  if (type === 'rendu') end = start;
  return { id: uid(), title: title.slice(0, 120), type, date: key(date), start: fmtMin(start), end: fmtMin(end), location: loc, notes: '', alarms: alarm !== undefined ? [alarm] : defaultAlarms(type), repeat: 'none', until: '', skip: [], done: false };
}

/** Valide un événement avant enregistrement. Renvoie un message d'erreur ou null. */
export function validateEvent(ev) {
  if (!ev.title || !ev.title.trim()) return "Donne un intitulé à l'événement.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) return 'Choisis une date.';
  if (!/^\d{2}:\d{2}$/.test(ev.start || '')) return 'Choisis une heure de début.';
  if (ev.type !== 'rendu' && toMin(ev.end) <= toMin(ev.start)) return "L'heure de fin doit être après le début.";
  if (ev.repeat === 'weekly' && ev.until && ev.until < ev.date) return 'La fin de la répétition doit être après la date de début.';
  return null;
}

/* ---------- Synchronisation avec l'API ---------- */
const KEYS = { token: 'agenda:token', user: 'agenda:user', events: 'agenda:events', lastSync: 'agenda:lastSync', outbox: 'agenda:outbox', apiUrl: 'agenda:apiUrl' };
const USER_FIELDS = ['id', 'title', 'type', 'date', 'start', 'end', 'location', 'notes', 'alarms', 'repeat', 'until', 'skip', 'done', 'updatedAt'];
const HP_FIELDS = ['notes', 'alarms', 'done', 'updatedAt'];

/**
 * Moteur de synchronisation « hors ligne d'abord ».
 * storage : { getItem(k), setItem(k, v), removeItem(k) } (localStorage ou AsyncStorage, synchrone ou non).
 * Chaque appareil garde tout en local ; les changements partent dans une file d'envoi rejouée dès que le réseau revient.
 * Conflits : la modification la plus récente (updatedAt) gagne.
 */
export function createSync({ storage, defaultApiUrl = '', fetchImpl = (...a) => fetch(...a), onChange = () => {}, onStatus = () => {}, onAuthLost = () => {} }) {
  const st = { token: null, user: null, events: new Map(), lastSync: 0, outbox: {}, apiUrl: defaultApiUrl, status: 'local', error: null };
  let flushing = null, timer = null, persistT = null;

  const read = async (k, d) => { try { const v = await storage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { return storage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou indisponible */ } };
  const persist = () => {
    clearTimeout(persistT);
    persistT = setTimeout(() => {
      write(KEYS.events, [...st.events.values()]);
      write(KEYS.outbox, st.outbox);
      write(KEYS.lastSync, st.lastSync);
    }, 120);
  };
  const setStatus = (s, err = null) => { st.status = s; st.error = err; onStatus(s, err); };
  const changed = () => { persist(); onChange(api.list()); };
  const base = () => (st.apiUrl || '').replace(/\/+$/, '');

  async function request(method, path, body) {
    if (!base()) throw Object.assign(new Error("Adresse du serveur manquante. Renseigne-la dans les réglages."), { status: 0 });
    let res;
    try {
      res = await fetchImpl(base() + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(st.token ? { Authorization: 'Bearer ' + st.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('Serveur injoignable. Tes changements sont gardés et seront envoyés plus tard.'), { status: 0, offline: true });
    }
    let data = {};
    try { data = await res.json(); } catch { /* corps vide */ }
    if (res.status === 401 && st.token) { await api.logout(true); onAuthLost(); }
    if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status, twoFactor: !!data.twoFactor });
    return data;
  }

  const payload = (ev) => {
    const f = ev.source === 'hp' ? HP_FIELDS : USER_FIELDS;
    const o = {};
    f.forEach((k) => { if (ev[k] !== undefined) o[k] = ev[k]; });
    o.alarms = alarmsOf(ev);
    o.alarm = o.alarms.length ? o.alarms[o.alarms.length - 1] : null; // champ unique conservé pour les anciennes versions
    return o;
  };

  const api = {
    state: st,
    async init() {
      st.token = await read(KEYS.token, null);
      st.user = await read(KEYS.user, null);
      st.lastSync = await read(KEYS.lastSync, 0);
      st.outbox = await read(KEYS.outbox, {});
      st.apiUrl = (await read(KEYS.apiUrl, null)) || defaultApiUrl;
      (await read(KEYS.events, [])).forEach((e) => st.events.set(e.id, e));
      setStatus(st.token ? 'idle' : 'local');
      onChange(api.list());
      return api;
    },
    list: () => [...st.events.values()].filter((e) => !e.deleted),
    get: (id) => st.events.get(id),
    isLoggedIn: () => !!st.token,
    hasLocalData: () => st.events.size > 0,
    async setApiUrl(url) { st.apiUrl = url.trim(); await write(KEYS.apiUrl, st.apiUrl); },

    /**
     * Connexion ou création de compte. Si le compte a la double authentification, le premier essai
     * échoue avec err.twoFactor = true : redemander avec `code` (appli ou code de secours).
     */
    async login(email, password, register = false, code = '') {
      const r = await request('POST', register ? '/auth/register' : '/auth/login', { email, password, ...(code ? { code } : {}) });
      st.token = r.token; st.user = r.user; st.lastSync = 0;
      await write(KEYS.token, st.token); await write(KEYS.user, st.user);
      // Les événements créés hors connexion partent vers le compte.
      [...st.events.values()].forEach((e) => { if (e.source !== 'hp' && !e.demo) st.outbox[e.id] = { op: e.deleted ? 'del' : 'put' }; });
      persist();
      await api.sync();
      return st.user;
    },

    /* Double authentification. Activer ou couper ferme les sessions des autres appareils :
       le serveur renvoie un nouveau jeton pour celui-ci. */
    /** Renvoie { secret, otpauthUrl, qrSvg } pour configurer l'appli d'authentification. */
    twoFactorSetup: () => request('POST', '/me/2fa/setup'),
    /** Valide le premier code et renvoie les codes de secours (à montrer une seule fois). */
    async twoFactorEnable(code) {
      const r = await request('POST', '/me/2fa/enable', { code });
      st.token = r.token; st.user = r.user;
      await write(KEYS.token, st.token); await write(KEYS.user, st.user);
      return r.recoveryCodes;
    },
    async twoFactorDisable(password, code) {
      const r = await request('POST', '/me/2fa/disable', { password, code });
      st.token = r.token; st.user = r.user;
      await write(KEYS.token, st.token); await write(KEYS.user, st.user);
      return st.user;
    },

    async logout(keepData = false) {
      st.token = null; st.user = null; st.lastSync = 0;
      if (!keepData) { st.events.clear(); st.outbox = {}; }
      await storage.removeItem(KEYS.token); await storage.removeItem(KEYS.user);
      setStatus('local');
      changed();
    },

    save(ev) {
      const prev = st.events.get(ev.id);
      const next = { ...prev, ...ev, deleted: false, demo: false, updatedAt: Math.max(Date.now(), (prev?.updatedAt || 0) + 1) };
      st.events.set(next.id, next);
      st.outbox[next.id] = { op: 'put' };
      changed(); api.flush();
      return next;
    },
    remove(id) {
      const prev = st.events.get(id);
      if (!prev) return null;
      if (prev.demo) { st.events.delete(id); changed(); return prev; }
      st.events.set(id, { ...prev, deleted: true, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) });
      st.outbox[id] = { op: 'del' };
      changed(); api.flush();
      return prev;
    },
    /** Ajoute des événements d'exemple, jamais envoyés au serveur. */
    seedDemo(list) { list.forEach((e) => st.events.set(e.id, { ...e, demo: true, updatedAt: 1 })); changed(); },
    clearDemo() { [...st.events.values()].forEach((e) => { if (e.demo) st.events.delete(e.id); }); changed(); },
    hasDemo: () => [...st.events.values()].some((e) => e.demo),

    async flush() {
      if (!st.token) return;
      if (flushing) return flushing;
      flushing = (async () => {
        for (const id of Object.keys(st.outbox)) {
          const ev = st.events.get(id);
          if (!ev || ev.demo) { delete st.outbox[id]; continue; }
          try {
            if (st.outbox[id].op === 'del') await request('DELETE', `/events/${encodeURIComponent(id)}?updatedAt=${ev.updatedAt}`);
            else {
              const r = await request('PUT', `/events/${encodeURIComponent(id)}`, payload(ev));
              if (r.event && (r.event.updatedAt >= (st.events.get(id)?.updatedAt || 0) || !r.applied)) st.events.set(id, r.event);
            }
            delete st.outbox[id];
          } catch (e) {
            if (e.offline || e.status === 0 || e.status >= 500) { setStatus('offline', e.message); break; }
            if (e.status === 401) break;
            delete st.outbox[id];
            setStatus('error', e.message);
          }
        }
        changed();
      })().finally(() => { flushing = null; });
      return flushing;
    },
    /** refreshHp : demande au serveur de réimporter Hyperplanning tout de suite (à l'ouverture de l'app). */
    async pull({ refreshHp = false } = {}) {
      if (!st.token) return;
      const r = await request('GET', `/events?since=${st.lastSync ? st.lastSync - 1 : 0}${refreshHp ? '&refreshHp=1' : ''}`);
      if (!st.lastSync) {
        // Première synchro : on garde seulement les événements locaux encore en attente d'envoi.
        for (const [id, e] of st.events) if (!st.outbox[id] && !e.demo) st.events.delete(id);
      }
      for (const remote of r.events) {
        const local = st.events.get(remote.id);
        if (local && st.outbox[remote.id] && local.updatedAt > remote.updatedAt) continue;
        if (remote.deleted) st.events.delete(remote.id); else st.events.set(remote.id, remote);
      }
      st.lastSync = r.serverTime;
      if (r.user) { st.user = r.user; write(KEYS.user, st.user); }
      changed();
    },
    async sync(opts = {}) {
      if (!st.token) return;
      setStatus('syncing');
      try {
        await api.flush();
        await api.pull(opts);
        if (st.status === 'syncing') setStatus('ok');
      } catch (e) {
        setStatus(e.offline || e.status === 0 ? 'offline' : 'error', e.message);
      }
    },
    start(everyMs = 30000) { clearInterval(timer); timer = setInterval(() => api.sync(), everyMs); api.sync({ refreshHp: true }); },
    stop() { clearInterval(timer); },

    async setHyperplanning(url) {
      const r = await request('PUT', '/me/hyperplanning', { url: url || null });
      st.user = r.user; write(KEYS.user, st.user);
      await api.pull();
      return r;
    },
    async syncHyperplanning() {
      const r = await request('POST', '/me/hyperplanning/sync');
      await api.pull();
      return r;
    },
    /** Applique les mêmes alarmes à tous les cours Hyperplanning (et aux prochains importés). */
    async setHpAlarms(alarms) {
      const r = await request('PUT', '/me/hyperplanning/alarms', { alarms });
      st.user = r.user; write(KEYS.user, st.user);
      await api.pull();
      return r;
    },
    async deleteAccount() { await request('DELETE', '/me'); await api.logout(); },
  };
  return api;
}

/* ---------- Exemples (premier lancement sans compte) ---------- */
export function makeDemo() {
  const M = sow(today0()), k = (n) => key(addDays(M, n)), until = key(addDays(M, 7 * 8)), from = addDays(M, -14);
  const id = (t, d) => 'demo-' + t.replace(/\W+/g, '').slice(0, 14) + d;
  const w = (t, ty, dd, s, e, loc, notes = '') => ({ id: id(t, dd), title: t, type: ty, date: key(addDays(from, dd)), start: s, end: e, location: loc, notes, alarms: defaultAlarms(ty), repeat: 'weekly', until, skip: [], done: false });
  const o = (t, ty, dd, s, e, loc, notes = '') => ({ id: id(t, dd), title: t, type: ty, date: k(dd), start: s, end: e, location: loc, notes, alarms: defaultAlarms(ty), repeat: 'none', until: '', skip: [], done: false });
  return [
    w('Stratégie de communication (CM)', 'cours', 0, '08:30', '10:30', 'Amphi A'),
    w('SAÉ 5.01 projet client', 'sae', 0, '13:30', '16:30', 'Salle 112', "Point d'avancement avec le client tous les 15 jours"),
    w('TP Développement front React', 'cours', 1, '09:00', '12:00', 'Salle info 204'),
    w('TD UX design et tests utilisateurs', 'cours', 1, '14:00', '16:00', 'Salle 108'),
    w('Anglais professionnel', 'cours', 2, '10:00', '12:00', 'Salle 015'),
    w('TP Motion design et 3D', 'cours', 3, '08:30', '11:30', 'Labo audiovisuel'),
    w('SAÉ 5.02 portfolio', 'sae', 3, '14:00', '17:00', 'Fablab'),
    w('Droit du numérique (CM)', 'cours', 4, '09:00', '11:00', 'Amphi B'),
    o('Entretien alternance en agence', 'stage', 2, '14:30', '15:30', 'Visio Teams', 'Préparer le portfolio et 3 projets à présenter'),
    o('Escalade avec le BDE', 'perso', 3, '18:30', '20:00', 'Salle de bloc'),
    o('Rendu maquettes Figma SAÉ 5.01', 'rendu', 4, '23:59', '23:59', 'Moodle', 'Lien Figma en lecture + PDF de 10 pages max'),
    o('Game jam MMI', 'perso', 5, '10:00', '18:00', 'Bâtiment MMI'),
    o('Dépôt dossier recherche de stage', 'rendu', 9, '18:00', '18:00', 'Moodle'),
    o('Évaluation gestion de projet', 'eval', 10, '10:00', '12:00', 'Salle 112', 'QCM + étude de cas'),
    o('Soutenance SAÉ 5.01', 'eval', 15, '09:00', '12:00', 'Salle 112'),
  ];
}
