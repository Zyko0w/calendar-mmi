import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, close } from '../src/db.js';
import { createApp } from '../src/app.js';
import { toEvents } from '../src/hyperplanning.js';
import { hotp, stepAt, verifyTotp, base32Decode, base32Encode } from '../src/totp.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Index Education//HYPERPLANNING//FR
BEGIN:VEVENT
UID:Cours-123@hyperplanning
DTSTART:${stamp(1, 8, 30)}
DTEND:${stamp(1, 10, 30)}
SUMMARY:Développement web - DUPONT - B204 - TP
LOCATION:B204
DESCRIPTION:Matière : Développement web\\nEnseignant : DUPONT Marie\\nTD : MMI3 G1\\nSalle : B204\\nType : TP
END:VEVENT
BEGIN:VEVENT
UID:Cours-124@hyperplanning
DTSTART:${stamp(2, 13, 0)}
DTEND:${stamp(2, 15, 0)}
SUMMARY:DS Gestion de projet
LOCATION:Amphi A
END:VEVENT
END:VCALENDAR`;

function stamp(days, h, m) {
  const d = new Date(Date.now() + days * 864e5);
  d.setUTCHours(h - 1, m, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

let mongo, server, base, icsBody = ICS;

before(async () => {
  // MONGO_TEST_URI permet de tester contre une base existante ; sinon une base en mémoire est lancée.
  if (!process.env.MONGO_TEST_URI) mongo = await MongoMemoryServer.create();
  const db = await connect(process.env.MONGO_TEST_URI || mongo.getUri(), 'test_' + Date.now());
  const fakeFetch = async () => new Response(icsBody, { status: 200 });
  const app = createApp(db, { jwtSecret: 'x'.repeat(32), authLimit: 1000, hpOptions: { fetchImpl: fakeFetch, skipHostCheck: true } });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await close(); await mongo?.stop(); });

const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

test('parse Hyperplanning', () => {
  const evs = toEvents(ICS);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].title, 'Développement web (TP)');
  assert.equal(evs[0].start, '08:30');
  assert.equal(evs[0].location, 'B204');
  assert.match(evs[0].hpInfo, /DUPONT Marie/);
  assert.equal(evs[1].type, 'eval');
});

test('parcours complet', async () => {
  let r = await call('POST', '/auth/register', { email: 'Etu@iut.fr', password: 'motdepasse1' });
  assert.equal(r.status, 201);
  const token = r.body.token;
  r = await call('POST', '/auth/register', { email: 'etu@iut.fr', password: 'motdepasse1' });
  assert.equal(r.status, 409);
  r = await call('POST', '/auth/login', { email: 'etu@iut.fr', password: 'mauvais00' });
  assert.equal(r.status, 401);

  const ev = { id: 'e1', title: 'Rendu Figma', type: 'rendu', date: '2026-11-06', start: '23:59', end: '23:59', alarm: 1440, alarms: [10080, 1440], updatedAt: 1000 };
  r = await call('PUT', '/events/e1', ev, token);
  assert.equal(r.body.applied, true);
  assert.deepEqual(r.body.event.alarms, [10080, 1440]);
  r = await call('PUT', '/events/e1', { ...ev, title: 'Ancien', updatedAt: 500 }, token);
  assert.equal(r.body.applied, false);
  r = await call('PUT', '/events/e2', { ...ev, id: 'e2', type: 'cours', start: '10:00', end: '09:00', updatedAt: 1 }, token);
  assert.equal(r.status, 400);

  r = await call('PUT', '/me/hyperplanning', { url: 'https://hp.iut.fr/hp/Telechargements/ical/Edt.ics?idICal=X' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.count, 2);

  r = await call('GET', '/events', null, token);
  assert.equal(r.body.events.length, 3);
  const since = r.body.serverTime;
  const hp = r.body.events.find((e) => e.source === 'hp' && e.type === 'cours');
  r = await call('PUT', '/events/' + hp.id, { ...hp, title: 'Piraté', notes: 'Apporter le casque', updatedAt: Date.now() + 10 }, token);
  assert.equal(r.body.event.title, 'Développement web (TP)');
  assert.equal(r.body.event.notes, 'Apporter le casque');

  icsBody = ICS.replace(/BEGIN:VEVENT\nUID:Cours-124[\s\S]*?END:VEVENT\n/, '');
  // Moins d'une minute après le dernier import : pas de nouvel appel à Hyperplanning.
  r = await call('POST', '/me/hyperplanning/sync', null, token);
  assert.equal(r.body.result.skipped, true);
  // Écart minimum dépassé : l'ouverture de l'app (refreshHp=1) réimporte et renvoie directement le changement.
  process.env.HP_MIN_GAP_SEC = '0.001';
  await new Promise((ok) => setTimeout(ok, 5));
  r = await call('GET', '/events?refreshHp=1&since=' + since, null, token);
  assert.equal(r.body.user.hpCount, 1);
  r = await call('GET', '/events?since=' + since, null, token);
  assert.ok(r.body.events.some((e) => e.deleted && e.type === 'eval'));
  assert.ok(r.body.events.some((e) => e.notes === 'Apporter le casque'));

  r = await call('DELETE', '/events/e1?updatedAt=' + (Date.now() + 20), null, token);
  assert.equal(r.body.applied, true);
  r = await call('GET', '/events', null, token);
  assert.equal(r.body.events.length, 1);
  r = await call('GET', '/events', null, 'faux');
  assert.equal(r.status, 401);
});

test('alarmes de tous les cours Hyperplanning', async () => {
  icsBody = ICS;
  const url = 'https://hp.iut.fr/hp/Telechargements/ical/Edt.ics?idICal=Y';
  let r = await call('POST', '/auth/register', { email: 'c@iut.fr', password: 'motdepasse1' });
  const token = r.body.token;
  assert.deepEqual(r.body.user.hpAlarms, [10]);
  await call('PUT', '/me/hyperplanning', { url }, token);
  r = await call('GET', '/events', null, token);
  assert.ok(r.body.events.every((e) => e.alarms.length === 1 && e.alarms[0] === 10));

  r = await call('PUT', '/me/hyperplanning/alarms', { alarms: [60, 1440] }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 2);
  assert.deepEqual(r.body.user.hpAlarms, [1440, 60]);
  r = await call('GET', '/events', null, token);
  for (const e of r.body.events) { assert.deepEqual(e.alarms, [1440, 60]); assert.equal(e.alarm, 60); }
  r = await call('PUT', '/me/hyperplanning/alarms', { alarms: [99999] }, token);
  assert.equal(r.status, 400);

  // Réglé avant l'import : les nouveaux cours reçoivent directement ces alarmes, même « aucune ».
  r = await call('POST', '/auth/register', { email: 'd@iut.fr', password: 'motdepasse1' });
  const t2 = r.body.token;
  r = await call('PUT', '/me/hyperplanning/alarms', { alarms: [] }, t2);
  assert.equal(r.body.count, 0);
  await call('PUT', '/me/hyperplanning', { url }, t2);
  r = await call('GET', '/events', null, t2);
  assert.equal(r.body.events.length, 2);
  assert.ok(r.body.events.every((e) => e.alarms.length === 0 && e.alarm === null));
});

test('refuse les liens non https', async () => {
  const r0 = await call('POST', '/auth/register', { email: 'b@iut.fr', password: 'motdepasse1' });
  const r = await call('PUT', '/me/hyperplanning', { url: 'http://localhost/x.ics' }, r0.body.token);
  assert.equal(r.status, 400);
});

test('TOTP : vecteur de la RFC 6238', () => {
  // Secret ASCII « 12345678901234567890 », instant 59 s → 94287082 (8 chiffres), donc 287082 sur 6.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(hotp(secret, stepAt(59e3)), '287082');
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  assert.equal(verifyTotp(secret, '287082', { now: 59e3 }), 1);
  assert.equal(verifyTotp(secret, '287082', { now: 59e3, afterStep: 1 }), null);
});

test('double authentification', async () => {
  const creds = { email: 'deux@iut.fr', password: 'motdepasse1' };
  let r = await call('POST', '/auth/register', creds);
  const t1 = r.body.token;
  assert.equal(r.body.user.twoFactor, false);
  // Deuxième appareil déjà connecté : il sera déconnecté à l'activation.
  const other = (await call('POST', '/auth/login', creds)).body.token;

  r = await call('POST', '/me/2fa/setup', null, t1);
  assert.equal(r.status, 200);
  assert.match(r.body.otpauthUrl, /^otpauth:\/\/totp\/Agend-A:deux%40iut\.fr\?secret=[A-Z2-7]+&issuer=Agend-A/);
  assert.match(r.body.qrSvg, /^<svg/);
  const secret = r.body.secret.replace(/\s/g, '');
  const code = (dStep = 0) => hotp(secret, stepAt() + dStep);

  r = await call('POST', '/me/2fa/enable', { code: '000000' === code() ? '111111' : '000000' }, t1);
  assert.equal(r.status, 400);
  r = await call('POST', '/me/2fa/enable', { code: code(-1) }, t1);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.twoFactor, true);
  assert.equal(r.body.recoveryCodes.length, 8);
  const t2 = r.body.token, recovery = r.body.recoveryCodes;
  assert.equal((await call('GET', '/me', null, t1)).status, 401, 'ancienne session fermée');
  assert.equal((await call('GET', '/me', null, other)).status, 401, 'autre appareil déconnecté');
  assert.equal((await call('GET', '/me', null, t2)).status, 200);
  assert.equal((await call('POST', '/me/2fa/setup', null, t2)).status, 409);

  // Connexion : mot de passe seul refusé avec twoFactor, mauvais mot de passe sans le révéler.
  r = await call('POST', '/auth/login', creds);
  assert.equal(r.status, 401);
  assert.equal(r.body.twoFactor, true);
  r = await call('POST', '/auth/login', { ...creds, password: 'mauvais00', code: code() });
  assert.equal(r.status, 401);
  assert.equal(r.body.twoFactor, undefined);
  r = await call('POST', '/auth/login', { ...creds, code: code() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // Le même code ne sert qu'une fois.
  r = await call('POST', '/auth/login', { ...creds, code: code() });
  assert.equal(r.status, 401);

  // Code de secours : accepté une seule fois, minuscules et sans tiret tolérés.
  r = await call('POST', '/auth/login', { ...creds, code: recovery[0].toLowerCase().replace('-', '') });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.recoveryLeft, 7);
  r = await call('POST', '/auth/login', { ...creds, code: recovery[0] });
  assert.equal(r.status, 401);
  const t3 = (await call('POST', '/auth/login', { ...creds, code: recovery[1] })).body.token;

  // Désactivation : mot de passe faux refusé, puis mot de passe et code de secours.
  r = await call('POST', '/me/2fa/disable', { password: 'mauvais00', code: recovery[2] }, t3);
  assert.equal(r.status, 403);
  r = await call('POST', '/me/2fa/disable', { password: creds.password, code: recovery[2] }, t3);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.twoFactor, false);
  r = await call('POST', '/auth/login', creds);
  assert.equal(r.status, 200);
});

test('blocage après 5 codes faux', async () => {
  const creds = { email: 'bloc@iut.fr', password: 'motdepasse1' };
  const t = (await call('POST', '/auth/register', creds)).body.token;
  const secret = (await call('POST', '/me/2fa/setup', null, t)).body.secret.replace(/\s/g, '');
  await call('POST', '/me/2fa/enable', { code: hotp(secret, stepAt()) }, t);
  const bad = String((Number(hotp(secret, stepAt() + 1)) + 1) % 1e6).padStart(6, '0');
  for (let i = 0; i < 5; i++) await call('POST', '/auth/login', { ...creds, code: bad === hotp(secret, stepAt() + 1) ? '123456' : bad });
  const r = await call('POST', '/auth/login', { ...creds, code: hotp(secret, stepAt() + 1) });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /Trop de codes faux/);
});

test('limite de tentatives par adresse IP', async () => {
  const db = (await import('../src/db.js'));
  const app = createApp(await db.connect(), { jwtSecret: 'y'.repeat(32), authLimit: 3 });
  const s = app.listen(0);
  const url = `http://127.0.0.1:${s.address().port}/auth/login`;
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"x@iut.fr","password":"mauvais00"}' })).status);
  s.close();
  assert.deepEqual(codes, [401, 401, 401, 429]);
});
