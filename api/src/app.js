import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import QRCode from 'qrcode';
import { eventSchema, hpPatchSchema, credentialsSchema, hpUrlSchema, hpAlarmsSchema, twoFactorCodeSchema, twoFactorDisableSchema, normAlarms, issues } from './schemas.js';
import { newSecret, verifyTotp, otpauthUrl, seal, unseal, newRecoveryCodes, hashRecovery, looksLikeRecovery } from './totp.js';
import { normalizeUrl, syncUser, refreshMs, minGapMs } from './hyperplanning.js';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref?.(); });

const publicEvent = (e) => {
  const { _id, userId, serverUpdatedAt, hpHash, ...rest } = e;
  return rest;
};
const publicUser = (u) => ({
  email: u.email,
  hpUrl: u.hpUrl || null,
  hpLastSync: u.hpLastSync || null,
  hpError: u.hpError || null,
  hpCount: u.hpCount || 0,
  hpAlarms: normAlarms(u.hpAlarms),
  twoFactor: !!u.totpEnabled,
  recoveryLeft: u.totpEnabled ? (u.recoveryHashes || []).length : 0,
});

// Après 5 codes faux d'affilée, la double authentification du compte est bloquée 15 minutes.
const MAX_CODE_FAILS = 5;
const CODE_LOCK_MS = 15 * 60e3;

export function createApp(db, { jwtSecret = process.env.JWT_SECRET, totpKey = process.env.TOTP_KEY || jwtSecret, authLimit = 30, hpOptions = {} } = {}) {
  if (!jwtSecret || jwtSecret.length < 16) throw new Error('JWT_SECRET manquant ou trop court (16 caractères minimum).');
  const users = db.collection('users');
  const events = db.collection('events');
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  app.use(express.json({ limit: '200kb' }));

  // sv (version de session) : activer ou couper la double authentification déconnecte les autres appareils.
  const sign = (u) => jwt.sign({ sub: String(u._id), sv: u.sv || 0 }, jwtSecret, { expiresIn: '120d' });
  const authLimiter = rateLimit({ windowMs: 15 * 60e3, limit: authLimit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives, réessaie dans quelques minutes.' } });

  const auth = async (req, res, next) => {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Connexion requise.' });
    try {
      const { sub, sv = 0 } = jwt.verify(token, jwtSecret);
      const user = await users.findOne({ _id: new ObjectId(sub) });
      if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
      if ((user.sv || 0) !== sv) return res.status(401).json({ error: 'Session fermée, reconnecte-toi.' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
    }
  };

  /**
   * Vérifie un code de double authentification (appli ou code de secours) et le consomme.
   * Renvoie null si c'est bon, sinon le message d'erreur à afficher.
   */
  const checkSecondFactor = async (u, code) => {
    if (u.totpLockedUntil > Date.now()) return 'Trop de codes faux. Réessaie dans quelques minutes.';
    let ok = false;
    if (looksLikeRecovery(code)) {
      const h = hashRecovery(code);
      const r = await users.updateOne({ _id: u._id, recoveryHashes: h }, { $pull: { recoveryHashes: h } });
      ok = r.modifiedCount === 1;
    } else {
      const step = verifyTotp(unseal(u.totpSecret, totpKey), code, { afterStep: u.totpLastStep ?? -1 });
      // Condition sur le dernier pas : deux requêtes simultanées avec le même code ne passent pas toutes les deux.
      if (step !== null) {
        const r = await users.updateOne(
          { _id: u._id, $or: [{ totpLastStep: { $exists: false } }, { totpLastStep: { $lt: step } }] },
          { $set: { totpLastStep: step } },
        );
        ok = r.modifiedCount === 1;
      }
    }
    if (ok) {
      if (u.totpFails) await users.updateOne({ _id: u._id }, { $set: { totpFails: 0 } });
      return null;
    }
    const fails = (u.totpFails || 0) + 1;
    await users.updateOne({ _id: u._id }, { $set: fails >= MAX_CODE_FAILS ? { totpFails: 0, totpLockedUntil: Date.now() + CODE_LOCK_MS } : { totpFails: fails } });
    return 'Code incorrect ou déjà utilisé.';
  };

  app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

  /* ---------- Comptes ---------- */
  app.post('/auth/register', authLimiter, async (req, res) => {
    const p = credentialsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: issues(p.error) });
    const { email, password } = p.data;
    const doc = { email, passwordHash: await bcrypt.hash(password, 11), createdAt: Date.now(), hpUrl: null };
    try {
      const r = await users.insertOne(doc);
      doc._id = r.insertedId;
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail. Connecte-toi.' });
      throw e;
    }
    res.status(201).json({ token: sign(doc), user: publicUser(doc) });
  });

  app.post('/auth/login', authLimiter, async (req, res) => {
    const p = credentialsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'E-mail ou mot de passe incorrect.' });
    const u = await users.findOne({ email: p.data.email });
    if (!u || !(await bcrypt.compare(p.data.password, u.passwordHash))) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
    if (u.totpEnabled) {
      // Mot de passe bon : on demande le second facteur. L'appli renvoie e-mail, mot de passe et code.
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code) return res.status(401).json({ error: "Entre le code de ton appli d'authentification.", twoFactor: true });
      const bad = await checkSecondFactor(u, code);
      if (bad) return res.status(401).json({ error: bad, twoFactor: true });
      return res.json({ token: sign(u), user: publicUser(await users.findOne({ _id: u._id })) });
    }
    res.json({ token: sign(u), user: publicUser(u) });
  });

  app.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  /* ---------- Double authentification ---------- */
  // 1. Nouveau secret, gardé « en attente » tant qu'un premier code n'a pas été validé.
  app.post('/me/2fa/setup', authLimiter, auth, async (req, res) => {
    if (req.user.totpEnabled) return res.status(409).json({ error: 'La double authentification est déjà activée.' });
    const secret = newSecret();
    await users.updateOne({ _id: req.user._id }, { $set: { totpPending: seal(secret, totpKey) } });
    const url = otpauthUrl(secret, req.user.email);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.json({ secret: secret.replace(/(.{4})/g, '$1 ').trim(), otpauthUrl: url, qrSvg });
  });

  // 2. Premier code valide : activation, codes de secours (montrés une seule fois) et nouvelle session.
  app.post('/me/2fa/enable', authLimiter, auth, async (req, res) => {
    const p = twoFactorCodeSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Entre le code à 6 chiffres affiché par ton appli.' });
    if (req.user.totpEnabled) return res.status(409).json({ error: 'La double authentification est déjà activée.' });
    if (!req.user.totpPending) return res.status(400).json({ error: 'Recommence la configuration.' });
    const step = verifyTotp(unseal(req.user.totpPending, totpKey), p.data.code);
    if (step === null) return res.status(400).json({ error: "Code incorrect. Vérifie que l'heure de ton téléphone est automatique, puis réessaie." });
    const codes = newRecoveryCodes();
    await users.updateOne({ _id: req.user._id }, {
      $set: { totpEnabled: true, totpSecret: req.user.totpPending, totpLastStep: step, recoveryHashes: codes.map(hashRecovery), totpFails: 0, sv: (req.user.sv || 0) + 1 },
      $unset: { totpPending: '' },
    });
    const u = await users.findOne({ _id: req.user._id });
    res.json({ token: sign(u), user: publicUser(u), recoveryCodes: codes });
  });

  // Désactivation : mot de passe et code (ou code de secours) exigés.
  app.post('/me/2fa/disable', authLimiter, auth, async (req, res) => {
    const p = twoFactorDisableSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Mot de passe et code requis.' });
    if (!req.user.totpEnabled) return res.json({ token: sign(req.user), user: publicUser(req.user) });
    if (!(await bcrypt.compare(p.data.password, req.user.passwordHash))) return res.status(403).json({ error: 'Mot de passe incorrect.' });
    const bad = await checkSecondFactor(req.user, p.data.code);
    if (bad) return res.status(403).json({ error: bad });
    await users.updateOne({ _id: req.user._id }, {
      $set: { totpEnabled: false, sv: (req.user.sv || 0) + 1 },
      $unset: { totpSecret: '', totpPending: '', totpLastStep: '', recoveryHashes: '', totpFails: '', totpLockedUntil: '' },
    });
    const u = await users.findOne({ _id: req.user._id });
    res.json({ token: sign(u), user: publicUser(u) });
  });

  app.delete('/me', auth, async (req, res) => {
    await events.deleteMany({ userId: req.user._id });
    await users.deleteOne({ _id: req.user._id });
    res.json({ ok: true });
  });

  /* ---------- Hyperplanning ---------- */
  app.put('/me/hyperplanning', auth, async (req, res) => {
    const p = hpUrlSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: issues(p.error) });
    if (p.data.url === null || p.data.url === '') {
      await users.updateOne({ _id: req.user._id }, { $set: { hpUrl: null, hpError: null } });
      const now = Date.now();
      await events.updateMany({ userId: req.user._id, source: 'hp', deleted: { $ne: true } }, { $set: { deleted: true, serverUpdatedAt: now, updatedAt: now } });
      return res.json({ user: publicUser({ ...req.user, hpUrl: null, hpError: null }) });
    }
    let url;
    try { url = normalizeUrl(p.data.url); } catch (e) { return res.status(400).json({ error: e.message }); }
    const user = { ...req.user, hpUrl: url };
    const result = await syncUser(db, user, { ...hpOptions, force: true });
    if (!result.ok) return res.status(422).json({ error: result.error });
    await users.updateOne({ _id: req.user._id }, { $set: { hpUrl: url } });
    res.json({ result, user: publicUser(await users.findOne({ _id: req.user._id })) });
  });

  app.post('/me/hyperplanning/sync', auth, async (req, res) => {
    if (!req.user.hpUrl) return res.status(400).json({ error: "Aucun lien Hyperplanning enregistré." });
    const result = await syncUser(db, req.user, hpOptions);
    res.status(result.ok ? 200 : 422).json(result.ok ? { result } : { error: result.error });
  });

  // Change d'un coup les alarmes de tous les cours Hyperplanning, et les garde pour les prochains imports.
  app.put('/me/hyperplanning/alarms', auth, async (req, res) => {
    const p = hpAlarmsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: issues(p.error) });
    const alarms = normAlarms(p.data.alarms);
    const now = Date.now();
    await users.updateOne({ _id: req.user._id }, { $set: { hpAlarms: alarms } });
    const r = await events.updateMany(
      { userId: req.user._id, source: 'hp', deleted: { $ne: true } },
      { $set: { alarms, alarm: alarms.length ? alarms[alarms.length - 1] : null, updatedAt: now, serverUpdatedAt: now } },
    );
    res.json({ count: r.modifiedCount, user: publicUser({ ...req.user, hpAlarms: alarms }) });
  });

  /* ---------- Événements ---------- */
  app.get('/events', auth, async (req, res) => {
    const since = Number(req.query.since) || 0;
    let u = req.user;
    // refreshHp=1 : l'app vient d'être ouverte. On réimporte si le dernier import a plus d'une minute,
    // et on attend jusqu'à 8 s pour renvoyer directement les cours à jour.
    const age = u.hpLastSync ? Date.now() - u.hpLastSync : Infinity;
    const wanted = req.query.refreshHp === '1' ? age > minGapMs() : age > refreshMs();
    if (u.hpUrl && wanted) {
      const job = syncUser(db, u, hpOptions).catch(() => null);
      if (req.query.refreshHp === '1') {
        await Promise.race([job, sleep(8000)]);
        u = (await users.findOne({ _id: u._id })) || u;
      }
    }
    const serverTime = Date.now();
    const q = { userId: u._id };
    if (since) q.serverUpdatedAt = { $gt: since };
    else q.deleted = { $ne: true };
    const list = await events.find(q).limit(5000).toArray();
    res.json({ events: list.map(publicEvent), serverTime, user: publicUser(u) });
  });

  app.put('/events/:id', auth, async (req, res) => {
    const id = req.params.id;
    const existing = await events.findOne({ userId: req.user._id, id });
    if (existing && existing.updatedAt > Number(req.body?.updatedAt)) {
      return res.json({ applied: false, event: publicEvent(existing) });
    }
    const now = Date.now();
    if (existing?.source === 'hp') {
      const p = hpPatchSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: issues(p.error) });
      await events.updateOne({ _id: existing._id }, { $set: { ...p.data, deleted: false, serverUpdatedAt: now } });
    } else {
      const p = eventSchema.safeParse({ ...req.body, id });
      if (!p.success) return res.status(400).json({ error: issues(p.error) });
      if (id.startsWith('hp-')) return res.status(400).json({ error: 'Identifiant réservé.' });
      if (p.data.type !== 'rendu' && p.data.end <= p.data.start) return res.status(400).json({ error: "L'heure de fin doit être après le début." });
      await events.updateOne(
        { userId: req.user._id, id },
        { $set: { ...p.data, source: 'user', deleted: false, serverUpdatedAt: now }, $setOnInsert: { userId: req.user._id } },
        { upsert: true },
      );
    }
    res.json({ applied: true, event: publicEvent(await events.findOne({ userId: req.user._id, id })) });
  });

  app.delete('/events/:id', auth, async (req, res) => {
    const updatedAt = Number(req.query.updatedAt) || Date.now();
    const now = Date.now();
    const r = await events.updateOne(
      { userId: req.user._id, id: req.params.id, updatedAt: { $lte: updatedAt } },
      { $set: { deleted: true, updatedAt, serverUpdatedAt: now } },
    );
    res.json({ applied: r.modifiedCount > 0 });
  });

  app.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide.' });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  });
  return app;
}
