// Parcours de bout en bout : le noyau partagé des applis (shared/core.js) contre l'API réelle.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createApp } from '../src/app.js';
import { hotp, stepAt } from '../src/totp.js';
import { createSync } from '../../shared/core.js';

let mongo, client, server, base;
before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await new MongoClient(mongo.getUri()).connect();
  const db = client.db('client_' + Date.now());
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  server = createApp(db, { jwtSecret: 'z'.repeat(32), authLimit: 1000 }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await client.close(); await mongo.stop(); });

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const device = async () => {
  let lost = 0;
  const s = await createSync({ storage: memStorage(), defaultApiUrl: base, onAuthLost: () => { lost++; } }).init();
  return { s, lost: () => lost };
};

test('appli : activation, connexion avec code, autres appareils déconnectés', async () => {
  const email = 'appli@iut.fr', pwd = 'motdepasse1';
  const phone = await device();
  await phone.s.login(email, pwd, true);
  const pc = await device();
  await pc.s.login(email, pwd);

  const setup = await phone.s.twoFactorSetup();
  const secret = setup.secret.replace(/\s/g, '');
  const codes = await phone.s.twoFactorEnable(hotp(secret, stepAt()));
  assert.equal(codes.length, 8);
  assert.equal(phone.s.state.user.twoFactor, true);
  await phone.s.sync();
  assert.equal(phone.s.isLoggedIn(), true, 'le téléphone garde sa session (nouveau jeton)');

  await pc.s.sync();
  assert.equal(pc.s.isLoggedIn(), false, 'le PC est déconnecté');
  assert.equal(pc.lost(), 1);

  await assert.rejects(pc.s.login(email, pwd), (e) => e.twoFactor === true);
  await pc.s.login(email, pwd, false, hotp(secret, stepAt() + 1));
  assert.equal(pc.s.isLoggedIn(), true);

  // Mot de passe faux à la désactivation : erreur affichée, mais pas de déconnexion.
  await assert.rejects(pc.s.twoFactorDisable('mauvais00', codes[0]), /Mot de passe incorrect/);
  assert.equal(pc.s.isLoggedIn(), true);
  assert.equal(pc.lost(), 1, "toujours une seule déconnexion : celle due à l'activation");

  await pc.s.twoFactorDisable(pwd, codes[0]);
  assert.equal(pc.s.state.user.twoFactor, false);
  const third = await device();
  await third.s.login(email, pwd);
  assert.equal(third.s.isLoggedIn(), true);
});
