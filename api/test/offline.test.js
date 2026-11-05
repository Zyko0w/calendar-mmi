// Serveur en panne : l'appli garde tout en local, puis envoie les changements quand il revient.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createApp } from '../src/app.js';
import { createSync } from '../../shared/core.js';

let mongo, client, app, server, port;
const start = () => new Promise((ok) => { server = app.listen(port || 0, () => { port = server.address().port; ok(); }); });
const stop = () => new Promise((ok) => { server.closeAllConnections(); server.close(ok); });

before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await new MongoClient(mongo.getUri()).connect();
  const db = client.db('offline_' + Date.now());
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  app = createApp(db, { jwtSecret: 'o'.repeat(32), authLimit: 1000 });
  await start();
});
after(async () => { await stop(); await client.close(); await mongo.stop(); });

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const ev = (id, title) => ({ id, title, type: 'cours', date: '2026-11-10', start: '10:00', end: '12:00', location: '', notes: '', alarms: [10], repeat: 'none', until: '', skip: [], done: false });

test('serveur en panne puis rétabli', async () => {
  const storage = memStorage();
  const statuses = [];
  let phone = await createSync({ storage, defaultApiUrl: `http://127.0.0.1:${port}`, onStatus: (s) => statuses.push(s) }).init();
  await phone.login('panne@iut.fr', 'motdepasse1', true);
  phone.save(ev('a', 'Ajouté avant la panne'));
  phone.save(ev('b', 'À supprimer pendant la panne'));
  await phone.flush();

  await stop();

  // Tout reste visible, même après fermeture et réouverture de l'appli (relecture du stockage local).
  await phone.sync();
  assert.equal(phone.state.status, 'offline');
  assert.equal(phone.isLoggedIn(), true, 'pas de déconnexion quand le serveur est injoignable');
  phone.save(ev('c', 'Ajouté pendant la panne'));
  phone.save({ ...phone.get('a'), title: 'Modifié pendant la panne' });
  phone.remove('b');
  await phone.sync();
  await new Promise((r) => setTimeout(r, 200)); // écriture différée du stockage local
  phone.stop();
  phone = await createSync({ storage, defaultApiUrl: `http://127.0.0.1:${port}` }).init();
  assert.deepEqual(phone.list().map((e) => e.title).sort(), ['Ajouté pendant la panne', 'Modifié pendant la panne']);
  assert.deepEqual(Object.keys(phone.state.outbox).sort(), ['a', 'b', 'c'], 'changements en attente d\'envoi');

  await start();
  await phone.sync(); // ce que fait la synchro automatique toutes les 30 s ou au retour dans l'appli
  assert.equal(phone.state.status, 'ok');
  assert.deepEqual(phone.state.outbox, {});

  // Un autre appareil voit bien les changements faits pendant la panne.
  const pc = await createSync({ storage: memStorage(), defaultApiUrl: `http://127.0.0.1:${port}` }).init();
  await pc.login('panne@iut.fr', 'motdepasse1');
  assert.deepEqual(pc.list().map((e) => e.title).sort(), ['Ajouté pendant la panne', 'Modifié pendant la panne']);
});
