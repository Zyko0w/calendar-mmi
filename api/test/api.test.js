import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, close } from '../src/db.js';
import { createApp } from '../src/app.js';
import { toEvents } from '../src/hyperplanning.js';

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
  const app = createApp(db, { jwtSecret: 'x'.repeat(32), hpOptions: { fetchImpl: fakeFetch, skipHostCheck: true } });
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

test('refuse les liens non https', async () => {
  const r0 = await call('POST', '/auth/register', { email: 'b@iut.fr', password: 'motdepasse1' });
  const r = await call('PUT', '/me/hyperplanning', { url: 'http://localhost/x.ics' }, r0.body.token);
  assert.equal(r.status, 400);
});
