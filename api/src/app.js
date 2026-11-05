import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { eventSchema, hpPatchSchema, credentialsSchema, hpUrlSchema, issues } from './schemas.js';
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
});

export function createApp(db, { jwtSecret = process.env.JWT_SECRET, hpOptions = {} } = {}) {
  if (!jwtSecret || jwtSecret.length < 16) throw new Error('JWT_SECRET manquant ou trop court (16 caractères minimum).');
  const users = db.collection('users');
  const events = db.collection('events');
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  app.use(express.json({ limit: '200kb' }));

  const sign = (u) => jwt.sign({ sub: String(u._id) }, jwtSecret, { expiresIn: '120d' });
  const authLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives, réessaie dans quelques minutes.' } });

  const auth = async (req, res, next) => {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Connexion requise.' });
    try {
      const { sub } = jwt.verify(token, jwtSecret);
      const user = await users.findOne({ _id: new ObjectId(sub) });
      if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
    }
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
    res.json({ token: sign(u), user: publicUser(u) });
  });

  app.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

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
