import { MongoClient } from 'mongodb';

let client;
let db;

export async function connect(uri = process.env.MONGODB_URI, name = process.env.MONGODB_DB || 'agenda_mmi') {
  if (db) return db;
  if (!uri) throw new Error('MONGODB_URI manquant : renseigne la chaîne de connexion Atlas.');
  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  db = client.db(name);
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('events').createIndex({ userId: 1, id: 1 }, { unique: true }),
    db.collection('events').createIndex({ userId: 1, serverUpdatedAt: 1 }),
    db.collection('users').createIndex({ hpUrl: 1, hpLastSync: 1 }),
  ]);
  return db;
}

export async function close() {
  await client?.close();
  client = undefined;
  db = undefined;
}
